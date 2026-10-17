// Keyword categorizer used by the mock LLM (PLAN.md §10). Ported from the app's mock API.
import type { Category } from '@femate/shared';

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

const AMOUNT_RE = /(\d[\d\s]*(?:[.,]\d+)?)\s*(k|ming|thousand|th|тыс)?\b/;

/** "20 ming" / "20k" / "20 000" / "qirq besh ming" -> integer UZS, or null. */
export function parseAmount(text: string): number | null {
  const m = text.toLowerCase().match(AMOUNT_RE);
  if (m?.[1]) {
    let amount = parseFloat(m[1].replace(/\s/g, '').replace(',', '.'));
    if (m[2]) amount *= 1000;
    return Math.round(amount);
  }
  return parseUzbekNumber(text);
}

const RULES: [RegExp, Category][] = [
  [/uzum market|mediapark|texnomart/, 'shopping'], // before 'market' -> food
  [/taxi|taksi|yandex|bus|avtobus|metro|benzin|fuel|uber/, 'transport'],
  [/ovqat|osh|kafe|cafe|lunch|dinner|breakfast|bozor|bazaar|market|coffee|non\b|bread|food|restaurant|evos|korzinka|makro|havas|supermarket/, 'food'],
  [/svet|gaz|suv|electric|gas|water|internet|kommunal/, 'utilities'],
  [/shop|uzum|kiyim|clothes|shoes|store|magazin/, 'shopping'],
  [/dorixona|pharmacy|doctor|apteka|health/, 'health'],
  [/kino|cinema|game|netflix|concert/, 'entertainment'],
  [/kurs|course|book|kitob|school|lesson/, 'education'],
];

export function categorize(text: string): { amount: number | null; category: Category; description: string } {
  const s = text.toLowerCase();
  const m = s.match(AMOUNT_RE);
  const amount = parseAmount(text);
  const category = RULES.find(([re]) => re.test(s))?.[1] ?? 'other';
  const words = text
    .replace(m?.[0] ?? '', ' ')
    .replace(/\s+/g, ' ')
    .trim();
  const description = words ? words.charAt(0).toUpperCase() + words.slice(1) : 'Expense';
  return { amount, category, description };
}
