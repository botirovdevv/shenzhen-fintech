import { describe, expect, it } from 'vitest';

import { formatAmount, formatMoney, formatUZS, formatWhole, parseAmountInput, parseWhole, shortAmount } from './format';

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
    expect(shortAmount(1_250, 'USD')).toBe('13');
    expect(shortAmount(250_000, 'USD')).toBe('2.5k');
  });
});

describe('other currencies', () => {
  it('shows cents and the symbol', () => {
    expect(formatAmount(125_050, 'USD')).toBe(`1${nb}250.50`);
    expect(formatMoney(450, 'USD')).toBe('$4.50');
    expect(formatMoney(-500, 'EUR')).toBe('−€5.00');
    expect(formatMoney(35_000, 'RUB')).toBe('350.00 ₽');
  });

  it('parses typed amounts into minor units', () => {
    expect(parseAmountInput('4.5', 'USD')).toBe(450);
    expect(parseAmountInput('4,50', 'EUR')).toBe(450);
    expect(parseAmountInput('20 000', 'UZS')).toBe(20_000);
    expect(parseAmountInput('', 'USD')).toBe(0);
    expect(parseWhole('1 250', 'USD')).toBe(125_000);
    expect(formatWhole(33_058, 'USD')).toBe('331');
  });
});
