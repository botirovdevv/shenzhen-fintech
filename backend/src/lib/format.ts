/** 2350000 -> "2 350 000" (the app's money format). */
export const fmt = (n: number) => Math.round(n).toLocaleString('en-US').replace(/,/g, ' ');

/** Mask anything that looks like a 16-digit card number: "8600 **** **** 4471" (PLAN.md §8). */
export function maskCards(text: string): string {
  return text.replace(/\b(\d{4})[\s-]?\d{4}[\s-]?\d{4}[\s-]?(\d{4})\b/g, '$1 **** **** $2');
}
