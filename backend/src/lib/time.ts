// Day boundaries follow Asia/Tashkent (UTC+5, no DST) regardless of the server's TZ (PLAN.md §4).
const OFFSET_MS = 5 * 60 * 60 * 1000;

/** YYYY-MM-DD of the given instant in Tashkent. */
export function tashkentDate(at: Date = new Date()): string {
  return new Date(at.getTime() + OFFSET_MS).toISOString().slice(0, 10);
}

/** UTC instant of 00:00 Tashkent on the given YYYY-MM-DD. */
export function dayStart(date: string): Date {
  return new Date(Date.parse(`${date}T00:00:00Z`) - OFFSET_MS);
}

export function addDays(date: string, days: number): string {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

export function daysInMonth(date: string): number {
  const [y, m] = date.split('-').map(Number) as [number, number];
  return new Date(Date.UTC(y, m, 0)).getUTCDate();
}

/** UTC instant of hh:mm Tashkent on the given YYYY-MM-DD. */
export function tashkentTime(date: string, hour: number, minute: number): Date {
  return new Date(dayStart(date).getTime() + (hour * 60 + minute) * 60_000);
}

const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;

/** A `from` query value: a date-only value means 00:00 Tashkent of that day. */
export function rangeFrom(v: string): Date {
  return DATE_ONLY.test(v) ? dayStart(v) : new Date(v);
}

/** A `to` query value: a date-only value includes that whole Tashkent day. */
export function rangeTo(v: string): Date {
  return DATE_ONLY.test(v) ? new Date(dayStart(addDays(v, 1)).getTime() - 1) : new Date(v);
}
