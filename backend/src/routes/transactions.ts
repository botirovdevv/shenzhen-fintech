import multipart from '@fastify/multipart';
import { CATEGORIES, CURRENCIES, type Category, type Currency, type Page, type Transaction } from '@femate/shared';
import { and, desc, eq, gte, lt, lte, or } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';

import { addExpense, parsedExpense } from '../bank/expenses';
import { transactions, users } from '../db/schema';
import { ApiError } from '../lib/errors';
import { decodeCursor, encodeCursor } from '../lib/paginate';
import { toTransaction } from '../lib/serialize';
import { parse } from '../lib/validate';
import { MAX_AUDIO_BYTES } from '../stt/groq';

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
  z.object({
    amount: z.number().int().positive(),
    category,
    description: z.string().trim().min(1).max(200),
    currency: z.enum(CURRENCIES as [Currency, ...Currency[]]).optional(),
  }),
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
    let e: { amount: number; currency?: Currency | null; category: Category; description: string };
    if ('text' in b) {
      // Free text ("taxi 20000", "coffee $4.50") is categorized by the LLM adapter; the amount must be found.
      const c = await llm.categorize(b.text);
      if (!c.amount || c.amount <= 0) throw new ApiError(400, 'INVALID_ARGS', 'Add an amount, for example “taxi 20k”.');
      e = await parsedExpense(db, req.userId, { ...c, amount: c.amount });
    } else {
      e = b;
    }
    const t = await addExpense(db, req.userId, { ...e, source: 'manual' });
    reply.status(201);
    return toTransaction(t);
  });

  // Voice input (Stage 6): multipart field "audio" → Groq Whisper → the same categorizer as typed text.
  await app.register(async (voice) => {
    await voice.register(multipart, { limits: { files: 1, fields: 0, fileSize: MAX_AUDIO_BYTES } });
    voice.post('/transactions/voice', async (req, reply): Promise<{ transcript: string; transaction: Transaction }> => {
      if (!app.stt) throw new ApiError(503, 'STT_UNAVAILABLE', 'Voice input is off on the server right now. Type the expense instead.');
      if (!req.isMultipart()) throw new ApiError(400, 'INVALID_ARGS', 'Send the recording as multipart field “audio”.');
      const file = await req.file();
      if (!file || file.fieldname !== 'audio') throw new ApiError(400, 'INVALID_ARGS', 'Send the recording as multipart field “audio”.');
      const data = await file.toBuffer().catch((e: unknown) => {
        if ((e as { code?: string }).code === 'FST_REQ_FILE_TOO_LARGE') {
          throw new ApiError(413, 'AUDIO_TOO_LARGE', 'That recording is too big. Keep it under a minute.');
        }
        throw e;
      });
      if (!data.length) throw new ApiError(400, 'EMPTY_AUDIO', 'The recording was empty. Try again.');
      const [u] = await db.select({ voiceLanguage: users.voiceLanguage }).from(users).where(eq(users.id, req.userId));
      const transcript = await app.stt.transcribe({ data, filename: file.filename || 'voice.m4a', mimeType: file.mimetype, language: u?.voiceLanguage });
      if (!transcript) throw new ApiError(400, 'EMPTY_AUDIO', 'I didn’t hear anything. Try again, like “taxi 20000”.');
      const c = await llm.categorize(transcript);
      if (!c.amount || c.amount <= 0) {
        throw new ApiError(400, 'INVALID_ARGS', `I heard “${transcript.slice(0, 120)}” but no amount. Try again, like “taxi 20000”.`);
      }
      const t = await addExpense(db, req.userId, { ...(await parsedExpense(db, req.userId, { ...c, amount: c.amount })), source: 'voice' });
      reply.status(201);
      return { transcript, transaction: toTransaction(t) };
    });
  });
}
