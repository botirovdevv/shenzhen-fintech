// Lithic card issuing (https://docs.lithic.com). Off when LITHIC_API_KEY is empty.
import { createHmac, timingSafeEqual } from 'node:crypto';

import { ApiError } from '../lib/errors';

export interface IssuedCard {
  token: string;
  lastFour: string;
  expMonth: string;
  expYear: string;
  network: 'VISA' | 'MASTERCARD';
}

export interface CardIssuer {
  /** Sandbox cards hold no real money and accept simulated purchases. */
  sandbox: boolean;
  createCard(memo: string): Promise<IssuedCard>;
  /** Full number and CVV, straight from Lithic (sandbox returns them; production needs PCI). */
  cardDetails(token: string): Promise<{ pan: string; cvv: string; expMonth: string; expYear: string }>;
  setPaused(token: string, paused: boolean): Promise<void>;
  /** Sandbox: a purchase as if from a merchant. Lithic sends it to our ASA endpoint first. Returns its token. */
  simulatePurchase(p: { pan: string; amountCents: number; descriptor: string; mcc?: string }): Promise<string>;
}

interface LithicCard {
  token: string;
  last_four: string;
  exp_month?: string;
  exp_year?: string;
  pan?: string;
  cvv?: string;
}

const BASE_URL = { sandbox: 'https://sandbox.lithic.com', production: 'https://api.lithic.com' };

// The BIN decides the network: 4… is Visa, 51–55 / 22–27 Mastercard.
const networkOf = (pan: string | undefined): IssuedCard['network'] => (pan?.startsWith('4') ? 'VISA' : pan ? 'MASTERCARD' : 'VISA');

export function createLithic(apiKey: string, env: 'sandbox' | 'production'): CardIssuer | null {
  if (!apiKey) return null;
  async function call<T>(method: string, path: string, body?: unknown): Promise<T> {
    let res: Response;
    try {
      res = await fetch(`${BASE_URL[env]}${path}`, {
        method,
        headers: { Authorization: apiKey, ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}) },
        body: body !== undefined ? JSON.stringify(body) : undefined,
        signal: AbortSignal.timeout(15_000),
      });
    } catch {
      throw new ApiError(502, 'CARD_PROVIDER_FAILED', 'Couldn’t reach the card provider. Try again.');
    }
    const data = (await res.json().catch(() => null)) as (T & { message?: string }) | null;
    if (!res.ok) {
      throw new ApiError(502, 'CARD_PROVIDER_FAILED', `The card provider said no${data?.message ? `: ${data.message}` : ''}. Try again.`);
    }
    return data as T;
  }
  return {
    sandbox: env === 'sandbox',
    async createCard(memo) {
      const c = await call<LithicCard>('POST', '/v1/cards', { type: 'VIRTUAL', memo, state: 'OPEN' });
      return { token: c.token, lastFour: c.last_four, expMonth: c.exp_month ?? '', expYear: c.exp_year ?? '', network: networkOf(c.pan) };
    },
    async cardDetails(token) {
      const c = await call<LithicCard>('GET', `/v1/cards/${encodeURIComponent(token)}`);
      if (!c.pan || !c.cvv) throw new ApiError(403, 'CARD_DETAILS_UNAVAILABLE', 'The card provider doesn’t share the full card number here.');
      return { pan: c.pan, cvv: c.cvv, expMonth: c.exp_month ?? '', expYear: c.exp_year ?? '' };
    },
    async setPaused(token, paused) {
      await call('PATCH', `/v1/cards/${encodeURIComponent(token)}`, { state: paused ? 'PAUSED' : 'OPEN' });
    },
    async simulatePurchase({ pan, amountCents, descriptor, mcc }) {
      const r = await call<{ token: string }>('POST', '/v1/simulate/authorize', {
        pan,
        amount: amountCents,
        descriptor,
        ...(mcc ? { mcc } : {}),
        merchant_acceptor_city: 'TASHKENT',
        merchant_acceptor_country: 'UZB',
      });
      return r.token;
    },
  };
}

/**
 * Standard Webhooks signature check, which Lithic uses for ASA (webhook-id, webhook-timestamp,
 * webhook-signature: "v1,<base64 HMAC-SHA256 of id.timestamp.body>"). The secret may carry a "whsec_" prefix.
 */
export function verifyLithicSignature(
  secret: string,
  body: string,
  headers: Record<string, string | string[] | undefined>,
  now: number = Date.now(),
): boolean {
  const h = (name: string) => {
    const v = headers[name];
    return Array.isArray(v) ? v[0] : v;
  };
  const id = h('webhook-id');
  const ts = h('webhook-timestamp');
  const sigs = h('webhook-signature');
  if (!id || !ts || !sigs) return false;
  // Five minutes either way, against replays.
  if (!/^\d+$/.test(ts) || Math.abs(now / 1000 - Number(ts)) > 300) return false;
  const key = Buffer.from(secret.replace(/^whsec_/, ''), 'base64');
  const expected = createHmac('sha256', key).update(`${id}.${ts}.${body}`).digest();
  return sigs.split(' ').some((s) => {
    const [version, sig] = s.split(',');
    if (version !== 'v1' || !sig) return false;
    const got = Buffer.from(sig, 'base64');
    return got.length === expected.length && timingSafeEqual(got, expected);
  });
}
