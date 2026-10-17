import type { Account, AuditEntry, CardAuthorization, CardDetails, CardStatus, Page, PaymentCard, SimulatePurchaseResponse, Transaction } from '@femate/shared';
import { createHmac } from 'node:crypto';
import { afterEach, describe, expect, it } from 'vitest';

import { categoryOf, merchantName } from '../src/card/cards';
import { verifyLithicSignature, type CardIssuer } from '../src/card/lithic';
import { DEMO } from '../src/db/demo';
import { budgets } from '../src/db/schema';
import { setup } from './helpers';

const PAN = '4111111289144142';

/** Lithic stand-in: simulated purchases call our ASA endpoint like Lithic does. */
function fakeLithic() {
  const state = { paused: false, created: 0, asa: async (_body: object) => {} };
  let n = 0;
  const issuer: CardIssuer = {
    sandbox: true,
    async createCard() {
      state.created++;
      return { token: 'lith_card_1', lastFour: '4142', expMonth: '06', expYear: '2031', network: 'VISA' };
    },
    async cardDetails() {
      return { pan: PAN, cvv: '123', expMonth: '06', expYear: '2031' };
    },
    async setPaused(_t, paused) {
      state.paused = paused;
    },
    async simulatePurchase({ amountCents, descriptor, mcc }) {
      const token = `lith_tx_${++n}`;
      await state.asa({
        token,
        status: 'AUTHORIZATION',
        card: { token: 'lith_card_1', last_four: '4142' },
        amounts: { cardholder: { amount: amountCents, currency: 'USD', conversion_rate: '1' } },
        merchant: { descriptor, mcc: mcc ?? '5999', city: 'TASHKENT', country: 'UZB' },
      });
      return token;
    },
  };
  return { issuer, state };
}

let t: Awaited<ReturnType<typeof setup>>;

async function withCard(config = {}) {
  const lithic = fakeLithic();
  t = await setup({ cards: lithic.issuer, config });
  lithic.state.asa = async (body) => {
    await t.app.inject({ method: 'POST', url: '/api/v1/lithic/asa', payload: body });
  };
  const issued = await t.call<PaymentCard>('POST', '/card');
  expect(issued.status).toBe(201);
  return lithic;
}

const asa = (body: object, headers: Record<string, string> = {}) =>
  t.app.inject({ method: 'POST', url: '/api/v1/lithic/asa', payload: JSON.stringify(body), headers: { 'content-type': 'application/json', ...headers } });

const purchase = (token: string, cents: number, descriptor = 'EVOS', mcc = '5814') => ({
  token,
  status: 'AUTHORIZATION',
  card: { token: 'lith_card_1' },
  amounts: { cardholder: { amount: cents, currency: 'USD' } },
  merchant: { descriptor, mcc },
});

const cardBalance = async () => (await t.call<Account[]>('GET', '/accounts')).body.find((a) => a.type === 'card')!;

