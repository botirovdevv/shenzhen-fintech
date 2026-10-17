import { describe, expect, it } from 'vitest';

import { bars, categoryDeltas, changePct, dayKey, offsetLabel, periodRange, previousRange, rangeLabel } from './period';

const now = new Date(2026, 9, 18, 14, 30); // Sun 18 Oct 2026, local time

describe('periods', () => {
  it('weeks run Monday to Sunday and step back by offset', () => {
    const w = periodRange('week', 0, now);
    expect([dayKey(w.from), dayKey(w.to)]).toEqual(['2026-10-12', '2026-10-18']);
    const w2 = periodRange('week', 2, now);
    expect([dayKey(w2.from), dayKey(w2.to)]).toEqual(['2026-09-28', '2026-10-04']);
    expect(rangeLabel('week', w2)).toBe('28 Sept – 4 Oct');
    expect(rangeLabel('week', w)).toBe('12–18 Oct');
  });

  it('months step back across the year', () => {
    const m = periodRange('month', 10, now);
    expect([dayKey(m.from), dayKey(m.to)]).toEqual(['2025-12-01', '2025-12-31']);
    expect(rangeLabel('month', periodRange('month', 0, now))).toBe('October 2026');
  });

  it('the current month is compared with the same days of the last one', () => {
    const p = previousRange('month', 0, now);
    expect([dayKey(p.from), dayKey(p.to)]).toEqual(['2026-09-01', '2026-09-18']);
    const full = previousRange('month', 1, now);
    expect([dayKey(full.from), dayKey(full.to)]).toEqual(['2026-08-01', '2026-08-31']);
    const w = previousRange('week', 0, new Date(2026, 9, 14)); // Wednesday
    expect([dayKey(w.from), dayKey(w.to)]).toEqual(['2026-10-05', '2026-10-07']);
  });

  it('labels', () => {
    expect(offsetLabel('week', 0)).toBe('This week');
    expect(offsetLabel('month', 1)).toBe('Last month');
    expect(offsetLabel('week', 3)).toBe('3 weeks ago');
  });

  it('bars: 7 days or 4 buckets, today and the future marked', () => {
    const byDay = new Map([
      ['2026-10-13', 50_000],
      ['2026-10-18', 20_000],
    ]);
    const week = bars('week', periodRange('week', 0, now), byDay, now);
    expect(week.map((b) => b.amount)).toEqual([0, 50_000, 0, 0, 0, 0, 20_000]);
    expect(week[6]).toMatchObject({ isToday: true, future: false });
    const month = bars('month', periodRange('month', 0, now), byDay, now);
    expect(month.map((b) => b.amount)).toEqual([0, 50_000, 20_000, 0]);
    expect(month[3]).toMatchObject({ label: '22–31', future: true });
  });

  it('changes', () => {
    expect(changePct(112, 100)).toBe(12);
    expect(changePct(50, 0)).toBeNull();
    expect(
      categoryDeltas(
        [
          { category: 'food', amount: 150 },
          { category: 'transport', amount: 40 },
        ],
        [{ category: 'food', amount: 100 }],
      ),
    ).toEqual([
      { category: 'food', amount: 150, before: 100, changePct: 50 },
      { category: 'transport', amount: 40, before: 0, changePct: null },
    ]);
  });
});
