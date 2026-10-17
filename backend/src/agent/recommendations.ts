// Recommendation generator (PLAN.md §5 Stage 5): looks at the last 14 days; every number comes
// from the Rules Engine, not the LLM. Regenerated at most once a day.
import type { AgentAction, Recommendation } from '@femate/shared';
import { and, desc, eq, gte } from 'drizzle-orm';

import { audit } from '../audit/audit';
import type { Db } from '../db/client';
import { recommendations, transactions } from '../db/schema';
import { notFound } from '../lib/errors';
import { fmt } from '../lib/format';
import { newId } from '../lib/ids';
import { toRecommendation } from '../lib/serialize';
import { addDays, dayStart, daysInMonth, tashkentDate } from '../lib/time';
import { proposeAction } from '../policy/actions';
import { BUS_FARE, whatIf } from '../rules/whatIf';

type NewRec = Omit<typeof recommendations.$inferInsert, 'id' | 'userId'>;

/** Pure: builds recommendations from 14 days of spending. Exported for tests. */
export function buildRecommendations(
  spends: { amount: number; category: string; description: string; day: string }[],
  monthDays: number,
): NewRec[] {
  const recs: NewRec[] = [];

  // 1. Taxi -> bus on even days.
  const rides = spends.filter((t) => t.category === 'transport' && /yandex|taxi|taksi/i.test(t.description));
  const rideDays = new Set(rides.map((t) => t.day)).size;
  if (rideDays >= 5) {
    const perDay = Math.round(rides.reduce((a, t) => a + t.amount, 0) / rideDays / 1000) * 1000;
    const busDays = Math.floor(monthDays / 2);
    const { monthlySaving } = whatIf({ currentCostPerDay: perDay, alternativeCostPerDay: 2 * BUS_FARE, daysPerMonth: busDays });
    if (monthlySaving > 0)
      recs.push({
        title: 'Take the bus on even days',
        body: `You take a taxi on ${rideDays} of the last 14 days, about ${fmt(perDay)} UZS a day. On ${busDays} even days a month, a ${fmt(2 * BUS_FARE)} UZS bus round trip saves ${fmt(perDay - 2 * BUS_FARE)} each day.`,
        monthlySaving,
      });
  }

  // 2/3. Category caps for food and shopping when the month is on pace to run high.
  for (const [category, label, min] of [
    ['food', 'food', 300_000],
    ['shopping', 'shopping', 150_000],
  ] as const) {
    const spent = spends.filter((t) => t.category === category).reduce((a, t) => a + t.amount, 0);
    const projected = Math.round((spent / 14) * monthDays);
    if (projected < min) continue;
    const cap = Math.floor((projected * 0.85) / 50_000) * 50_000;
    if (cap <= 0 || projected - cap <= 0) continue;
    recs.push({
      title: `Cap ${label} at ${fmt(cap)} a month`,
      body: `${label[0]!.toUpperCase()}${label.slice(1)} is on pace for about ${fmt(projected)} UZS this month. A ${fmt(cap)} cap keeps you on track; FeMate will warn you at 80%.`,
      monthlySaving: projected - cap,
      actionType: 'set_budget',
      actionPayload: { category, monthlyLimit: cap },
    });
  }
  return recs.sort((a, b) => b.monthlySaving - a.monthlySaving);
}

export async function listRecommendations(db: Db, userId: string): Promise<Recommendation[]> {
  const existing = await db
    .select()
    .from(recommendations)
    .where(eq(recommendations.userId, userId))
    .orderBy(desc(recommendations.createdAt));
  const fresh = existing[0] && Date.now() - existing[0].createdAt.getTime() < 24 * 60 * 60 * 1000;
  if (fresh) return existing.filter((r) => r.status !== 'dismissed').map(toRecommendation);

  const today = tashkentDate();
  const rows = await db
    .select()
    .from(transactions)
    .where(and(eq(transactions.userId, userId), eq(transactions.direction, 'out'), gte(transactions.occurredAt, dayStart(addDays(today, -13)))));
  const built = buildRecommendations(
    rows.map((t) => ({ amount: t.amount, category: t.category, description: t.description, day: tashkentDate(t.occurredAt) })),
    daysInMonth(today),
  );
  // Replace yesterday's untouched suggestions; applied ones stay as history.
  await db.delete(recommendations).where(and(eq(recommendations.userId, userId), eq(recommendations.status, 'new')));
  if (built.length) await db.insert(recommendations).values(built.map((r) => ({ ...r, id: newId('rec'), userId })));
  const all = await db.select().from(recommendations).where(eq(recommendations.userId, userId)).orderBy(desc(recommendations.monthlySaving));
  return all.filter((r) => r.status !== 'dismissed').map(toRecommendation);
}

export async function applyRecommendation(db: Db, userId: string, id: string): Promise<{ action?: AgentAction }> {
  const [rec] = await db
    .select()
    .from(recommendations)
    .where(and(eq(recommendations.id, id), eq(recommendations.userId, userId)));
  if (!rec) throw notFound('Recommendation');
  await db.update(recommendations).set({ status: 'applied' }).where(eq(recommendations.id, id));
  await audit(db, userId, { actor: 'user', event: 'recommendation.apply', decision: 'info', reason: `Applied: ${rec.title}.`, details: { recommendationId: id } });
  if (rec.actionType && rec.actionPayload) {
    const { action } = await proposeAction(db, userId, rec.actionType, rec.actionPayload, { actor: 'user', reason: rec.title });
    return { action };
  }
  return {};
}
