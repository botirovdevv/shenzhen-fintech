// FeMate virtual card: issuing, and the live approve/decline decision for every purchase
// (Lithic Auth Stream Access). Plain code decides, like Policy Guard; checks run in order and the first failure wins.
import { CURRENCIES, categorize, convertMoney, formatMoney, type Category, type Currency } from '@femate/shared';
import { and, eq, gte, sql } from 'drizzle-orm';

import { audit } from '../audit/audit';
import { accountOfType } from '../bank/mockBank';
import type { Db } from '../db/client';
import { accounts, budgets, cardAuthorizations, cards, transactions, users } from '../db/schema';
import { ApiError } from '../lib/errors';
import { newId } from '../lib/ids';
import { checkSpendingAlerts } from '../notify/spendingAlerts';
import { dayStart, tashkentDate } from '../lib/time';
import type { CardIssuer } from './lithic';

type CardRow = typeof cards.$inferSelect;
type AuthRow = typeof cardAuthorizations.$inferSelect;

export const networkName = (n: CardRow['network']) => (n === 'VISA' ? 'Visa' : 'Mastercard');

export async function userCard(db: Db, userId: string): Promise<CardRow | undefined> {
  const [c] = await db.select().from(cards).where(eq(cards.userId, userId));
  return c;
}

/** Opens a virtual card at Lithic, paid from the user's card account, which is renamed after it ("Visa ·· 4142"). */
export async function issueCard(db: Db, issuer: CardIssuer, userId: string): Promise<CardRow> {
  if (await userCard(db, userId)) throw new ApiError(409, 'CARD_EXISTS', 'You already have a FeMate card.');
  const account = await accountOfType(db, userId, 'card');
  if (!account) throw new ApiError(409, 'BANK_NOT_CONNECTED', 'Connect the sandbox bank first.');
  const [u] = await db.select({ name: users.name }).from(users).where(eq(users.id, userId));
  const issued = await issuer.createCard(`FeMate · ${u?.name ?? userId}`);
  const [card] = await db
    .insert(cards)
    .values({
      id: newId('card'),
      userId,
      accountId: account.id,
      lithicToken: issued.token,
      network: issued.network,
      lastFour: issued.lastFour,
      expMonth: issued.expMonth,
      expYear: issued.expYear,
    })
    .returning();
  await db
    .update(accounts)
    .set({ name: `${networkName(issued.network)} ·· ${issued.lastFour}` })
    .where(eq(accounts.id, account.id));
  await audit(db, userId, {
    actor: 'user',
    event: 'card.issue',
    decision: 'info',
    reason: `${networkName(issued.network)} virtual card ·· ${issued.lastFour} issued${issuer.sandbox ? ' (sandbox)' : ''}. Purchases are paid from ${account.name}.`,
  });
  return card!;
}

// Merchant category code -> FeMate category. Ranges from the ISO 18245 MCC list; anything else falls back to the descriptor.
const MCC_RANGES: [number, number, Category][] = [
  [4011, 4131, 'transport'], // rail, local transit, taxis, buses
  [4784, 4784, 'transport'], // tolls
  [5541, 5542, 'transport'], // fuel
  [7523, 7523, 'transport'], // parking
  [4812, 4816, 'utilities'], // phone, telecom, internet
  [4899, 4900, 'utilities'], // cable, electric / gas / water
  [5411, 5499, 'food'], // groceries, bakeries, food stores
  [5811, 5814, 'food'], // restaurants, bars, fast food
  [5912, 5912, 'health'], // pharmacies
  [8011, 8099, 'health'], // doctors, dentists, hospitals
  [5815, 5818, 'entertainment'], // digital goods, games
  [7832, 7841, 'entertainment'], // cinemas, video
  [7911, 7999, 'entertainment'], // dance, theatre, sport, recreation
  [8211, 8299, 'education'], // schools, colleges, courses
  [5200, 5999, 'shopping'], // retail
];

