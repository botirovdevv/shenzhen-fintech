import { CATEGORIES, type Category, type Page, type Transaction } from '@femate/shared';
import { and, desc, eq, gte, lt, lte, or } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';

import { addExpense } from '../bank/expenses';
import { transactions } from '../db/schema';
import { ApiError } from '../lib/errors';
import { decodeCursor, encodeCursor } from '../lib/paginate';
import { toTransaction } from '../lib/serialize';
import { parse } from '../lib/validate';

const category = z.enum(CATEGORIES as [Category, ...Category[]]);
const listQuery = z.object({
  from: z.iso.datetime({ offset: true }).or(z.iso.date()).optional(),
  to: z.iso.datetime({ offset: true }).or(z.iso.date()).optional(),
  category: category.optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
  cursor: z.string().optional(),
});
const createBody = z.union([
  z.object({ text: z.string().trim().min(1, 'Type what you spent, e.g. “taxi 20k”.').max(300) }),
  z.object({ amount: z.number().int().positive(), category, description: z.string().trim().min(1).max(200) }),
]);

export async function transactionRoutes(app: FastifyInstance) {
  const { db, llm } = app;

  app.get('/transactions', async (req): Promise<Page<Transaction>> => {
    const q = parse(listQuery, req.query);
    const c = decodeCursor(q.cursor);
    const rows = await db
      .select()
      .from(transactions)
      .where(
        and(
          eq(transactions.userId, req.userId),
          q.from ? gte(transactions.occurredAt, new Date(q.from)) : undefined,
          q.to ? lte(transactions.occurredAt, new Date(q.to)) : undefined,
          q.category ? eq(transactions.category, q.category) : undefined,
          c ? or(lt(transactions.occurredAt, c.at), and(eq(transactions.occurredAt, c.at), lt(transactions.id, c.id))) : undefined,
        ),
      )
      .orderBy(desc(transactions.occurredAt), desc(transactions.id))
      .limit(q.limit + 1);
    const items = rows.slice(0, q.limit);
    const last = items.at(-1);
    return { items: items.map(toTransaction), nextCursor: rows.length > q.limit && last ? encodeCursor(last.occurredAt, last.id) : null };
  });

  app.post('/transactions', async (req, reply): Promise<Transaction> => {
    const b = parse(createBody, req.body);
    let e: { amount: number; category: Category; description: string };
    if ('text' in b) {
      // Free text ("taxi 20 ming") is categorized by the LLM adapter; the amount must be found.
      const c = await llm.categorize(b.text);
      if (!c.amount || c.amount <= 0) throw new ApiError(400, 'INVALID_ARGS', 'Add an amount, for example “taxi 20k”.');
      e = { amount: c.amount, category: c.category, description: c.description };
    } else {
      e = b;
    }
    const t = await addExpense(db, req.userId, { ...e, source: 'manual' });
    reply.status(201);
    return toTransaction(t);
  });

  // Voice input (Stage 6, pass 2). Until Groq is configured, answer with the code the app understands.
  await app.register(async (voice) => {
    voice.addContentTypeParser('multipart/form-data', (_req, _payload, done) => done(null));
    voice.post('/transactions/voice', async () => {
      throw new ApiError(503, 'STT_UNAVAILABLE', 'Voice input is off on the server right now. Type the expense instead.');
    });
  });
}
