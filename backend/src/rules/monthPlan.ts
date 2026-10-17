// Month plan (Rules Engine): month-to-date spending against the daily allowance, the per-day limit that
// lands the month on budget, and which categories run above their usual week.
import type { Category, CategoryTrend, MonthPlan } from '@femate/shared';
import { eq } from 'drizzle-orm';

import type { Db } from '../db/client';
import { users } from '../db/schema';
import { notFound } from '../lib/errors';
import { addDays, dayStart, daysInMonth, tashkentDate } from '../lib/time';
import { dailyAllowance, spendsBetween, type Budget } from './dailyAllowance';

type Spend = { amount: number; category: Category; day: string };

/** Pure: `spends` must cover the month so far and the 28 days up to and including `date`. Exported for tests. */
export function buildMonthPlan(u: Budget, date: string, spends: Spend[]): MonthPlan {
  const allowance = dailyAllowance(u, date);
  const days = daysInMonth(date);
  const dayOfMonth = Number(date.slice(8, 10));
  const monthStart = `${date.slice(0, 8)}01`;
  const sum = (rows: Spend[]) => rows.reduce((a, t) => a + t.amount, 0);

  const todaySpent = sum(spends.filter((t) => t.day === date));
  const monthSpent = sum(spends.filter((t) => t.day >= monthStart && t.day <= date));
  const monthBudget = allowance * days;
  const plannedToDate = allowance * dayOfMonth;
  const daysLeft = days - dayOfMonth;
  const catchUpDaily = daysLeft > 0 ? Math.max(0, Math.floor((monthBudget - monthSpent) / daysLeft)) : 0;

  return {
    date,
    dailyAllowance: allowance,
    todaySpent,
    todayOverPct: allowance > 0 && todaySpent > allowance ? Math.round((todaySpent / allowance - 1) * 100) : 0,
    monthBudget,
    monthSpent,
    plannedToDate,
    dayOfMonth,
    daysLeft,
    catchUpDaily,
    cutPerDay: daysLeft > 0 ? Math.max(0, allowance - catchUpDaily) : 0,
    categoryTrends: categoryTrends(date, spends),
  };
}

/** The last 7 days per category against the weekly average of the 21 days before. */
export function categoryTrends(date: string, spends: Spend[]): CategoryTrend[] {
  const weekFrom = addDays(date, -6);
  const usualFrom = addDays(date, -27);
  const cats = new Map<Category, { thisWeek: number; before: number }>();
  for (const t of spends) {
    if (t.day > date || t.day < usualFrom) continue;
    const c = cats.get(t.category) ?? { thisWeek: 0, before: 0 };
    if (t.day >= weekFrom) c.thisWeek += t.amount;
    else c.before += t.amount;
    cats.set(t.category, c);
  }
  return [...cats]
    .map(([category, c]) => {
      const usualWeek = Math.round(c.before / 3);
      return { category, thisWeek: c.thisWeek, usualWeek, changePct: usualWeek > 0 ? Math.round((c.thisWeek / usualWeek - 1) * 100) : null };
    })
    .sort((a, b) => b.thisWeek - a.thisWeek);
}

export async function monthPlan(db: Db, userId: string, date = tashkentDate()): Promise<MonthPlan> {
  const [u] = await db.select().from(users).where(eq(users.id, userId));
  if (!u) throw notFound('User');
  const monthStart = `${date.slice(0, 8)}01`;
  const from = [monthStart, addDays(date, -27)].sort()[0]!;
  const rows = await spendsBetween(db, userId, dayStart(from), dayStart(addDays(date, 1)));
  return buildMonthPlan(u, date, rows.map((t) => ({ amount: t.amount, category: t.category, day: tashkentDate(t.occurredAt) })));
}
