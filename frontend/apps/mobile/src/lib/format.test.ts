import { describe, expect, it } from 'vitest';

import { formatAmount, formatUZS, shortAmount } from './format';

const nb = ' ';

describe('formatAmount', () => {
  it('groups thousands with no-break spaces', () => {
    expect(formatAmount(2_350_000)).toBe(`2${nb}350${nb}000`);
    expect(formatAmount(93_548)).toBe(`93${nb}548`);
    expect(formatAmount(500)).toBe('500');
  });

  it('drops fractions and marks negatives', () => {
    expect(formatAmount(1999.9)).toBe(`1${nb}999`);
    expect(formatAmount(-20_000)).toBe(`−20${nb}000`);
  });

  it('adds the currency', () => {
    expect(formatUZS(20_000)).toBe(`20${nb}000 UZS`);
  });
});

describe('shortAmount', () => {
  it('uses k and M', () => {
    expect(shortAmount(72_000)).toBe('72k');
    expect(shortAmount(1_385_000)).toBe('1.4M');
  });
});
