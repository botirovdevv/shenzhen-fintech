// Reports periods: a week (Mon–Sun) or a calendar month, stepped back with `offset` (0 = current),
// plus the matching earlier period for comparisons. Local time, like the rest of the app.
import type { Category } from '@femate/shared';

export type Period = 'week' | 'month';

export interface Range {
  from: Date;
  to: Date;
}

export interface Bar {
  label: string;
  amount: number;
  isToday: boolean;
  future: boolean;
}

const DAY = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

export const dayKey = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

/** The week or month `offset` periods before the current one. */
export function periodRange(period: Period, offset = 0, now = new Date()): Range {
  if (period === 'week') {
    const from = new Date(now);
    from.setDate(now.getDate() - ((now.getDay() + 6) % 7) - 7 * offset); // Monday
    from.setHours(0, 0, 0, 0);
    const to = new Date(from);
    to.setDate(from.getDate() + 6);
    to.setHours(23, 59, 59, 999);
    return { from, to };
  }
  const from = new Date(now.getFullYear(), now.getMonth() - offset, 1);
  const to = new Date(now.getFullYear(), now.getMonth() - offset + 1, 0, 23, 59, 59, 999);
  return { from, to };
}

/**
 * The period before `offset`, for "vs last week / month". For the current, unfinished period only the same
 * number of days is compared (Oct 1–18 against Sep 1–18), so a half-done month isn't set against a whole one.
 */
export function previousRange(period: Period, offset = 0, now = new Date()): Range {
  const prev = periodRange(period, offset + 1, now);
  if (offset > 0) return prev;
  const cur = periodRange(period, 0, now);
  const elapsedDays = Math.floor((startOfDay(now).getTime() - cur.from.getTime()) / 86_400_000);
  const to = new Date(prev.from);
  to.setDate(prev.from.getDate() + elapsedDays);
  to.setHours(23, 59, 59, 999);
  return { from: prev.from, to: to < prev.to ? to : prev.to };
}

const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate());

const short = (d: Date) => d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });

/** "12–18 Oct", "28 Sept – 4 Oct", "October 2026". */
export function rangeLabel(period: Period, r: Range): string {
  if (period === 'month') return r.from.toLocaleDateString('en-GB', { month: 'long', year: 'numeric' });
  const sameMonth = r.from.getMonth() === r.to.getMonth();
  return sameMonth ? `${r.from.getDate()}–${short(r.to)}` : `${short(r.from)} – ${short(r.to)}`;
}

/** "This week", "Last week", "3 weeks ago", "This month", "Last month", "5 months ago". */
export function offsetLabel(period: Period, offset: number): string {
  if (offset === 0) return `This ${period}`;
  if (offset === 1) return `Last ${period}`;
  return `${offset} ${period}s ago`;
}

/** Bars for the chart: 7 days for a week, 4 week-long buckets for a month. */
export function bars(period: Period, r: Range, byDay: Map<string, number>, now = new Date()): Bar[] {
  const today = dayKey(now);
  if (period === 'week') {
    return DAY.map((label, i) => {
      const d = new Date(r.from);
      d.setDate(r.from.getDate() + i);
      return { label, amount: byDay.get(dayKey(d)) ?? 0, isToday: dayKey(d) === today, future: d > now };
    });
  }
  const last = new Date(r.from.getFullYear(), r.from.getMonth() + 1, 0).getDate();
  const weeks = [
    [1, 7],
    [8, 14],
    [15, 21],
    [22, last],
  ] as const;
  return weeks.map(([a, b], i) => {
    let amount = 0;
    let isToday = false;
    for (let day = a; day <= b; day++) {
      const k = dayKey(new Date(r.from.getFullYear(), r.from.getMonth(), day));
      amount += byDay.get(k) ?? 0;
      if (k === today) isToday = true;
    }
    const label = i === 0 ? `${r.from.toLocaleDateString('en-GB', { month: 'short' })} ${a}–${b}` : `${a}–${b}`;
    return { label, amount, isToday, future: new Date(r.from.getFullYear(), r.from.getMonth(), a) > now };
  });
}

/** Percentage change from `before` to `now`, or null when there is nothing to compare with. */
export function changePct(now: number, before: number): number | null {
  if (before <= 0) return null;
  return Math.round((now / before - 1) * 100);
}

/** Each category's amount now and before, biggest now first. */
export function categoryDeltas(
  now: { category: Category; amount: number }[],
  before: { category: Category; amount: number }[],
): { category: Category; amount: number; before: number; changePct: number | null }[] {
  const prev = new Map(before.map((c) => [c.category, c.amount]));
  return now.map((c) => ({ ...c, before: prev.get(c.category) ?? 0, changePct: changePct(c.amount, prev.get(c.category) ?? 0) }));
}
