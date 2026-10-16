import type { Category } from '@femate/shared';

// 2350000 -> "2 350 000" (no-break thin grouping keeps the number on one line).
export function formatAmount(n: number): string {
  const sign = n < 0 ? '−' : '';
  return sign + String(Math.abs(Math.trunc(n))).replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
}

export function formatUZS(n: number): string {
  return `${formatAmount(n)} UZS`;
}

export function shortAmount(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  return `${Math.round(n / 1000)}k`;
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
