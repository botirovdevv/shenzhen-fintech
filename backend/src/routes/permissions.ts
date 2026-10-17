import type { Permissions } from '@femate/shared';
import { and, eq, sql } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';

import { audit } from '../audit/audit';
import { agentActions, permissions } from '../db/schema';
import { userCurrency } from '../bank/currency';
import { money } from '../lib/format';
import { toPermissions } from '../lib/serialize';
import { parse } from '../lib/validate';
import { clampLimits } from '../policy/limits';
import { loadPermissions } from '../policy/policyGuard';
import { levelSchema, scopeSchema } from './bank';

const putBody = z.object({
  level: levelSchema.optional(),
  scopes: z.array(scopeSchema).max(3).optional(),
  perActionLimit: z.number().int().min(0).optional(),
  dailyLimit: z.number().int().min(0).optional(),
});

export async function permissionRoutes(app: FastifyInstance) {
  const { db } = app;

  app.get('/permissions', async (req): Promise<Permissions> => loadPermissions(db, req.userId));

  // Also how the agent is switched back on after the kill switch.
  app.put('/permissions', async (req): Promise<Permissions> => {
    const b = parse(putBody, req.body);
    const cur = await loadPermissions(db, req.userId);
    const level = b.level ?? cur.level;
    // Limits carry over only within the same level; a new level starts from its system maximum.
    const currency = await userCurrency(db, req.userId);
    const limits = clampLimits(level, currency, b, level === cur.level ? cur : undefined);
    const scopes = b.scopes ? [...new Set(b.scopes)] : cur.scopes;
    const [row] = await db
      .insert(permissions)
      .values({ userId: req.userId, level, scopes, ...limits, agentEnabled: true })
      .onConflictDoUpdate({ target: permissions.userId, set: { level, scopes, ...limits, agentEnabled: true, updatedAt: sql`now()` } })
      .returning();
    const p = toPermissions(row!);
    const capped = (b.perActionLimit !== undefined && b.perActionLimit > p.perActionLimit) || (b.dailyLimit !== undefined && b.dailyLimit > p.dailyLimit);
    await audit(db, req.userId, {
      actor: 'user',
      event: 'permissions.update',
      decision: 'info',
      reason: `${cur.agentEnabled ? 'Permissions updated' : 'Agent re-enabled'}: ${level}, ${money(p.perActionLimit, currency)} per action, ${money(p.dailyLimit, currency)} a day${capped ? ' (capped at the system maximum)' : ''}.`,
      details: { before: cur, after: p },
      level,
    });
    return p;
  });

  // Kill switch: stop the agent, reject everything pending. Re-enabling starts again from L1 (PLAN.md §8).
  app.post('/permissions/kill-switch', async (req): Promise<Permissions> => {
    const { row, rejected } = await db.transaction(async (tx) => {
      const [r] = await tx
        .update(permissions)
        .set({ agentEnabled: false, level: 'L1', perActionLimit: 0, dailyLimit: 0, updatedAt: sql`now()` })
        .where(eq(permissions.userId, req.userId))
        .returning();
      const rej = await tx
        .update(agentActions)
        .set({ status: 'rejected', decidedAt: new Date() })
        .where(and(eq(agentActions.userId, req.userId), eq(agentActions.status, 'pending')))
        .returning({ id: agentActions.id });
      return { row: r, rejected: rej.length };
    });
    await audit(db, req.userId, {
      actor: 'user',
      event: 'permissions.kill_switch',
      decision: 'info',
      reason: `Agent disabled. ${rejected} pending action${rejected === 1 ? '' : 's'} rejected.`,
      level: 'L1',
    });
    return row ? toPermissions(row) : loadPermissions(db, req.userId);
  });
}
