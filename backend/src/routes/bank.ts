import type { Account, MoneyResponse, PermissionLevel, Scope } from '@femate/shared';
import { sql } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';

import { audit } from '../audit/audit';
import { userCurrency } from '../bank/currency';
import { openSandboxAccounts, userAccounts } from '../bank/mockBank';
import { deposit, moveMoney, setBalance } from '../bank/money';
import { permissions } from '../db/schema';
import { toAccount, toTransaction } from '../lib/serialize';
import { amountSchema, MAX_AMOUNT, parse } from '../lib/validate';
import { clampLimits } from '../policy/limits';

export const scopeSchema = z.enum(['read_balance', 'read_transactions', 'transfer_own'] satisfies Scope[]);
export const levelSchema = z.enum(['L0', 'L1', 'L2', 'L3'] satisfies PermissionLevel[]);
const connectBody = z.object({ scopes: z.array(scopeSchema).max(3), level: levelSchema });
const accountType = z.enum(['card', 'savings', 'cash']);
// Capped so a typo can't make a balance absurd (or overflow the int4 columns).
const amount = amountSchema;
const depositBody = z.object({ to: accountType, amount, description: z.string().trim().max(100).optional() });
const transferBody = z.object({ from: accountType, to: accountType, amount });
const balanceBody = z.object({ account: accountType, balance: z.number().int().min(0).max(MAX_AMOUNT, 'That amount is too large.') });

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

  // The user's own money moves (the agent can't call these). Each answers with the new balances.
  const done = async (userId: string, t: Parameters<typeof toTransaction>[0] | null): Promise<MoneyResponse> => ({
    accounts: (await userAccounts(db, userId)).map(toAccount),
    transaction: t ? toTransaction(t) : null,
  });

  app.post('/accounts/deposit', async (req) => {
    const b = parse(depositBody, req.body);
    return done(req.userId, await deposit(db, req.userId, b.to, b.amount, b.description));
  });

  app.post('/accounts/transfer', async (req) => {
    const b = parse(transferBody, req.body);
    return done(req.userId, await moveMoney(db, req.userId, b.from, b.to, b.amount));
  });

  app.put('/accounts/balance', async (req) => {
    const b = parse(balanceBody, req.body);
    return done(req.userId, await setBalance(db, req.userId, b.account, b.balance));
  });
}

