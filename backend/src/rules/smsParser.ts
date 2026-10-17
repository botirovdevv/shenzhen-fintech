// Bank SMS parser (PLAN.md §9): Uzcard / Humo style notifications forwarded to the bot.
// Regex only; the merchant goes to the categorizer afterwards. Null means "not a bank SMS".
import type { Currency } from '@femate/shared';

import { tashkentTime } from '../lib/time';

export interface ParsedSms {
  /** Whole units of `currency`, cents kept ("12.50 USD" -> 12.5). */
  amount: number;
  currency: Currency;
  direction: 'out' | 'in';
  merchant: string;
  /** "*4471", or null when the SMS has no card number. */
  cardMask: string | null;
  /** From the SMS when it has a date and time, else null (use "now"). */
  occurredAt: Date | null;
}

const CURRENCY = String.raw`(?:uzs|so'?m|sum|сум|usd|eur|rub|cny)`;
const AMOUNT_RE = new RegExp(String.raw`(\d[\d\s,]*(?:\.\d{1,2})?)\s*(${CURRENCY})(?![a-z])`, 'i');
const SMS_CURRENCY: Record<string, Currency> = { usd: 'USD', eur: 'EUR', rub: 'RUB', cny: 'CNY' };
const BALANCE_RE = /balans|balance|dostupno|ostatok|qoldiq|доступно|остаток|баланс/i;
const CARD_RE = /\*+\s?(\d{4})\b|\b\d{4}\s?\*{2,}[\s*]*(\d{4})\b/;
const CARD_WORD_RE = /karta|card|карта|humo|uzcard/i;
const INCOME_RE = /popolnenie|zachislenie|пополнение|зачисление|to'ldir|tushum|kirim|received|credit|поступление/i;
const DATE_RE = /(\d{2})\.(\d{2})\.(\d{2}|\d{4})\s+(\d{2}):(\d{2})/;
const PREFIX_RE = /^(pokupka|oplata|spisanie|platezh|покупка|оплата|списание|платеж|платёж|to'lov|tolov|xarid|purchase|payment)\b[:\s]*/i;
const NOT_MERCHANT_RE = new RegExp(
  String.raw`\d{2}[.:]\d{2}|\d{4}|\*{2,}|${CURRENCY}\b|karta|card|карта|balans|dostupno|qoldiq|доступно|остаток|summa|сумма|^uz$`,
  'i',
);

/** "45 000.00" / "30 000,00" / "1,250,000.00" / "12.50" -> 45000 / 30000 / 1250000 / 12.5. */
function toSum(raw: string): number {
  const s = raw.replace(/\s/g, '');
  const cents = s.match(/[.,](\d{1,2})$/);
  const whole = parseInt((cents ? s.slice(0, -cents[0].length) : s).replace(/[.,]/g, ''), 10);
  return cents ? whole + Number(cents[1]!.padEnd(2, '0')) / 100 : whole;
}

export function parseSms(text: string): ParsedSms | null {
  const s = text.replace(/[‘’ʻʼ`]/g, "'");
  const card = s.match(CARD_RE);
  if (!card && !CARD_WORD_RE.test(s)) return null;

  // The amount is the first sum before the balance, never the balance itself.
  const balanceAt = s.search(BALANCE_RE);
  const head = balanceAt > 0 ? s.slice(0, balanceAt) : s;
  const m = head.match(AMOUNT_RE);
  if (!m?.[1]) return null;
  const amount = toSum(m[1]);
  if (!Number.isFinite(amount) || amount <= 0) return null;

  const merchant =
    head
      .split(/[;\n]|,\s|\.\s|:\s/)
      .map((seg) => seg.trim().replace(PREFIX_RE, '').trim())
      .find((seg) => /\p{L}{2}/u.test(seg) && !NOT_MERCHANT_RE.test(seg) && !PREFIX_RE.test(seg) && !INCOME_RE.test(seg)) ??
    // One-line SMS: the merchant is the capitalised run left after removing everything known.
    head
      .replace(AMOUNT_RE, ' ')
      .replace(CARD_RE, ' ')
      .replace(DATE_RE, ' ')
      .replace(/\b(uzcard|humo\w*|karta|card|oplata|pokupka|spisanie|uzs)\b/gi, ' ')
      .match(/[A-ZА-Я][A-ZА-Я0-9&' -]{2,}/)?.[0]
      .trim() ??
    '';

  let occurredAt: Date | null = null;
  const d = s.match(DATE_RE);
  if (d) {
    const [, dd, mm, yy, hh, mi] = d as unknown as [string, string, string, string, string, string];
    const year = yy.length === 2 ? `20${yy}` : yy;
    const at = tashkentTime(`${year}-${mm}-${dd}`, Number(hh), Number(mi));
    // Ignore impossible or future dates rather than trusting them.
    if (!Number.isNaN(at.getTime()) && at.getTime() <= Date.now() + 5 * 60_000) occurredAt = at;
  }

  return {
    amount,
    currency: SMS_CURRENCY[m[2]!.toLowerCase()] ?? 'UZS',
    direction: INCOME_RE.test(s) ? 'in' : 'out',
    merchant,
    cardMask: card ? `*${card[1] ?? card[2]}` : null,
    occurredAt,
  };
}
