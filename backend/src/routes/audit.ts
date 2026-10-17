import type { AuditEntry, Page } from '@femate/shared';
import { and, desc, eq, lt, or } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';

import { auditLog } from '../db/schema';
import { decodeCursor, encodeCursor } from '../lib/paginate';
import { toAudit } from '../lib/serialize';
import { parse } from '../lib/validate';

const listQuery = z.object({ limit: z.coerce.number().int().min(1).max(200).default(50), cursor: z.string().optional() });

export async function auditRoutes(app: FastifyInstance) {
  const { db } = app;

  app.get('/audit', async (req): Promise<Page<AuditEntry>> => {
    const q = parse(listQuery, req.query);
    const c = decodeCursor(q.cursor);
    const rows = await db
      .select()
      .from(auditLog)
      .where(
        and(
          eq(auditLog.userId, req.userId),
          c ? or(lt(auditLog.createdAt, c.at), and(eq(auditLog.createdAt, c.at), lt(auditLog.id, c.id))) : undefined,
        ),
      )
      .orderBy(desc(auditLog.createdAt), desc(auditLog.id))
      .limit(q.limit + 1);
    const items = rows.slice(0, q.limit);
    const last = items.at(-1);
    return { items: items.map(toAudit), nextCursor: rows.length > q.limit && last ? encodeCursor(last.createdAt, last.id) : null };
  });

  // Proof of work (PLAN.md §1 material 6): the full log with details, newest first.
  app.get('/audit/export', async (req, reply) => {
    const rows = await db.select().from(auditLog).where(eq(auditLog.userId, req.userId)).orderBy(desc(auditLog.createdAt), desc(auditLog.id));
    reply.header('Content-Disposition', 'attachment; filename="femate-audit-log.json"');
    return rows.map((r) => ({ ...toAudit(r), details: r.details ?? undefined }));
  });
}
