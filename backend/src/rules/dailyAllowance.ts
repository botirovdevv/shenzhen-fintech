// Rules Engine (PLAN.md §9): deterministic numbers the agent reads through tools, never computes itself.
import type { Category, DailySummary, PeriodSummary } from '@femate/shared';
import { and, eq, gte, lt, ne } from 'drizzle-orm';

import type { Db } from '../db/client';
import { transactions, users } from '../db/schema';
import { notFound } from '../lib/errors';
import { addDays, dayStart, daysInMonth, tashkentDate } from '../lib/time';

export interface Budget {
  monthlyIncome: number;
  fixedCostsMonthly: number;
  savingsGoalMonthly: number;
}

export function dailyAllowance(u: Budget, date: string): number {
  return Math.floor((u.monthlyIncome - u.fixedCostsMonthly - u.savingsGoalMonthly) / daysInMonth(date));
}

export function summarize(
  u: Budget,
  date: string,
  spends: { amount: number; category: Category }[],
): DailySummary {
  const allowance = dailyAllowance(u, date);
  const byCat = new Map<Category, number>();
  let todaySpent = 0;
  for (const t of spends) {
    todaySpent += t.amount;
    byCat.set(t.category, (byCat.get(t.category) ?? 0) + t.amount);
  }
  const remainingToday = allowance - todaySpent;
  return {
    date,
    dailyAllowance: allowance,
    todaySpent,
    remainingToday,
    savedToday: Math.max(0, remainingToday),
    byCategory: [...byCat].map(([category, amount]) => ({ category, amount })).sort((a, b) => b.amount - a.amount),
  };
}

/** Spending rows ('out', not transfers) in [from, to). */
export function spendsBetween(db: Db, userId: string, from: Date, to: Date) {
  return db
    .select({ amount: transactions.amount, category: transactions.category, occurredAt: transactions.occurredAt })
    .from(transactions)
    .where(
      and(
        eq(transactions.userId, userId),
        eq(transactions.direction, 'out'),
        ne(transactions.category, 'transfer'),
        gte(transactions.occurredAt, from),
        lt(transactions.occurredAt, to),
      ),
    );
}

export async function dailySummary(db: Db, userId: string, date = tashkentDate()): Promise<DailySummary> {
  const [u] = await db.select().from(users).where(eq(users.id, userId));
  if (!u) throw notFound('User');
  const start = dayStart(date);
  const spends = await spendsBetween(db, userId, start, dayStart(addDays(date, 1)));
  return summarize(u, date, spends);
}

export async function periodSummary(db: Db, userId: string, from: Date, to: Date): Promise<PeriodSummary> {
  const rows = await spendsBetween(db, userId, from, new Date(to.getTime() + 1));
  const byCat = new Map<Category, number>();
  const byDay = new Map<string, number>();
  for (const t of rows) {
    byCat.set(t.category, (byCat.get(t.category) ?? 0) + t.amount);
    const day = tashkentDate(t.occurredAt);
    byDay.set(day, (byDay.get(day) ?? 0) + t.amount);
  }
  return {
    byCategory: [...byCat].map(([category, amount]) => ({ category, amount })).sort((a, b) => b.amount - a.amount),
    byDay: [...byDay].map(([date, amount]) => ({ date, amount })).sort((a, b) => a.date.localeCompare(b.date)),
  };
}
