import type { Account, PermissionLevel, Scope } from '@femate/shared';
import { sql } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';

import { audit } from '../audit/audit';
import { userCurrency } from '../bank/currency';
import { openSandboxAccounts, userAccounts } from '../bank/mockBank';
import { permissions } from '../db/schema';
import { toAccount } from '../lib/serialize';
import { parse } from '../lib/validate';
import { clampLimits } from '../policy/limits';

export const scopeSchema = z.enum(['read_balance', 'read_transactions', 'transfer_own'] satisfies Scope[]);
export const levelSchema = z.enum(['L0', 'L1', 'L2', 'L3'] satisfies PermissionLevel[]);
const connectBody = z.object({ scopes: z.array(scopeSchema).max(3), level: levelSchema });

export async function bankRoutes(app: FastifyInstance) {
  const { db } = app;

  // Consent screen result: opens the sandbox accounts once and sets what the agent may do.
  app.post('/bank/connect', async (req): Promise<{ accounts: Account[] }> => {
    const b = parse(connectBody, req.body);
    const scopes = [...new Set(b.scopes)];
    let accs = await userAccounts(db, req.userId);
    const fresh = accs.length === 0;
    if (fresh) accs = await openSandboxAccounts(db, req.userId);
    const limits = clampLimits(b.level, await userCurrency(db, req.userId), {});
    await db
      .insert(permissions)
      .values({ userId: req.userId, level: b.level, scopes, ...limits, agentEnabled: true })
      .onConflictDoUpdate({
        target: permissions.userId,
        set: { level: b.level, scopes, ...limits, agentEnabled: true, updatedAt: sql`now()` },
      });
    await audit(db, req.userId, {
      actor: 'user',
      event: 'bank.connect',
      decision: 'info',
      reason: `Sandbox Bank ${fresh ? 'connected' : 'consent updated'} at ${b.level} with ${scopes.length ? scopes.join(', ') : 'no scopes'}.`,
      details: { scopes, level: b.level, ...limits },
      level: b.level,
    });
    return { accounts: accs.map(toAccount) };
  });

  app.get('/accounts', async (req): Promise<Account[]> => (await userAccounts(db, req.userId)).map(toAccount));
}

