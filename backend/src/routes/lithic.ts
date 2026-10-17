import type { FastifyInstance } from 'fastify';
import { z } from 'zod';

import { decideAuthorization } from '../card/cards';
import { verifyLithicSignature } from '../card/lithic';

const asaSchema = z.object({
  token: z.string().min(1),
  status: z.string(),
  card: z.object({ token: z.string().min(1) }),
  amounts: z.object({ cardholder: z.object({ amount: z.number().int(), currency: z.string() }).optional() }).optional(),
  authorization_amount: z.number().int().optional(),
  cardholder_currency: z.string().optional(),
  merchant: z.object({ descriptor: z.string().default(''), mcc: z.string().optional() }),
});

// Lithic Auth Stream Access: Lithic asks this endpoint about every purchase on a FeMate card and
// declines it if we don't answer within 6 seconds. Public (no JWT); authenticated by the HMAC signature.
export async function lithicRoutes(app: FastifyInstance) {
  const { db, config } = app;
  // The signature covers the exact bytes, so this route keeps the body as a string.
  app.removeContentTypeParser('application/json');
  app.addContentTypeParser('application/json', { parseAs: 'string' }, (_req, body, done) => done(null, body));

  app.post('/lithic/asa', { config: { rateLimit: false } }, async (req, reply) => {
    const raw = typeof req.body === 'string' ? req.body : '';
    const secret = config.LITHIC_ASA_SECRET;
    if (secret ? !verifyLithicSignature(secret, raw, req.headers) : config.LITHIC_ENV === 'production') {
      req.log.warn('Lithic ASA request with a missing or bad signature');
      return reply.status(401).send({ error: { code: 'BAD_SIGNATURE', message: 'Signature check failed.' } });
    }
    let body: unknown;
    try {
      body = JSON.parse(raw);
    } catch {
      body = null;
    }
    const parsed = asaSchema.safeParse(body);
    // Never leave Lithic waiting: anything we can't read is declined.
    if (!parsed.success) return { result: 'UNAUTHORIZED_MERCHANT' };
    const { result } = await decideAuthorization(db, parsed.data);
    return { result };
  });
}
