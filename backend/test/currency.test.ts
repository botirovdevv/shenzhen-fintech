import { convertMoney, formatMoney, levelLimits, niceStep, type Account, type AgentAction, type Permissions, type Transaction, type User } from '@femate/shared';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { buildRecommendations } from '../src/agent/recommendations';
import { createProvider } from '../src/agent/llm';
import { handleText } from '../src/bot/core';
import { DEMO } from '../src/db/demo';
import { categorize, parseEnglishNumber } from '../src/rules/categorize';
import { parseSms } from '../src/rules/smsParser';
import type { SttProvider } from '../src/stt/groq';
import { setup } from './helpers';

describe('money helpers', () => {
  it('formats minor units per currency', () => {
    expect(formatMoney(2_350_000, 'UZS')).toBe('2 350 000 UZS');
    expect(formatMoney(450, 'USD')).toBe('$4.50');
    expect(formatMoney(-125_050, 'EUR')).toBe('−€1 250.50');
    expect(formatMoney(35_000, 'RUB')).toBe('350.00 ₽');
  });

  it('converts at the fixed rates and keeps level limits readable', () => {
    expect(convertMoney(500, 'USD', 'UZS')).toBe(60_500);
    expect(convertMoney(60_500, 'UZS', 'USD')).toBe(500);
    expect(levelLimits('L2', 'USD')).toEqual({ perAction: 1_000, daily: 3_000 });
    expect(levelLimits('L1', 'USD')).toBeNull();
    expect([niceStep(83), niceStep(1000), niceStep(413)]).toEqual([100, 1000, 500]);
  });
});

describe('categorizer: currencies and English', () => {
  it.each([
    ['Coffee $4.50', 4.5, 'USD', 'food', 'Coffee'],
    ['Lunch 12 dollars.', 12, 'USD', 'food', 'Lunch'],
    ['Groceries 45,000 som', 45_000, 'UZS', 'food', 'Groceries'],
    ['I spent twenty dollars on a taxi.', 20, 'USD', 'transport', 'I spent on a taxi'],
    ['Dinner 30 euros', 30, 'EUR', 'food', 'Dinner'],
    ['taxi 300 rub', 300, 'RUB', 'transport', 'Taxi'],
    ['forty five thousand for lunch', 45_000, null, 'food', 'For lunch'],
    ['taxi 20 ming', 20_000, null, 'transport', 'Taxi'],
  ])('%s', (text, amount, currency, category, description) => {
    expect(categorize(text)).toEqual({ amount, currency, category, description });
  });

  it('English number words', () => {
    expect(parseEnglishNumber('a hundred and twenty')).toBe(120);
    expect(parseEnglishNumber('two thousand five hundred')).toBe(2_500);
    expect(parseEnglishNumber('a coffee please')).toBeNull();
  });

  it('SMS in dollars keeps the cents', () => {
    expect(parseSms('VISA *4471 Pokupka 12.50 USD AMAZON 17.10.26 10:00')).toMatchObject({ amount: 12.5, currency: 'USD' });
    expect(parseSms('HUMOCARD *4471: oplata 45 000.00 UZS; EVOS')).toMatchObject({ amount: 45_000, currency: 'UZS' });
  });

  it('recommendation thresholds follow the currency', () => {
    const spends = Array.from({ length: 14 }, (_, i) => [
      { amount: 165, category: 'transport', description: 'Yandex Go', day: `d${i}` }, // ≈ 20 000 UZS in cents
      { amount: 273, category: 'food', description: 'Lunch', day: `d${i}` },
    ]).flat();
    const recs = buildRecommendations(spends, 31, 'USD');
    expect(recs.find((r) => r.title.includes('bus'))?.body).toContain('$0.33 bus round trip');
    expect(recs.find((r) => r.actionType === 'set_budget')?.actionPayload).toEqual({ category: 'food', monthlyLimit: 7_000 }); // $84.63 on pace, capped to $70
  });
});