describe('FeMate card', () => {
  afterEach(async () => {
    await t.close();
  });

  it('is off without a provider', async () => {
    t = await setup();
    expect((await t.call<CardStatus>('GET', '/card')).body).toEqual({ available: false, sandbox: true, card: null });
    expect((await t.call('POST', '/card')).body).toMatchObject({ error: { code: 'CARD_UNAVAILABLE' } });
  });

  it('issues one card on the card account, renames it and shows details on demand', async () => {
    const lithic = await withCard();
    const status = (await t.call<CardStatus>('GET', '/card')).body;
    expect(status).toMatchObject({ available: true, sandbox: true, card: { network: 'VISA', lastFour: '4142', frozen: false, blockOverBudget: true } });
    expect((await cardBalance()).name).toBe('Visa ·· 4142');
    expect((await t.call('POST', '/card')).body).toMatchObject({ error: { code: 'CARD_EXISTS' } });
    expect(lithic.state.created).toBe(1);
    expect((await t.call<CardDetails>('GET', '/card/details')).body).toEqual({ pan: PAN, cvv: '123', expMonth: '06', expYear: '2031' });
    const log = (await t.call<Page<AuditEntry>>('GET', '/audit')).body.items.map((e) => e.event);
    expect(log).toEqual(expect.arrayContaining(['card.issue', 'card.reveal']));
    // The full number never reaches the audit log.
    expect(JSON.stringify((await t.call('GET', '/audit/export')).body)).not.toContain(PAN);
  });

  it('approves a purchase: debits the card, records it in UZS with the USD original, idempotent on retry', async () => {
    await withCard();
    const before = (await cardBalance()).balance;
    const res = await asa(purchase('tx_1', 350));
    expect(res.json()).toEqual({ result: 'APPROVED' });
    expect((await asa(purchase('tx_1', 350))).json()).toEqual({ result: 'APPROVED' });
    // $3.50 at 12 100 UZS per USD
    expect((await cardBalance()).balance).toBe(before - 42_350);
    const tx = (await t.call<Page<Transaction>>('GET', '/transactions?limit=1')).body.items[0]!;
    expect(tx).toMatchObject({ amount: 42_350, description: 'Evos', category: 'food', source: 'card', original: { amount: 350, currency: 'USD' } });
    const auths = (await t.call<CardAuthorization[]>('GET', '/card/authorizations')).body;
    expect(auths).toHaveLength(1);
    expect(auths[0]).toMatchObject({ approved: true, result: 'APPROVED', transactionId: tx.id });
  });

  it('declines: insufficient funds, over budget, frozen, unknown card', async () => {
    const lithic = await withCard();
    expect((await asa(purchase('big', 1_000_000))).json()).toEqual({ result: 'INSUFFICIENT_FUNDS' });

    await t.db.insert(budgets).values({ id: 'bud_1', userId: DEMO.id, category: 'shopping', monthlyLimit: 1 });
    expect((await asa(purchase('shop', 100, 'UZUM MARKET', '5311'))).json()).toEqual({ result: 'VELOCITY_EXCEEDED' });
    await t.call('PATCH', '/card', { blockOverBudget: false });
    expect((await asa(purchase('shop2', 100, 'UZUM MARKET', '5311'))).json()).toEqual({ result: 'APPROVED' });

    const frozen = await t.call<PaymentCard>('PATCH', '/card', { frozen: true });
    expect(frozen.body.frozen).toBe(true);
    expect(lithic.state.paused).toBe(true);
    expect((await asa(purchase('f', 100))).json()).toEqual({ result: 'CARD_PAUSED' });

    expect((await asa({ ...purchase('x', 100), card: { token: 'someone_else' } })).json()).toEqual({ result: 'UNAUTHORIZED_MERCHANT' });
    expect((await asa({ junk: true })).json()).toEqual({ result: 'UNAUTHORIZED_MERCHANT' });

    const auths = (await t.call<CardAuthorization[]>('GET', '/card/authorizations')).body;
    expect(auths.map((a) => a.result)).toEqual(['CARD_PAUSED', 'APPROVED', 'VELOCITY_EXCEEDED', 'INSUFFICIENT_FUNDS']);
    const blocked = (await t.call<Page<AuditEntry>>('GET', '/audit')).body.items.filter((e) => e.event === 'card.authorization' && e.decision === 'blocked');
    expect(blocked).toHaveLength(3);
  });

  it('simulated purchase goes through Lithic -> ASA and returns the decision; frozen is declined locally', async () => {
    await withCard();
    const ok = await t.call<SimulatePurchaseResponse>('POST', '/card/simulate', { amount: 45_000, merchant: 'Evos', mcc: '5814' });
    expect(ok.status).toBe(201);
    expect(ok.body.authorization).toMatchObject({ approved: true, merchant: 'Evos', category: 'food', original: { amount: 372, currency: 'USD' } });
    await t.call('PATCH', '/card', { frozen: true });
    const no = await t.call<SimulatePurchaseResponse>('POST', '/card/simulate', { amount: 45_000, merchant: 'Evos' });
    expect(no.body.authorization).toMatchObject({ approved: false, result: 'CARD_PAUSED' });
  });

  it('checks the ASA signature when a secret is set, and requires one in production', async () => {
    const secret = `whsec_${Buffer.from('lithic-test-secret').toString('base64')}`;
    await withCard({ LITHIC_ASA_SECRET: secret });
    const body = JSON.stringify(purchase('signed', 100));
    const ts = String(Math.floor(Date.now() / 1000));
    const sig = createHmac('sha256', Buffer.from('lithic-test-secret')).update(`msg_1.${ts}.${body}`).digest('base64');
    const headers = { 'webhook-id': 'msg_1', 'webhook-timestamp': ts, 'webhook-signature': `v1,${sig}` };
    expect((await asa(JSON.parse(body), headers)).json()).toEqual({ result: 'APPROVED' });
    expect((await asa(purchase('unsigned', 100))).statusCode).toBe(401);
    expect(verifyLithicSignature(secret, body, headers, Date.now() + 10 * 60_000)).toBe(false);
    await t.close();

    await withCard({ LITHIC_ENV: 'production' });
    expect((await asa(purchase('p', 100))).statusCode).toBe(401);
  });
});

describe('card helpers', () => {
  it('MCC and descriptor to category, tidy merchant names', () => {
    expect(categoryOf('4121', 'YANDEX GO')).toBe('transport');
    expect(categoryOf('5411', 'KORZINKA')).toBe('food');
    expect(categoryOf('5912', 'APTEKA')).toBe('health');
    expect(categoryOf('0000', 'osh markazi')).toBe('food');
    expect(categoryOf(undefined, 'something')).toBe('other');
    expect(merchantName('  EVOS   CHILONZOR ')).toBe('Evos Chilonzor');
  });
});
