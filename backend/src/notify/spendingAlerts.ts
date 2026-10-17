// Proactive spending alerts, checked after every recorded expense: the first time today goes over the
// daily plan, and when a category's week runs well above its usual week. Each alert is stored once
// (unique per user / kind / key), so repeated expenses never repeat it.
import { fromUzs, type Category, type Currency, type MonthPlan } from '@femate/shared';
import { eq } from 'drizzle-orm';

import { buildDailyInsight } from '../agent/insights';
import { userCurrency } from '../bank/currency';
import type { Db } from '../db/client';
import { alerts, users } from '../db/schema';
import { money } from '../lib/format';
import { newId } from '../lib/ids';
import { addDays } from '../lib/time';
import { monthPlan } from '../rules/monthPlan';
import { notifyUser } from './notify';

export interface Alert {
  kind: 'day_over' | 'category_up';
  key: string;
  title: string;
  body: string;
}

/** A category counts as "up" from this much above its usual week. */
export const CATEGORY_UP_PCT = 30;

const CATEGORY_TIP: Partial<Record<Category, string>> = {
  food: 'Bringing lunch from home for a few days brings it back down.',
  transport: 'Walking or taking the bus instead of a taxi brings it back down.',
  shopping: 'A no-shopping week brings it back down.',
  entertainment: 'A quieter week brings it back down.',
};

/** Monday of the date's week, as the key for weekly alerts. */
function weekKey(date: string): string {
  const day = new Date(`${date}T00:00:00Z`).getUTCDay();
  return addDays(date, -((day + 6) % 7));
}

/** Pure: the alerts a month plan calls for. Exported for tests. */
export function alertsFor(name: string, plan: MonthPlan, currency: Currency): Alert[] {
  const fmt = (n: number) => money(n, currency);
  const out: Alert[] = [];
  if (plan.dailyAllowance > 0 && plan.todaySpent > plan.dailyAllowance) {
    const insight = buildDailyInsight(name, plan, currency);
    out.push({ kind: 'day_over', key: plan.date, title: `You’re ${plan.todayOverPct}% over today’s plan`, body: insight.body });
  }
  const minWeek = fromUzs(30_000, currency);
  for (const t of plan.categoryTrends) {
    if (t.changePct === null || t.changePct < CATEGORY_UP_PCT) continue;
    if (t.usualWeek < minWeek || t.thisWeek - t.usualWeek < minWeek) continue;
    const label = `${t.category[0]!.toUpperCase()}${t.category.slice(1)}`;
    out.push({
      kind: 'category_up',
      key: `${t.category}:${weekKey(plan.date)}`,
      title: `${label} spending is up ${t.changePct}% this week`,
      body: `${fmt(t.thisWeek)} in the last 7 days against your usual ${fmt(t.usualWeek)}. ${CATEGORY_TIP[t.category] ?? 'Keep an eye on it this week.'}`,
    });
  }
  return out;
}

/** Stores and sends the alerts not sent before. Returns the new ones. */
export async function checkSpendingAlerts(db: Db, userId: string): Promise<Alert[]> {
  const [u] = await db.select().from(users).where(eq(users.id, userId));
  if (!u) return [];
  const [plan, currency] = await Promise.all([monthPlan(db, userId), userCurrency(db, userId)]);
  const fresh: Alert[] = [];
  for (const a of alertsFor(u.name, plan, currency)) {
    const inserted = await db
      .insert(alerts)
      .values({ id: newId('alr'), userId, ...a })
      .onConflictDoNothing()
      .returning({ id: alerts.id });
    if (inserted.length) fresh.push(a);
  }
  // Delivery runs in the background so recording an expense never waits on Expo or Telegram.
  for (const a of fresh) void notifyUser(u, a.title, a.body);
  return fresh;
}
