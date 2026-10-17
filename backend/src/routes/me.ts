import type { User } from '@femate/shared';
import { eq } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';

import { users } from '../db/schema';
import { notFound } from '../lib/errors';
import { toUser } from '../lib/serialize';
import { parse } from '../lib/validate';

const amount = z.number().int().min(0).max(10_000_000_000);
const patchBody = z
  .object({
    monthlyIncome: amount,
    savingsGoalMonthly: amount,
    fixedCostsMonthly: amount,
    reportTime: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Use HH:MM, e.g. 21:00.'),
    expoPushToken: z.string().max(300),
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
    const b = parse(patchBody, req.body);
    const [u] = await db.update(users).set(b).where(eq(users.id, req.userId)).returning();
    if (!u) throw notFound('User');
    return toUser(u);
  });
}
