import { convertMoney, formatMoney, toMinor, type Category, type Currency, type TransactionSource } from '@femate/shared';
import { eq, sql } from 'drizzle-orm';

import type { Db } from '../db/client';
import { checkSpendingAlerts } from '../notify/spendingAlerts';
import { accounts, transactions } from '../db/schema';
import { ApiError } from '../lib/errors';
import { newId } from '../lib/ids';
import { userCurrency } from './currency';
import { accountOfType } from './mockBank';

/** A categorizer result (whole units, maybe a named currency) -> addExpense input in minor units. */
export async function parsedExpense(
  db: Db,
  userId: string,
  c: { amount: number; currency: Currency | null; category: Category; description: string },
) {
  const currency = c.currency ?? (await userCurrency(db, userId));
  return { amount: toMinor(c.amount, currency), currency, category: c.category, description: c.description };
}

/** "60 500 UZS" or, when entered in another currency, "60 500 UZS ($5.00)". */
export function spentText(t: { amount: number; originalAmount: number | null; originalCurrency: Currency | null }, own: Currency): string {
  const orig = t.originalAmount !== null && t.originalCurrency ? ` (${formatMoney(t.originalAmount, t.originalCurrency)})` : '';
  return formatMoney(t.amount, own) + orig;
}

/**
 * A spend the user reports (typed, spoken, or told to the agent). Paid from cash, like the app's mock; forwarded card SMS from the card.
 * `amount` is in minor units of `currency` (default: the user's); another currency is converted and kept as the original.
 */
export async function addExpense(
  db: Db,
  userId: string,
  e: { amount: number; currency?: Currency | null; category: Category; description: string; source: TransactionSource; occurredAt?: Date },
  from: 'cash' | 'card' = 'cash',
) {
  const cash = (await accountOfType(db, userId, from)) ?? (await accountOfType(db, userId, from === 'cash' ? 'card' : 'cash'));
  if (!cash) throw new ApiError(409, 'BANK_NOT_CONNECTED', 'Connect the sandbox bank first.');
  const own = await userCurrency(db, userId);
  const { currency, ...rest } = e;
  const foreign = currency && currency !== own ? currency : null;
  const amount = foreign ? convertMoney(e.amount, foreign, own) : e.amount;
  if (amount <= 0) throw new ApiError(400, 'INVALID_ARGS', 'That amount is too small to record.');
  const t = await db.transaction(async (tx) => {
    await tx
      .update(accounts)
      .set({ balance: sql`${accounts.balance} - ${amount}` })
      .where(eq(accounts.id, cash.id));
    const [t] = await tx
      .insert(transactions)
      .values({
        id: newId('tx'),
        userId,
        accountId: cash.id,
        direction: 'out',
        ...rest,
        amount,
        ...(foreign ? { originalAmount: e.amount, originalCurrency: foreign } : {}),
        occurredAt: e.occurredAt ?? new Date(),
      })
      .returning();
    return t!;
  });
  await checkSpendingAlerts(db, userId).catch(() => undefined); // an alert must never undo a recorded expense
  return t;
}
