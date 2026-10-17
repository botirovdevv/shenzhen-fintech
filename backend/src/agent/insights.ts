// The assistant's daily check-in: how today and the month compare with the plan, and concrete ways
// to get back on it. Rule-based so every number comes from the Rules Engine, never from the LLM.
import { fromUzs, niceStep, type Currency, type DailyInsight, type InsightTip, type MonthPlan } from '@femate/shared';
import { eq } from 'drizzle-orm';

import { userCurrency } from '../bank/currency';
import type { Db } from '../db/client';
import { users } from '../db/schema';
import { notFound } from '../lib/errors';
import { money } from '../lib/format';
import { monthPlan } from '../rules/monthPlan';
import { BUS_FARE } from '../rules/whatIf';

const firstName = (name: string) => name.trim().split(/\s+/)[0] || 'there';

/** Pure: the check-in text for a month plan. Exported for tests. */
export function buildDailyInsight(name: string, plan: MonthPlan, currency: Currency): DailyInsight {
  const fmt = (n: number) => money(n, currency);
  const who = firstName(name);
  const overToday = plan.todaySpent > plan.dailyAllowance;
  const overMonth = plan.monthSpent > plan.plannedToDate;
  const status = overToday || overMonth ? 'over' : 'on_track';

  const headline = overToday
    ? `Hey ${who}, today you spent ${plan.todayOverPct}% more than your daily plan.`
    : overMonth
      ? `Hey ${who}, you’re within today’s plan, but the month is running ahead of it.`
      : `Nice, ${who}: you’re ${fmt(plan.dailyAllowance - plan.todaySpent)} under today’s plan.`;

  let body: string;
  if (plan.daysLeft === 0) {
    body = `It’s the last day of the month: ${fmt(plan.monthSpent)} spent of ${fmt(plan.monthBudget)}.`;
  } else if (plan.monthSpent >= plan.monthBudget) {
    body = `This month’s budget of ${fmt(plan.monthBudget)} is used up. Keep the remaining ${plan.daysLeft} days to essentials only.`;
  } else if (overMonth) {
    body = `To land on your monthly plan, keep each of the remaining ${plan.daysLeft} days under ${fmt(plan.catchUpDaily)}: that’s ${fmt(plan.cutPerDay)} less than your usual ${fmt(plan.dailyAllowance)} a day.`;
  } else if (overToday) {
    body = `The month is still on pace: the remaining ${plan.daysLeft} days allow ${fmt(plan.catchUpDaily)} a day.`;
  } else {
    body = `This month: ${fmt(plan.monthSpent)} of ${fmt(plan.monthBudget)} spent, ${plan.daysLeft} days left at ${fmt(plan.catchUpDaily)} a day.`;
  }

  return { status, headline, body, tips: status === 'over' ? buildTips(plan, currency) : [], plan };
}

/** Up to three tips for the categories that cost the most this week, biggest saving first. */
function buildTips(plan: MonthPlan, currency: Currency): InsightTip[] {
  const fmt = (n: number) => money(n, currency);
  const unit = niceStep(fromUzs(1_000, currency));
  const round = (n: number) => Math.round(n / unit) * unit;
  const days = Math.max(1, plan.daysLeft);
  // What the user needs to win back: the month's overspend so far, or today's.
  const gap = Math.max(plan.monthSpent - plan.plannedToDate, plan.todaySpent - plan.dailyAllowance, 0);
  const tips: InsightTip[] = [];

  for (const t of plan.categoryTrends) {
    const perDay = t.thisWeek / 7;
    if (perDay <= 0) continue;
    if (t.category === 'food') {
      const cut = round(perDay / 3);
      if (cut > 0)
        tips.push({
          category: 'food',
          text: `Bring lunch from home or cook dinner at home. Cutting food by a third saves about ${fmt(cut)} a day.`,
          saving: cut * days,
        });
    } else if (t.category === 'transport') {
      const busTrip = fromUzs(2 * BUS_FARE, currency);
      const perDayCut = round(Math.max(0, perDay - busTrip));
      if (perDayCut <= 0) continue;
      const n = Math.min(days, Math.max(1, Math.ceil((gap || perDayCut * days / 2) / perDayCut)));
      tips.push({
        category: 'transport',
        text:
          gap > 0
            ? `Walk or take the bus instead of a taxi for ${n} days. That alone wins back the ${fmt(gap)} you’re over.`
            : `Walk or take the bus instead of a taxi for ${n} days to save about ${fmt(perDayCut * n)}.`,
        saving: perDayCut * n,
      });
    } else if (t.category === 'shopping' || t.category === 'entertainment') {
      const week = round(t.thisWeek);
      if (week > 0)
        tips.push({
          category: t.category,
          text: `Pause ${t.category} for a week. Last week it cost ${fmt(week)}.`,
          saving: week,
        });
    }
  }
  return tips.sort((a, b) => b.saving - a.saving).slice(0, 3);
}

export async function dailyInsight(db: Db, userId: string, date?: string): Promise<DailyInsight> {
  const [u] = await db.select({ name: users.name }).from(users).where(eq(users.id, userId));
  if (!u) throw notFound('User');
  const [plan, currency] = await Promise.all([monthPlan(db, userId, date), userCurrency(db, userId)]);
  return buildDailyInsight(u.name, plan, currency);
}
