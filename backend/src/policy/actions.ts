// Agent actions (PLAN.md §8 rule 9): Policy Guard result -> blocked / pending / executed row,
// plus the user's approve / reject. Approval re-runs checks 1–8 before any money moves.
import type { AgentAction, Currency } from '@femate/shared';
import { and, eq, lt, sql } from 'drizzle-orm';

import { audit } from '../audit/audit';
import { userCurrency } from '../bank/currency';
import { transferToSavings } from '../bank/mockBank';
import type { Db } from '../db/client';
import { agentActions, budgets } from '../db/schema';
import { ApiError, notFound } from '../lib/errors';
import { money } from '../lib/format';
import { newId } from '../lib/ids';
import { toAction } from '../lib/serialize';
import { PENDING_TTL_MS } from './limits';
import { checkPolicy, type ActionTool, type ToolArgs } from './policyGuard';

type ActionRow = typeof agentActions.$inferSelect;

function describe(tool: ActionTool, payload: Record<string, unknown>, currency: Currency): string {
  return tool === 'transfer_to_savings'
    ? `${money(Number(payload.amount), currency)} Card → Savings`
    : `${String(payload.category)} budget ${money(Number(payload.monthlyLimit), currency)}/month`;
}

async function execute(db: Db, userId: string, a: ActionRow) {
  if (a.type === 'transfer_to_savings') {
    const p = a.payload as { amount: number; fromAccountId: string; toAccountId: string };
    await transferToSavings(db, userId, p.fromAccountId, p.toAccountId, p.amount);
  } else {
    const p = a.payload as ToolArgs<'set_budget'>;
    await db
      .insert(budgets)
      .values({ id: newId('bud'), userId, category: p.category, monthlyLimit: p.monthlyLimit })
      .onConflictDoUpdate({ target: [budgets.userId, budgets.category], set: { monthlyLimit: p.monthlyLimit } });
  }
}

/**
 * Runs a money/limit tool through Policy Guard and records the outcome.
 * `actor` is who asked: the agent (chat) or the user (applying a recommendation).
 */
export async function proposeAction(
  db: Db,
  userId: string,
  tool: ActionTool,
  rawArgs: unknown,
  opts: { actor: 'agent' | 'user'; reason: string },
): Promise<{ action: AgentAction; code?: string; message: string }> {
  const d = await checkPolicy(db, userId, tool, rawArgs);
  const event = opts.actor === 'agent' ? `tool.${tool}` : `${tool}.request`;
  const now = Date.now();
  const amount = tool === 'transfer_to_savings' ? Number((rawArgs as { amount?: unknown })?.amount) : NaN;
  const base = {
    id: newId('act'),
    userId,
    type: tool,
    amount: Number.isInteger(amount) ? amount : null,
    createdAt: new Date(now),
  };

  if (!d.allowed) {
    const reason = `${d.code}: ${d.message}`;
    await audit(db, userId, { actor: opts.actor, event, decision: 'blocked', reason, details: { args: rawArgs }, level: d.perms.level });
    const [row] = await db
      .insert(agentActions)
      .values({ ...base, payload: (rawArgs ?? {}) as Record<string, unknown>, reason, status: 'blocked', decidedAt: new Date(now) })
      .returning();
    return { action: toAction(row!), code: d.code, message: d.message };
  }

  const payload: Record<string, unknown> = { ...d.args, ...d.transfer };
  const what = describe(tool, payload, await userCurrency(db, userId));
  if (d.mode === 'confirm') {
    const [row] = await db
      .insert(agentActions)
      .values({ ...base, payload, reason: opts.reason, status: 'pending', expiresAt: new Date(now + PENDING_TTL_MS) })
      .returning();
    await audit(db, userId, {
      actor: opts.actor,
      event,
      decision: 'allowed',
      reason: `${what}. Waiting for your approval.`,
      details: { actionId: row!.id, args: payload },
      level: d.perms.level,
    });
    return { action: toAction(row!), message: `${what} is waiting for your approval.` };
  }

  // L3 Autopilot: execute within limits, then tell the user.
  const row = await db.transaction(async (tx) => {
    const [r] = await tx
      .insert(agentActions)
      .values({ ...base, payload, reason: opts.reason, status: 'executed', decidedAt: new Date(now) })
      .returning();
    await execute(tx, userId, r!);
    return r!;
  });
  await audit(db, userId, {
    actor: opts.actor,
    event,
    decision: 'allowed',
    reason: `${what}. Done automatically (Autopilot).`,
    details: { actionId: row.id, args: payload },
    level: d.perms.level,
  });
  return { action: toAction(row), message: `${what}. Done.` };
}

