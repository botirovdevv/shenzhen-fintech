import { CURRENCY_INFO, toMajor, toMinor, type Category, type Currency } from '@femate/shared';

const group = (whole: number) => String(whole).replace(/\B(?=(\d{3})+(?!\d))/g, ' ');

// Amounts are minor units of the currency (so'm, cents). 2350000 UZS -> "2 350 000", 125050 USD -> "1 250.50"
// (no-break grouping keeps the number on one line).
export function formatAmount(n: number, c: Currency = 'UZS'): string {
  const sign = n < 0 ? '−' : '';
  const d = CURRENCY_INFO[c].decimals;
  const abs = Math.abs(Math.trunc(n));
  return sign + group(Math.floor(abs / 10 ** d)) + (d ? `.${String(abs % 10 ** d).padStart(d, '0')}` : '');
}

/** With the currency mark: "20 000 UZS", "$4.50", "350.00 ₽". */
export function formatMoney(n: number, c: Currency = 'UZS'): string {
  const i = CURRENCY_INFO[c];
  const a = formatAmount(n, c);
  if (!i.symbolFirst) return `${a} ${i.symbol}`;
  return a.startsWith('−') ? `−${i.symbol}${a.slice(1)}` : `${i.symbol}${a}`;
}

export function formatUZS(n: number): string {
  return formatMoney(n, 'UZS');
}

export function shortAmount(n: number, c: Currency = 'UZS'): string {
  const v = toMajor(n, c);
  if (v >= 1_000_000) return `${(v / 1_000_000).toFixed(1)}M`;
  if (v >= 10_000 || (c === 'UZS' && v >= 1000)) return `${Math.round(v / 1000)}k`;
  if (v >= 1000) return `${(v / 1000).toFixed(1)}k`;
  return String(Math.round(v));
}

/** Whole units for big inputs: 4000000 UZS -> "4 000 000", 33058 USD cents -> "331". */
export function formatWhole(n: number, c: Currency = 'UZS'): string {
  return group(Math.round(toMajor(n, c)));
}

/** An amount as an editable input value, no grouping: 33058 USD -> "330.58", 33000 USD -> "330", 4000000 UZS -> "4000000". */
export function amountInputValue(n: number, c: Currency = 'UZS'): string {
  const d = CURRENCY_INFO[c].decimals;
  const abs = Math.max(0, Math.trunc(n));
  const cents = d ? abs % 10 ** d : 0;
  return String(Math.floor(abs / 10 ** d)) + (cents ? `.${String(cents).padStart(d, '0')}` : '');
}

/** What the user typed in whole units -> minor units ("1 250" USD -> 125000). */
export function parseWhole(text: string, c: Currency = 'UZS'): number {
  return toMinor(Number(text.replace(/\D/g, '').slice(0, 10) || 0), c);
}

/** "4.50" / "4,5" / "20 000" -> minor units, or 0. Up to the currency's decimals. */
export function parseAmountInput(text: string, c: Currency = 'UZS'): number {
  const d = CURRENCY_INFO[c].decimals;
  const s = text.replace(/\s/g, '').replace(',', '.');
  const m = s.match(d ? /^(\d{0,10})(?:\.(\d{0,2}))?/ : /^(\d{0,10})/);
  if (!m) return 0;
  return toMinor(Number(`${m[1] || 0}.${m[2] ?? ''}0`), c);
}

export const categoryLabel: Record<Category, string> = {
  transport: 'Transport',
  food: 'Food',
  utilities: 'Utilities',
  shopping: 'Shopping',
  health: 'Health',
  entertainment: 'Entertainment',
  education: 'Education',
  transfer: 'Transfer',
  other: 'Other',
};

export function formatTime(iso: string, now = new Date()): string {
  const d = new Date(iso);
  const sameDay = d.toDateString() === now.toDateString();
  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  const hm = `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
  if (sameDay) return hm;
  if (d.toDateString() === yesterday.toDateString()) return 'Yesterday';
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
}

export function greeting(now = new Date()): string {
  const h = now.getHours();
  if (h < 12) return 'Good morning';
  if (h < 18) return 'Good afternoon';
  return 'Good evening';
}