export function categoryOf(mcc: string | undefined, descriptor: string): Category {
  const code = Number(mcc);
  const hit = Number.isFinite(code) ? MCC_RANGES.find(([lo, hi]) => code >= lo && code <= hi) : undefined;
  if (hit) return hit[2];
  const c = categorize(descriptor).category;
  return c === 'transfer' ? 'other' : c;
}

/** "EVOS  CHILONZOR" -> "Evos Chilonzor". */
export const merchantName = (descriptor: string) =>
  descriptor
    .trim()
    .replace(/\s+/g, ' ')
    .toLowerCase()
    .replace(/(^|\s)\S/g, (m) => m.toUpperCase())
    .slice(0, 80) || 'Card purchase';

/** The fields of a Lithic ASA request we read (docs.lithic.com, ASA request schema). */
export interface AsaRequest {
  token: string;
  status: string;
  card: { token: string };
  amounts?: { cardholder?: { amount: number; currency: string } };
  /** Older ASA payloads: cents and currency at the top level. */
  authorization_amount?: number;
  cardholder_currency?: string;
  merchant: { descriptor: string; mcc?: string };
}

export interface AsaDecision {
  result: string;
  authorization?: AuthRow;
}

// Only these move money out; balance inquiries and credits are approved and not recorded.
const SPENDING = new Set(['AUTHORIZATION', 'FINANCIAL_AUTHORIZATION']);

export async function decideAuthorization(db: Db, req: AsaRequest): Promise<AsaDecision> {
  const [prior] = await db.select().from(cardAuthorizations).where(eq(cardAuthorizations.lithicToken, req.token));
  if (prior) return { result: prior.result, authorization: prior };
  const [card] = await db.select().from(cards).where(eq(cards.lithicToken, req.card.token));
  // A card FeMate didn't issue (e.g. made in the Lithic dashboard).
  if (!card) return { result: 'UNAUTHORIZED_MERCHANT' };
  if (!SPENDING.has(req.status)) return { result: 'APPROVED' };

  const [account] = await db.select().from(accounts).where(eq(accounts.id, card.accountId));
  if (!account) return { result: 'UNAUTHORIZED_MERCHANT' };
  const own = account.currency;
  const cents = req.amounts?.cardholder?.amount ?? req.authorization_amount ?? 0;
  const code = (req.amounts?.cardholder?.currency ?? req.cardholder_currency ?? 'USD').toUpperCase();
  const charged = (CURRENCIES as readonly string[]).includes(code) ? (code as Currency) : null;
  const amount = charged ? Math.max(1, convertMoney(cents, charged, own)) : 0;
  const merchant = merchantName(req.merchant.descriptor);
  const category = categoryOf(req.merchant.mcc, req.merchant.descriptor);
  const fmt = (n: number) => formatMoney(n, own);
  const spent = charged && charged !== own ? `${fmt(amount)} (${formatMoney(cents, charged)})` : fmt(amount);

  const decline = async (result: string, reason: string) => record(db, card, req, { amount, own, charged, cents, merchant, category, result, reason });

  // 1. Amount the server can understand
  if (!charged || cents <= 0) return decline('UNAUTHORIZED_MERCHANT', `${merchant}: unsupported charge (${cents} ${code}).`);
  // 2. Frozen card
  if (card.frozen) return decline('CARD_PAUSED', `${merchant} ${spent} declined: your card is frozen.`);
  // 3. Funds
  if (account.balance < amount) return decline('INSUFFICIENT_FUNDS', `${merchant} ${spent} declined: ${account.name} has ${fmt(account.balance)}.`);
  // 4. Category budget for this month
  if (card.blockOverBudget) {
    const [b] = await db
      .select()
      .from(budgets)
      .where(and(eq(budgets.userId, card.userId), eq(budgets.category, category)));
    if (b) {
      const used = await spentThisMonth(db, card.userId, category);
      if (used + amount > b.monthlyLimit) {
        return decline(
          'VELOCITY_EXCEEDED',
          `${merchant} ${spent} declined: ${category} would reach ${fmt(used + amount)} of your ${fmt(b.monthlyLimit)} monthly budget.`,
        );
      }
    }
  }
  // 5. Approve: debit the card account and record the purchase
  const approved = await record(db, card, req, { amount, own, charged, cents, merchant, category, result: 'APPROVED', reason: `${merchant} ${spent} approved.` });
  // Not awaited: the card network is waiting on this decision.
  const txId = approved.authorization?.transactionId;
  if (approved.result === 'APPROVED') {
    const spend = txId ? { id: txId, amount, category, description: merchant } : undefined;
    void checkSpendingAlerts(db, card.userId, spend).catch(() => undefined);
  }
  return approved;
}