/** Pending actions past their 15 minutes become expired (checked lazily on every read). */
export async function expirePending(db: Db, userId: string) {
  const expired = await db
    .update(agentActions)
    .set({ status: 'expired', decidedAt: new Date() })
    .where(and(eq(agentActions.userId, userId), eq(agentActions.status, 'pending'), lt(agentActions.expiresAt, sql`now()`)))
    .returning();
  const currency = expired.length ? await userCurrency(db, userId) : 'UZS';
  for (const a of expired) {
    await audit(db, userId, {
      actor: 'system',
      event: 'action.expire',
      decision: 'info',
      reason: `${describe(a.type, a.payload, currency)} expired after 15 minutes without approval.`,
      details: { actionId: a.id },
    });
  }
}

async function getOwned(db: Db, userId: string, id: string) {
  const [a] = await db
    .select()
    .from(agentActions)
    .where(and(eq(agentActions.id, id), eq(agentActions.userId, userId)));
  if (!a) throw notFound('Action');
  return a;
}

export async function approveAction(db: Db, userId: string, id: string): Promise<AgentAction> {
  await expirePending(db, userId);
  const a = await getOwned(db, userId, id);
  if (a.status !== 'pending') throw new ApiError(409, 'NOT_PENDING', `This action is already ${a.status}.`);

  // Checks 1–8 again: the kill switch, limits or balance may have changed since it was proposed.
  const d = await checkPolicy(db, userId, a.type, a.payload);
  if (!d.allowed) {
    const reason = `${d.code}: ${d.message}`;
    await db.update(agentActions).set({ status: 'blocked', reason, decidedAt: new Date() }).where(eq(agentActions.id, a.id));
    await audit(db, userId, { actor: 'user', event: 'action.approve', decision: 'blocked', reason, details: { actionId: a.id } });
    throw new ApiError(403, d.code, d.message);
  }
  const row = await db.transaction(async (tx) => {
    // Claim the row first so a double tap can't execute twice.
    const [claimed] = await tx
      .update(agentActions)
      .set({ status: 'executed', decidedAt: new Date() })
      .where(and(eq(agentActions.id, a.id), eq(agentActions.status, 'pending')))
      .returning();
    if (!claimed) throw new ApiError(409, 'NOT_PENDING', 'This action was already decided.');
    await execute(tx, userId, claimed);
    return claimed;
  });
  await audit(db, userId, {
    actor: 'user',
    event: 'action.approve',
    decision: 'allowed',
    reason: `Approved: ${describe(row.type, row.payload, await userCurrency(db, userId))}.`,
    details: { actionId: row.id },
  });
  return toAction(row);
}

export async function rejectAction(db: Db, userId: string, id: string): Promise<AgentAction> {
  await expirePending(db, userId);
  const a = await getOwned(db, userId, id);
  if (a.status !== 'pending') throw new ApiError(409, 'NOT_PENDING', `This action is already ${a.status}.`);
  const [row] = await db
    .update(agentActions)
    .set({ status: 'rejected', decidedAt: new Date() })
    .where(eq(agentActions.id, a.id))
    .returning();
  await audit(db, userId, {
    actor: 'user',
    event: 'action.reject',
    decision: 'info',
    reason: `Rejected: ${describe(a.type, a.payload, await userCurrency(db, userId))}. Nothing was changed.`,
    details: { actionId: a.id },
  });
  return toAction(row!);
}
