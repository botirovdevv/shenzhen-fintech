// Keyword categorizer (PLAN.md §10): the mock LLM on the server and the app's live preview both use it.
import type { Category, Currency } from './index';

const UZ_NUMBERS: Record<string, number> = {
  bir: 1,
  ikki: 2,
  uch: 3,
  "to'rt": 4,
  tort: 4,
  besh: 5,
  olti: 6,
  yetti: 7,
  sakkiz: 8,
  "to'qqiz": 9,
  toqqiz: 9,
  "o'n": 10,
  yigirma: 20,
  "o'ttiz": 30,
  ottiz: 30,
  qirq: 40,
  ellik: 50,
  oltmish: 60,
  yetmish: 70,
  sakson: 80,
  "to'qson": 90,
  toqson: 90,
};

/** "qirq besh ming" -> 45000, "bir yuz yigirma ming" -> 120000. Null when the text has no number words. */
export function parseUzbekNumber(text: string): number | null {
  const words = text
    .toLowerCase()
    .replace(/[‘’ʻʼ`]/g, "'")
    .split(/[^a-z']+/);
  let total = 0;
  let group = 0;
  let seen = false;
  for (const w of words) {
    if (w === 'ming') {
      total += (group || 1) * 1000;
      group = 0;
      seen = true;
    } else if (w === 'yuz') {
      group = (group || 1) * 100;
      seen = true;
    } else if (UZ_NUMBERS[w] !== undefined) {
      group += UZ_NUMBERS[w];
      seen = true;
    }
  }
  return seen ? total + group : null;
}

const EN_NUMBERS: Record<string, number> = {
  one: 1,
  two: 2,
  three: 3,
  four: 4,
  five: 5,
  six: 6,
  seven: 7,
  eight: 8,
  nine: 9,
  ten: 10,
  eleven: 11,
  twelve: 12,
  thirteen: 13,
  fourteen: 14,
  fifteen: 15,
  sixteen: 16,
  seventeen: 17,
  eighteen: 18,
  nineteen: 19,
  twenty: 20,
  thirty: 30,
  forty: 40,
  fifty: 50,
  sixty: 60,
  seventy: 70,
  eighty: 80,
  ninety: 90,
};
const EN_NUMBER_WORD =
  /^(?:and|hundred|thousand|million|[a-z]+teen|[a-z]+ty|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve)$/;

/** "forty five thousand" -> 45000, "a hundred and twenty" -> 120. Null without a number word. */
export function parseEnglishNumber(text: string): number | null {
  let total = 0;
  let group = 0;
  let seen = false;
  const words = text.toLowerCase().split(/[^a-z]+/);
  for (const [i, w] of words.entries()) {
    if ((w === 'a' || w === 'an') && /^(hundred|thousand|million)$/.test(words[i + 1] ?? '')) {
      group = 1;
    } else if (w === 'thousand' || w === 'million') {
      total += (group || 1) * (w === 'thousand' ? 1000 : 1_000_000);
      group = 0;
      seen = true;
    } else if (w === 'hundred') {
      group = (group || 1) * 100;
      seen = true;
    } else if (EN_NUMBERS[w] !== undefined) {
      group += EN_NUMBERS[w];
      seen = true;
    } else if (w !== 'and') {
      // "a coffee" must not count as 1; only a run of number words does.
      if (!seen) group = 0;
    }
  }
  return seen ? total + group : null;
}

// Currency marks people type or say. Symbols stand alone; words need letter boundaries.
const CURRENCY_TOKENS: [Currency, string][] = [
  ['USD', String.raw`\$|usd|dollar\p{L}*|bucks?|доллар\p{L}*`],
  ['EUR', String.raw`€|eur|euros?|евро|yevro`],
  ['RUB', String.raw`₽|rub|rubl\p{L}*|rubles?|roubles?|руб\p{L}*`],
  ['CNY', String.raw`¥|cny|rmb|yuan|юан\p{L}*`],
  ['UZS', String.raw`uzs|so'?m|sum|сум\p{L}*|сўм`],
];
const CURRENCY = String.raw`(?<![\p{L}])(?:${CURRENCY_TOKENS.map(([, t]) => t).join('|')})(?![\p{L}])`;
const CURRENCY_RE = new RegExp(CURRENCY, 'iu');

/** The currency a mark stands for ("$" -> USD, "so'm" -> UZS), or null. */
export function currencyOf(mark: string): Currency | null {
  for (const [c, t] of CURRENCY_TOKENS) if (new RegExp(String.raw`^(?:${t})$`, 'iu').test(mark.trim())) return c;
  return null;
}

// Not \b: it only knows ASCII letters, so "20 тысяч" would lose its multiplier.
// "45,000" is forty-five thousand (US grouping); "4,5" and "4.50" are decimals.
const AMOUNT_RE = new RegExp(
  String.raw`(?:(${CURRENCY})\s*)?(\d{1,3}(?:,\d{3})+(?:\.\d+)?|\d[\d\s]*(?:[.,]\d+)?)\s*(k|ming|thousand|th|тыс\p{L}*)?\s*(${CURRENCY})?(?![\p{L}\d])`,
  'iu',
);

const toNumber = (raw: string) =>
  parseFloat(/,\d{3}(?!\d)/.test(raw) ? raw.replace(/[\s,]/g, '') : raw.replace(/\s/g, '').replace(',', '.'));

/** "20 ming" / "20k" / "45,000" / "$4.50" / "qirq besh ming" / "twenty dollars" -> amount in whole units, or null. */
export function parseAmount(text: string): number | null {
  return parseMoney(text).amount;
}

function parseMoney(text: string): { amount: number | null; currency: Currency | null; match: string | null; words: 'uz' | 'en' | null } {
  const m = text
    .toLowerCase()
    .replace(/[‘’ʻʼ`]/g, "'")
    .match(AMOUNT_RE);
  const anywhere = text.match(CURRENCY_RE)?.[0];
  if (m?.[2]) {
    let amount = toNumber(m[2]);
    if (m[3]) amount *= 1000;
    const mark = m[1] ?? m[4] ?? anywhere;
    return {
      amount: Math.round(amount * 100) / 100,
      currency: mark ? currencyOf(mark) : null,
      match: text.slice(m.index!, m.index! + m[0].length),
      words: null,
    };
  }
  const currency = anywhere ? currencyOf(anywhere) : null;
  const uz = parseUzbekNumber(text);
  if (uz !== null) return { amount: uz, currency, match: null, words: 'uz' };
  const en = parseEnglishNumber(text);
  return { amount: en, currency, match: null, words: en === null ? null : 'en' };
}

const RULES: [RegExp, Category][] = [
  [/uzum market|mediapark|texnomart/, 'shopping'], // before 'market' -> food
  [/taxi|taksi|yandex|bus|avtobus|metro|benzin|fuel|uber|parking|train|такси|автобус|метро|бензин/, 'transport'],
  [
    /ovqat|osh|kafe|cafe|lunch|dinner|breakfast|bozor|bazaar|market|coffee|non\b|bread|food|grocer|restaurant|pizza|burger|snack|evos|korzinka|makro|havas|supermarket|обед|кофе|еда|продукты/,
    'food',
  ],
  [/svet|gaz|suv|electric|gas|water|internet|kommunal/, 'utilities'],
  [/shop|uzum|kiyim|clothes|shoes|store|magazin/, 'shopping'],
  [/dorixona|pharmacy|doctor|apteka|health/, 'health'],
  [/kino|cinema|game|netflix|concert/, 'entertainment'],
  [/kurs|course|book|kitob|school|lesson/, 'education'],
];

/**
 * Amount in whole units of `currency` (null: the text named none, so it's the user's own),
 * a category and a short description.
 */
export function categorize(text: string): { amount: number | null; currency: Currency | null; category: Category; description: string } {
  const s = text.toLowerCase();
  const { amount, currency, match, words } = parseMoney(text);
  const category = RULES.find(([re]) => re.test(s))?.[1] ?? 'other';
  let rest = text.replace(match ?? '', ' ').replace(new RegExp(CURRENCY, 'giu'), ' ');
  if (words === 'en')
    rest = rest
      .split(/\s+/)
      .filter((w) => !EN_NUMBER_WORD.test(w.toLowerCase().replace(/[^a-z]/g, '')))
      .join(' ');
  const cleaned = rest.replace(/\s+/g, ' ').replace(/^[\s.,!?;:]+|[\s.,!?;:]+$/g, ''); // speech-to-text adds a final period
  const description = cleaned ? cleaned.charAt(0).toUpperCase() + cleaned.slice(1) : 'Expense';
  return { amount, currency, category, description };
}
