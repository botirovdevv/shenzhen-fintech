import type { FastifyInstance } from 'fastify';
import { randomInt } from 'node:crypto';
import { eq } from 'drizzle-orm';

import { telegramLinkCodes } from '../db/schema';

// The bot (pass 2) redeems the code with /start <code>.
export async function telegramRoutes(app: FastifyInstance) {
  const { db } = app;

  app.post('/telegram/link-code', async (req): Promise<{ code: string; expiresAt: string }> => {
    await db.delete(telegramLinkCodes).where(eq(telegramLinkCodes.userId, req.userId));
    const expiresAt = new Date(Date.now() + 10 * 60_000);
    for (;;) {
      const code = String(randomInt(100_000, 1_000_000));
      const inserted = await db.insert(telegramLinkCodes).values({ code, userId: req.userId, expiresAt }).onConflictDoNothing().returning();
      if (inserted.length) return { code, expiresAt: expiresAt.toISOString() };
    }
  });
}
