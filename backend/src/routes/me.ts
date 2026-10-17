import { CURRENCIES, VOICE_LANGUAGES, type Currency, type User, type VoiceLanguage } from '@femate/shared';
import { eq } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';

import { changeCurrency } from '../bank/currency';
import { users } from '../db/schema';
import { notFound } from '../lib/errors';
import { toUser } from '../lib/serialize';
import { parse } from '../lib/validate';

// Postgres integer: a bit over 2 billion minor units.
const amount = z.number().int().min(0).max(2_000_000_000);
const patchBody = z
  .object({
    monthlyIncome: amount,
    savingsGoalMonthly: amount,
    fixedCostsMonthly: amount,
    reportTime: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Use HH:MM, e.g. 21:00.'),
    expoPushToken: z.string().max(300),
    currency: z.enum(CURRENCIES as [Currency, ...Currency[]]),
    voiceLanguage: z.enum(VOICE_LANGUAGES as [VoiceLanguage, ...VoiceLanguage[]]),
  })
  .partial();

export async function meRoutes(app: FastifyInstance) {
  const { db } = app;

  app.get('/me', async (req): Promise<User> => {
    const [u] = await db.select().from(users).where(eq(users.id, req.userId));
    if (!u) throw notFound('User');
    return toUser(u);
  });

  app.patch('/me', async (req): Promise<User> => {
    const { currency, ...b } = parse(patchBody, req.body);
    // Converts the stored money first, so amounts sent in the same request are already in the new currency.
    if (currency) await changeCurrency(db, req.userId, currency);
    const [u] = Object.keys(b).length
      ? await db.update(users).set(b).where(eq(users.id, req.userId)).returning()
      : await db.select().from(users).where(eq(users.id, req.userId));
    if (!u) throw notFound('User');
    return toUser(u);
  });
}
