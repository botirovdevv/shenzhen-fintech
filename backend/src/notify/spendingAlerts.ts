// Proactive spending alerts, checked after every recorded expense: the first time today goes over the
// daily plan, when a category's week runs well above its usual week, and a single unusually large
// spend (anomaly, PLAN.md §9). Each alert is stored once
// (unique per user / kind / key), so repeated expenses never repeat it.
import { fromUzs, type Category, type Currency, type MonthPlan } from '@femate/shared';
import { and, eq, gte, ne } from 'drizzle-orm';

import { buildDailyInsight } from '../agent/insights';
import { userCurrency } from '../bank/currency';
import type { Db } from '../db/client';
import { alerts, transactions, users } from '../db/schema';
import { money } from '../lib/format';
import { newId } from '../lib/ids';
import { addDays } from '../lib/time';
import { ANOMALY_FACTOR, ANOMALY_MIN_UZS, ANOMALY_WINDOW_DAYS, isAnomaly } from '../rules/anomaly';
import { monthPlan } from '../rules/monthPlan';
import { notifyUser } from './notify';

export interface Alert {
  kind: 'day_over' | 'category_up' | 'anomaly';
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

export interface SpendRef {
  id: string;
  amount: number;
  category: Category;
  description: string;
}

/** The anomaly alert for one new spend, or null. */
async function anomalyAlert(db: Db, userId: string, tx: SpendRef, currency: Currency): Promise<Alert | null> {
  if (tx.category === 'transfer') return null;
  const since = new Date(Date.now() - ANOMALY_WINDOW_DAYS * 24 * 60 * 60 * 1000);
  const rows = await db
    .select({ amount: transactions.amount })
    .from(transactions)
    .where(
      and(
        eq(transactions.userId, userId),
        eq(transactions.direction, 'out'),
        eq(transactions.category, tx.category),
        gte(transactions.occurredAt, since),
        ne(transactions.id, tx.id),
      ),
    );
  const r = isAnomaly(
    tx.amount,
    rows.map((x) => x.amount),
    fromUzs(ANOMALY_MIN_UZS, currency),
  );
  if (!r.anomaly) return null;
  const times = Math.round(tx.amount / Math.max(1, r.median));
  return {
    kind: 'anomaly',
    key: tx.id,
    title: `Unusual ${tx.category} spend: ${money(tx.amount, currency)}`,
    body: `“${tx.description}” is about ${Math.max(ANOMALY_FACTOR, times)}× your usual ${tx.category} spend of ${money(r.median, currency)}. If this wasn’t you, freeze your card in FeMate.`,
  };
}

/** Stores and sends the alerts not sent before. Returns the new ones. Pass the new spend to also check it for an anomaly. */
export async function checkSpendingAlerts(db: Db, userId: string, tx?: SpendRef): Promise<Alert[]> {
  const [u] = await db.select().from(users).where(eq(users.id, userId));
  if (!u) return [];
  const [plan, currency] = await Promise.all([monthPlan(db, userId), userCurrency(db, userId)]);
  const fresh: Alert[] = [];
  const anomaly = tx ? await anomalyAlert(db, userId, tx, currency) : null;
  for (const a of [...(anomaly ? [anomaly] : []), ...alertsFor(u.name, plan, currency)]) {
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
