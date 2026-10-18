import { describe, expect, it } from 'vitest';

import { buildRecommendations } from '../src/agent/recommendations';
import { maskCards } from '../src/lib/format';
import { dayStart, daysInMonth, tashkentDate } from '../src/lib/time';
import { isAnomaly, median } from '../src/rules/anomaly';
import { categorize, parseUzbekNumber } from '../src/rules/categorize';
import { dailyAllowance, summarize } from '../src/rules/dailyAllowance';
import { whatIf } from '../src/rules/whatIf';

const aziz = { monthlyIncome: 4_000_000, fixedCostsMonthly: 600_000, savingsGoalMonthly: 500_000 };

describe('rules engine', () => {
  it('daily allowance for Aziz in a 31-day month is 93 548', () => {
    expect(dailyAllowance(aziz, '2026-10-17')).toBe(93_548);
    expect(dailyAllowance(aziz, '2026-11-02')).toBe(96_666);
  });

  it('summary: remaining can go negative, savedToday never does; transfers are excluded upstream', () => {
    const s = summarize(aziz, '2026-10-17', [
      { amount: 17_000, category: 'food' },
      { amount: 35_000, category: 'food' },
      { amount: 20_000, category: 'transport' },
    ]);
    expect(s).toMatchObject({ todaySpent: 72_000, remainingToday: 21_548, savedToday: 21_548 });
    expect(s.byCategory[0]).toEqual({ category: 'food', amount: 52_000 });
    expect(summarize(aziz, '2026-10-17', [{ amount: 150_000, category: 'shopping' }])).toMatchObject({ remainingToday: -56_452, savedToday: 0 });
  });

  it('what-if: taxi 20 000 -> bus 4 000 on 15 days saves 240 000 a month', () => {
    expect(whatIf({ currentCostPerDay: 20_000, alternativeCostPerDay: 4_000, daysPerMonth: 15 })).toEqual({ monthlySaving: 240_000, yearlySaving: 2_880_000 });
    expect(whatIf({ currentCostPerDay: 3_000, alternativeCostPerDay: 4_000, daysPerMonth: 15 }).monthlySaving).toBe(0);
  });

  it('Tashkent day boundaries are UTC+5', () => {
    expect(tashkentDate(new Date('2026-10-16T19:30:00Z'))).toBe('2026-10-17');
    expect(dayStart('2026-10-17').toISOString()).toBe('2026-10-16T19:00:00.000Z');
    expect(daysInMonth('2026-02-10')).toBe(28);
  });
});

describe('categorizer', () => {
  it.each([
    ['taxi 20 ming', 20_000, 'transport'],
    ['Lunch 35k', 35_000, 'food'],
    ['svet uchun 120000', 120_000, 'utilities'],
    ['Bozorga qirq besh ming ishlatdim', 45_000, 'food'],
    ["Dorixonaga o'ttiz besh ming", 35_000, 'health'],
    ['something 5 000', 5_000, 'other'],
  ])('%s', (text, amount, category) => {
    expect(categorize(text)).toMatchObject({ amount, category });
  });

  it('parses Uzbek number words', () => {
    expect(parseUzbekNumber('bir yuz yigirma ming')).toBe(120_000);
    expect(parseUzbekNumber('no numbers here')).toBeNull();
  });
});

describe('recommendations', () => {
  it('suggests the bus (240 000) and a food cap from 14 days of Aziz-like spending', () => {
    const spends = Array.from({ length: 14 }, (_, i) => [
      { amount: 20_000, category: 'transport', description: 'Yandex Go', day: `d${i}` },
      { amount: 33_000, category: 'food', description: 'Lunch', day: `d${i}` },
    ]).flat();
    const recs = buildRecommendations(spends, 31);
    const bus = recs.find((r) => r.title.includes('bus'));
    expect(bus?.monthlySaving).toBe(240_000);
    const food = recs.find((r) => r.actionType === 'set_budget');
    expect(food?.actionPayload).toEqual({ category: 'food', monthlyLimit: 850_000 });
  });
});

it('masks card numbers', () => {
  expect(maskCards('to card 8600 1234 5678 4471 now')).toBe('to card 8600 **** **** 4471 now');
  expect(maskCards('8600123456784471')).toBe('8600 **** **** 4471');
});

describe('anomaly rule', () => {
  it('flags > 3x the 30-day category median and at least 100 000', () => {
    expect(median([10, 30, 20])).toBe(20);
    expect(median([10, 20, 30, 40])).toBe(25);
    expect(isAnomaly(500_000, [40_000, 60_000, 50_000], 100_000).anomaly).toBe(true);
    expect(isAnomaly(140_000, [40_000, 60_000, 50_000], 100_000).anomaly).toBe(false); // under 3x
    expect(isAnomaly(90_000, [10_000, 20_000], 100_000).anomaly).toBe(false); // under 100 000
    expect(isAnomaly(500_000, [], 100_000).anomaly).toBe(false); // nothing to compare against
  });
});
