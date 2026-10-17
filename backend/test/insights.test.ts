import type { DailyInsight, MonthPlan } from '@femate/shared';
import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { buildDailyInsight } from '../src/agent/insights';
import { systemPrompt } from '../src/agent/prompts';
import { addExpense } from '../src/bank/expenses';
import { DEMO } from '../src/db/demo';
import { alerts, users } from '../src/db/schema';
import { setChannels } from '../src/notify/notify';
import { alertsFor } from '../src/notify/spendingAlerts';
import { buildMonthPlan, categoryTrends } from '../src/rules/monthPlan';
import { setup } from './helpers';

const aziz = { monthlyIncome: 4_000_000, fixedCostsMonthly: 600_000, savingsGoalMonthly: 500_000 }; // 93 548 a day in October

/** 1 900 000 spent Oct 1-16, then 134 709 today (Oct 17): 44% over the day, 309 684 over the month. */
function overspentOctober() {
  const spends = [
    { amount: 1_900_000 - 134_709 - 300_000, category: 'food' as const, day: '2026-10-05' },
    { amount: 300_000, category: 'transport' as const, day: '2026-10-14' },
    { amount: 94_709, category: 'food' as const, day: '2026-10-17' },
    { amount: 40_000, category: 'transport' as const, day: '2026-10-17' },
  ];
  return buildMonthPlan(aziz, '2026-10-17', spends);
}

describe('month plan', () => {
  it('today over by 44%, catch-up limit for the 14 days left', () => {
    const p = overspentOctober();
    expect(p).toMatchObject({
      dailyAllowance: 93_548,
      todaySpent: 134_709,
      todayOverPct: 44,
      monthBudget: 2_899_988,
      monthSpent: 1_900_000,
      plannedToDate: 1_590_316,
      dayOfMonth: 17,
      daysLeft: 14,
      catchUpDaily: 71_427, // (2 899 988 − 1 900 000) / 14
      cutPerDay: 22_121,
    });
  });

  it('last day of the month and a used-up budget have no catch-up', () => {
    expect(buildMonthPlan(aziz, '2026-10-31', []).daysLeft).toBe(0);
    const p = buildMonthPlan(aziz, '2026-10-17', [{ amount: 3_000_000, category: 'shopping', day: '2026-10-02' }]);
    expect(p).toMatchObject({ catchUpDaily: 0, cutPerDay: 93_548 });
  });

  it('category trends: this week against the 3 weeks before', () => {
    const t = categoryTrends('2026-10-17', [
      { amount: 130_000, category: 'food', day: '2026-10-15' }, // this week
      { amount: 300_000, category: 'food', day: '2026-09-25' }, // usual: 300 000 / 3 = 100 000
      { amount: 50_000, category: 'transport', day: '2026-10-16' },
      { amount: 999_999, category: 'food', day: '2026-09-01' }, // too old
    ]);
    expect(t).toEqual([
      { category: 'food', thisWeek: 130_000, usualWeek: 100_000, changePct: 30 },
      { category: 'transport', thisWeek: 50_000, usualWeek: 0, changePct: null },
    ]);
  });
});

describe('daily insight', () => {
  it('over: names the %, the catch-up limit and concrete tips', () => {
    const i = buildDailyInsight('Aziz Karimov', overspentOctober(), 'UZS');
    expect(i.status).toBe('over');
    expect(i.headline).toBe('Hey Aziz, today you spent 44% more than your daily plan.');
    expect(i.body).toContain('remaining 14 days under 71 427 UZS');
    expect(i.body).toContain('22 121 UZS less than your usual 93 548 UZS');
    expect(i.tips.map((t) => t.category)).toEqual(expect.arrayContaining(['food', 'transport']));
    expect(i.tips.find((t) => t.category === 'food')!.text).toMatch(/lunch from home/);
    expect(i.tips.find((t) => t.category === 'transport')!.text).toMatch(/^Walk or take the bus instead of a taxi for \d+ days/);
  });

  it('on track: a short positive note and no tips', () => {
    const i = buildDailyInsight('Aziz', buildMonthPlan(aziz, '2026-10-17', [{ amount: 50_000, category: 'food', day: '2026-10-17' }]), 'UZS');
    expect(i).toMatchObject({ status: 'on_track', tips: [] });
    expect(i.headline).toBe('Nice, Aziz: you’re 43 548 UZS under today’s plan.');
  });

  it('the assistant always answers in English', () => {
    expect(systemPrompt('Aziz', 'UZS', null)).toContain('Always reply in English');
  });
});

describe('spending alerts', () => {
  it('day over and a category well above its usual week', () => {
    const plan = buildMonthPlan(aziz, '2026-10-17', [
      { amount: 200_000, category: 'food', day: '2026-10-17' },
      { amount: 300_000, category: 'food', day: '2026-09-25' },
    ]);
    const a = alertsFor('Aziz', plan, 'UZS');
    expect(a.map((x) => [x.kind, x.key])).toEqual([
      ['day_over', '2026-10-17'],
      ['category_up', 'food:2026-10-12'],
    ]);
    expect(a[1]!.title).toBe('Food spending is up 100% this week');
    expect(a[1]!.body).toMatch(/lunch from home/);
  });

  it('small changes and missing history stay quiet', () => {
    const plan = buildMonthPlan(aziz, '2026-10-17', [
      { amount: 20_000, category: 'food', day: '2026-10-17' },
      { amount: 30_000, category: 'transport', day: '2026-10-16' },
    ]);
    expect(alertsFor('Aziz', plan, 'UZS')).toEqual([]);
  });
});

describe('insight API and alert delivery', () => {
  let t: Awaited<ReturnType<typeof setup>>;
  const sent: string[] = [];
  beforeAll(async () => {
    t = await setup();
    setChannels({ telegram: async (_chat, text) => void sent.push(text), push: async (_tok, title) => void sent.push(title) });
  });
  afterAll(async () => {
    setChannels({});
    await t.close();
  });

  it('GET /summary/insight returns the check-in with its plan', async () => {
    const { status, body } = await t.call<DailyInsight>('GET', '/summary/insight');
    expect(status).toBe(200);
    expect(body.headline).toMatch(/^(Hey|Nice), Aziz/);
    expect(body.plan satisfies MonthPlan).toHaveProperty('catchUpDaily');
  });

  it('going over today alerts once, however many expenses follow', async () => {
    const [u] = await t.db.select().from(users).where(eq(users.email, DEMO.email));
    await t.db.update(users).set({ telegramChatId: '42' }).where(eq(users.id, u!.id));
    for (let i = 0; i < 3; i++) await addExpense(t.db, u!.id, { amount: 200_000, category: 'shopping', description: 'TV', source: 'manual' });
    await new Promise((r) => setTimeout(r, 50)); // delivery runs in the background
    const rows = await t.db.select().from(alerts);
    expect(rows.filter((r) => r.kind === 'day_over')).toHaveLength(1);
    expect(sent.filter((s) => s.includes('over today’s plan'))).toHaveLength(1);
  });
});