describe('currency in the API', () => {
  let t: Awaited<ReturnType<typeof setup>>;
  const heard: { text: string; language?: string }[] = [];
  const stt: SttProvider = {
    transcribe: async ({ language }) => {
      const next = heard.shift();
      if (next) next.language = language;
      return next?.text ?? '';
    },
  };
  beforeEach(async () => {
    t = await setup({ stt });
  });
  afterEach(async () => {
    await t.close();
  });

  it('a foreign expense is converted and keeps what was entered', async () => {
    const a = await t.call<Transaction>('POST', '/transactions', { text: 'Coffee $5' });
    expect(a.body).toMatchObject({ amount: 60_500, category: 'food', description: 'Coffee', original: { amount: 500, currency: 'USD' } });
    const b = await t.call<Transaction>('POST', '/transactions', { amount: 1_000, currency: 'EUR', category: 'shopping', description: 'Book' });
    expect(b.body).toMatchObject({ amount: 140_000, original: { amount: 1_000, currency: 'EUR' } });
    const c = await t.call<Transaction>('POST', '/transactions', { text: 'taxi 20 ming' });
    expect(c.body.amount).toBe(20_000);
    expect(c.body.original).toBeUndefined();
    expect(await handleText(t.db, createProvider({ LLM_PROVIDER: 'mock' }), DEMO.id, 'lunch 10 dollars')).toMatch(/Lunch, 121 000 UZS \(\$10\.00\) \(food\)/);
  });

  it('switching to USD converts balances, history, limits and pending actions', async () => {
    const before = (await t.call<Account[]>('GET', '/accounts')).body.find((x) => x.type === 'card')!;
    const pending = (await t.call<{ reply: string; actions: AgentAction[] }>('POST', '/agent/chat', { message: 'move 24 200 to savings' })).body.actions[0]!;
    expect(pending).toMatchObject({ status: 'pending', amount: 24_200 });

    const txBefore = (await t.call<{ items: Transaction[] }>('GET', '/transactions?limit=100')).body.items;
    const me = await t.call<User>('PATCH', '/me', { currency: 'USD', voiceLanguage: 'en' });
    expect(me.body).toMatchObject({ currency: 'USD', voiceLanguage: 'en', monthlyIncome: 33_060 }); // $330.58, rounded to 10¢
    const card = (await t.call<Account[]>('GET', '/accounts')).body.find((x) => x.type === 'card')!;
    expect(card).toMatchObject({ currency: 'USD', balance: convertMoney(before.balance, 'UZS', 'USD') });
    expect((await t.call<Permissions>('GET', '/permissions')).body).toMatchObject({ perActionLimit: 826, dailyLimit: 2_479 });
    const acts = (await t.call<AgentAction[]>('GET', '/agent/actions?status=pending')).body;
    expect(acts[0]).toMatchObject({ id: pending.id, amount: 200 });

    // Approving moves the converted amount; limits are checked in dollars.
    await t.call('POST', `/agent/actions/${pending.id}/approve`);
    expect((await t.call<Account[]>('GET', '/accounts')).body.find((x) => x.type === 'card')!.balance).toBe(card.balance - 200);
    const big = (await t.call<{ reply: string; actions: AgentAction[] }>('POST', '/agent/chat', { message: 'move $50 to savings' })).body;
    expect(big.actions[0]).toMatchObject({ status: 'blocked', amount: 5_000 });
    expect(big.reply).toContain('$50.00 is over your $8.26 per-action limit');

    // An expense entered in so'm on the USD account keeps its original; switching back to UZS drops it.
    const soum = await t.call<Transaction>('POST', '/transactions', { text: 'Osh 30 ming so’m' });
    expect(soum.body).toMatchObject({ amount: 248, original: { amount: 30_000, currency: 'UZS' } });
    await t.call('PATCH', '/me', { currency: 'UZS' });
    const after = (await t.call<{ items: Transaction[] }>('GET', '/transactions?limit=100')).body.items;
    expect(after[0]).toMatchObject({ amount: 30_000 });
    expect(after[0]!.original).toBeUndefined();
    // The round trip is exact for history, and typed profile numbers come back round.
    const amounts = (xs: Transaction[]) => new Map(xs.map((x) => [x.id, x.amount]));
    const back = amounts(after);
    for (const [id, amount] of amounts(txBefore)) expect(back.get(id)).toBe(amount);
    expect((await t.call<User>('GET', '/me')).body).toMatchObject({ monthlyIncome: 4_000_000, fixedCostsMonthly: 600_000, savingsGoalMonthly: 500_000 });
  });

  it('voice uses the language from the profile', async () => {
    await t.call('PATCH', '/me', { voiceLanguage: 'en' });
    const login = await t.app.inject({ method: 'POST', url: '/api/v1/auth/login', payload: { email: DEMO.email, password: DEMO.password } });
    const form = new FormData();
    form.append('audio', new Blob([new Uint8Array(100)], { type: 'audio/m4a' }), 'voice.m4a');
    const call = { text: 'Lunch twelve dollars.' } as { text: string; language?: string };
    heard.push(call);
    const res = await t.app.inject({
      method: 'POST',
      url: '/api/v1/transactions/voice',
      payload: form,
      headers: { authorization: `Bearer ${login.json<{ token: string }>().token}` },
    });
    expect(call.language).toBe('en');
    expect(res.json()).toMatchObject({ transaction: { amount: 145_200, description: 'Lunch', original: { amount: 1_200, currency: 'USD' } } });
  });
});
