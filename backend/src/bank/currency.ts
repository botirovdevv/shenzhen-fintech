// The user's currency (shared CURRENCY_INFO). Changing it converts all of their money at the fixed rates.
import { CURRENCY_INFO, convertMoney, fromUzs, levelLimits, niceStep, type Currency } from '@femate/shared';
import { and, eq, isNotNull, isNull, sql, type SQL } from 'drizzle-orm';
import type { PgColumn } from 'drizzle-orm/pg-core';

import { audit } from '../audit/audit';
import type { Db } from '../db/client';
import { accounts, agentActions, budgets, permissions, recommendations, transactions, users } from '../db/schema';
import { notFound } from '../lib/errors';

export async function userCurrency(db: Db, userId: string): Promise<Currency> {
  const [u] = await db.select({ currency: users.currency }).from(users).where(eq(users.id, userId));
  if (!u) throw notFound('User');
  return u.currency;
}

/** Minor units of `from` -> minor units of `to`, as one factor (same math as convertMoney). */
function factor(from: Currency, to: Currency): string {
  const f = CURRENCY_INFO[from];
  const t = CURRENCY_INFO[to];
  return String((f.uzsRate / t.uzsRate) * 10 ** (t.decimals - f.decimals));
}

/** "1 USD = 12 100 UZS": the stronger currency first. */
export function rateText(a: Currency, b: Currency): string {
  const [hi, lo] = CURRENCY_INFO[a].uzsRate >= CURRENCY_INFO[b].uzsRate ? [a, b] : [b, a];
  const r = CURRENCY_INFO[hi].uzsRate / CURRENCY_INFO[lo].uzsRate;
  return `1 ${hi} = ${r.toLocaleString('en-US', { maximumFractionDigits: 4 }).replace(/,/g, ' ')} ${lo}`;
}

/**
 * Re-expresses everything the user owns in `to`: profile numbers, balances, transactions, budgets,
 * pending and past agent actions, and limits (kept under the new currency's level maximum).
 * Suggestions not yet acted on are dropped so they are rebuilt with the new numbers.
 * Transactions keep the amount they had as their original, so switching back restores them exactly;
 * numbers the user typed (income, goal, budgets) are rounded so they stay readable (4 000 018 -> 4 000 000).
 */
export async function changeCurrency(db: Db, userId: string, to: Currency) {
  const from = await userCurrency(db, userId);
  if (from === to) return;
  const f = factor(from, to);
  const conv = (col: PgColumn | SQL) => sql`round(${col}::numeric * ${f}::numeric)::int`;
  const step = String(niceStep(fromUzs(1000, to)));
  const convRound = (col: PgColumn) => sql`(round(${col}::numeric * ${f}::numeric / ${step}::numeric) * ${step}::numeric)::int`;
  await db.transaction(async (tx) => {
    await tx
      .update(users)
      .set({
        currency: to,
        monthlyIncome: convRound(users.monthlyIncome),
        fixedCostsMonthly: convRound(users.fixedCostsMonthly),
        savingsGoalMonthly: convRound(users.savingsGoalMonthly),
      })
      .where(eq(users.id, userId));
    await tx.update(accounts).set({ currency: to, balance: conv(accounts.balance) }).where(eq(accounts.userId, userId));
    await tx
      .update(transactions)
      .set({ originalAmount: sql`${transactions.amount}`, originalCurrency: from })
      .where(and(eq(transactions.userId, userId), isNull(transactions.originalCurrency)));
    await tx.update(transactions).set({ amount: conv(transactions.amount) }).where(eq(transactions.userId, userId));
    // An expense entered in the new currency gets back exactly what was entered.
    await tx
      .update(transactions)
      .set({ amount: sql`${transactions.originalAmount}`, originalAmount: null, originalCurrency: null })
      .where(and(eq(transactions.userId, userId), eq(transactions.originalCurrency, to)));
    await tx.update(budgets).set({ monthlyLimit: convRound(budgets.monthlyLimit) }).where(eq(budgets.userId, userId));
    // Payloads hold the same numbers; only well-formed ones (blocked junk args stay as they were).
    for (const key of ['amount', 'monthlyLimit']) {
      await tx
        .update(agentActions)
        .set({ payload: sql`${agentActions.payload} || jsonb_build_object(${key}::text, ${conv(sql`(${agentActions.payload}->>${key}::text)`)})` })
        .where(and(eq(agentActions.userId, userId), sql`jsonb_typeof(${agentActions.payload}->${key}::text) = 'number'`));
    }
    await tx.update(agentActions).set({ amount: conv(agentActions.amount) }).where(and(eq(agentActions.userId, userId), isNotNull(agentActions.amount)));
    await tx.delete(recommendations).where(and(eq(recommendations.userId, userId), eq(recommendations.status, 'new')));
    await tx.update(recommendations).set({ monthlySaving: conv(recommendations.monthlySaving) }).where(eq(recommendations.userId, userId));

    const [p] = await tx.select().from(permissions).where(eq(permissions.userId, userId));
    if (p) {
      const max = levelLimits(p.level, to);
      await tx
        .update(permissions)
        .set({
          perActionLimit: max ? Math.min(convertMoney(p.perActionLimit, from, to), max.perAction) : 0,
          dailyLimit: max ? Math.min(convertMoney(p.dailyLimit, from, to), max.daily) : 0,
        })
        .where(eq(permissions.userId, userId));
    }
  });
  await audit(db, userId, {
    actor: 'user',
    event: 'profile.currency',
    decision: 'info',
    reason: `Currency changed from ${from} to ${to}. Balances, history, budgets and limits were converted at ${rateText(from, to)} (fixed sandbox rate).`,
    details: { from, to },
  });
}