async function spentThisMonth(db: Db, userId: string, category: Category): Promise<number> {
  const [row] = await db
    .select({ total: sql<number>`coalesce(sum(${transactions.amount}), 0)::bigint` })
    .from(transactions)
    .where(
      and(
        eq(transactions.userId, userId),
        eq(transactions.direction, 'out'),
        eq(transactions.category, category),
        gte(transactions.occurredAt, dayStart(`${tashkentDate().slice(0, 8)}01`)),
      ),
    );
  return Number(row?.total ?? 0);
}

/** Saves the decision (once per Lithic token) and, when approved, debits the account in the same DB transaction. */
async function record(
  db: Db,
  card: CardRow,
  req: AsaRequest,
  d: { amount: number; own: Currency; charged: Currency | null; cents: number; merchant: string; category: Category; result: string; reason: string },
): Promise<AsaDecision> {
  const foreign = d.charged && d.charged !== d.own ? d.charged : null;
  const original = foreign ? { originalAmount: d.cents, originalCurrency: foreign } : {};
  const outcome = await db.transaction(async (tx) => {
    const [auth] = await tx
      .insert(cardAuthorizations)
      .values({
        id: newId('cauth'),
        userId: card.userId,
        cardId: card.id,
        lithicToken: req.token,
        amount: d.amount,
        ...original,
        merchant: d.merchant,
        mcc: req.merchant.mcc ?? null,
        category: d.category,
        result: d.result,
        reason: d.reason,
      })
      .onConflictDoNothing({ target: cardAuthorizations.lithicToken })
      .returning();
    if (!auth) return null; // a retry raced us; the first decision stands
    if (d.result !== 'APPROVED') return auth;
    const debited = await tx
      .update(accounts)
      .set({ balance: sql`${accounts.balance} - ${d.amount}` })
      .where(and(eq(accounts.id, card.accountId), gte(accounts.balance, d.amount)))
      .returning({ id: accounts.id });
    if (debited.length === 0) {
      const [declined] = await tx
        .update(cardAuthorizations)
        .set({ result: 'INSUFFICIENT_FUNDS', reason: `${d.merchant} declined: not enough money on the card.` })
        .where(eq(cardAuthorizations.id, auth.id))
        .returning();
      return declined!;
    }
    const [t] = await tx
      .insert(transactions)
      .values({
        id: newId('tx'),
        userId: card.userId,
        accountId: card.accountId,
        amount: d.amount,
        direction: 'out',
        category: d.category,
        description: d.merchant,
        source: 'card',
        ...original,
        occurredAt: new Date(),
      })
      .returning();
    const [approved] = await tx
      .update(cardAuthorizations)
      .set({ transactionId: t!.id })
      .where(eq(cardAuthorizations.id, auth.id))
      .returning();
    return approved!;
  });
  if (!outcome) {
    const [prior] = await db.select().from(cardAuthorizations).where(eq(cardAuthorizations.lithicToken, req.token));
    return { result: prior?.result ?? 'UNAUTHORIZED_MERCHANT', authorization: prior };
  }
  await audit(db, card.userId, {
    actor: 'system',
    event: 'card.authorization',
    decision: outcome.result === 'APPROVED' ? 'allowed' : 'blocked',
    reason: outcome.reason,
    details: { result: outcome.result, merchant: d.merchant, mcc: req.merchant.mcc ?? null, category: d.category, amount: d.amount, card: card.lastFour },
  });
  return { result: outcome.result, authorization: outcome };
}
