// Anomaly rule (PLAN.md §9): a spend is unusual when it is more than 3× the median of the same
// category over the last 30 days AND at least 100 000 so'm (or the same value in the user's currency).
export const ANOMALY_FACTOR = 3;
export const ANOMALY_MIN_UZS = 100_000;
export const ANOMALY_WINDOW_DAYS = 30;

export function median(values: number[]): number {
  if (!values.length) return 0;
  const s = [...values].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid]! : Math.round((s[mid - 1]! + s[mid]!) / 2);
}

/**
 * Pure. `history` is the category's other spends in the window (minor units); `minAmount` is
 * ANOMALY_MIN_UZS in the user's currency. With no history there is nothing to compare against.
 */
export function isAnomaly(amount: number, history: number[], minAmount: number): { anomaly: boolean; median: number } {
  const m = median(history);
  return { anomaly: history.length > 0 && amount >= minAmount && amount > ANOMALY_FACTOR * m, median: m };
}
