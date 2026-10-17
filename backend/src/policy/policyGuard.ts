// Policy Guard (PLAN.md §8): plain code, not the LLM, decides whether a tool call may run.
// Checks run in this exact order and the first failure wins.
import { CATEGORIES, type Category, type PermissionLevel, type Permissions, type PolicyErrorCode, type Scope } from '@femate/shared';
import { eq } from 'drizzle-orm';
import { z } from 'zod';

import { userCurrency } from '../bank/currency';
import { accountOfType, agentTransferredToday } from '../bank/mockBank';
import type { Db } from '../db/client';
import { permissions } from '../db/schema';
import { maskCards, money as formatMoney } from '../lib/format';
import { toPermissions } from '../lib/serialize';
import { LEVEL_RANK } from './limits';

const category = z.enum(CATEGORIES as [Category, ...Category[]]);
const money = z.number().int().positive();
const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

export const TOOL_RULES = {
  get_balance: { minLevel: 'L0', scope: 'read_balance', args: z.object({}) },
  list_transactions: {
    minLevel: 'L0',
    scope: 'read_transactions',
    args: z.object({ from: isoDate.optional(), to: isoDate.optional(), category: category.optional(), limit: z.number().int().min(1).max(100).optional() }),
  },
  get_daily_summary: { minLevel: 'L0', scope: 'read_transactions', args: z.object({ date: isoDate.optional() }) },
  simulate_saving: {
    minLevel: 'L1',
    args: z.object({
      currentCostPerDay: z.number().int().min(0),
      alternativeCostPerDay: z.number().int().min(0),
      daysPerMonth: z.number().int().min(1).max(31),
    }),
  },
  create_recommendation: {
    minLevel: 'L1',
    args: z.object({ title: z.string().min(1).max(120), body: z.string().min(1).max(600), monthlySaving: z.number().int().min(0) }),
  },
  add_expense: { minLevel: 'L2', args: z.object({ amount: money, category: category.exclude(['transfer']), description: z.string().min(1).max(200) }) },
  set_budget: { minLevel: 'L2', args: z.object({ category, monthlyLimit: money }) },
  transfer_to_savings: {
    minLevel: 'L2',
    scope: 'transfer_own',
    args: z.object({
      amount: money,
      fromAccountId: z.string().optional(),
      toAccountId: z.string().optional(),
      reason: z.string().max(300).optional(),
    }),
  },
} satisfies Record<string, { minLevel: PermissionLevel; scope?: Scope; args: z.ZodType }>;

export type ToolName = keyof typeof TOOL_RULES;
export type ToolArgs<T extends ToolName> = z.infer<(typeof TOOL_RULES)[T]['args']>;
export const TOOL_NAMES = Object.keys(TOOL_RULES) as ToolName[];

/** Tools that change money or limits: pending at L2 (user approves), executed at L3. */
export const ACTION_TOOLS = ['transfer_to_savings', 'set_budget'] as const;
export type ActionTool = (typeof ACTION_TOOLS)[number];

export type Decision<T extends ToolName = ToolName> =
  | {
      allowed: true;
      perms: Permissions;
      args: ToolArgs<T>;
      /** For transfers: the resolved, whitelisted accounts. */
      transfer?: { fromAccountId: string; toAccountId: string };
      mode: 'execute' | 'confirm';
    }
  | { allowed: false; perms: Permissions; code: PolicyErrorCode; message: string };

const NO_PERMS: Permissions = { level: 'L0', scopes: [], perActionLimit: 0, dailyLimit: 0, agentEnabled: false };

export async function loadPermissions(db: Db, userId: string): Promise<Permissions> {
  const [p] = await db.select().from(permissions).where(eq(permissions.userId, userId));
  return p ? toPermissions(p) : NO_PERMS;
}

export async function checkPolicy<T extends ToolName>(db: Db, userId: string, tool: T, rawArgs: unknown): Promise<Decision<T>> {
  const perms = await loadPermissions(db, userId);
  const rule = TOOL_RULES[tool] as { minLevel: PermissionLevel; scope?: Scope; args: z.ZodType };
  const block = (code: PolicyErrorCode, message: string): Decision<T> => ({ allowed: false, perms, code, message });

  // 1. Kill switch
  if (!perms.agentEnabled) return block('KILL_SWITCH_ACTIVE', 'The agent is stopped by the kill switch.');
  // 2. Level
  if (LEVEL_RANK[perms.level] < LEVEL_RANK[rule.minLevel])
    return block('INSUFFICIENT_LEVEL', `${tool} needs level ${rule.minLevel}; you are at ${perms.level}.`);
  // 3. Scope
  if (rule.scope && !perms.scopes.includes(rule.scope)) return block('MISSING_SCOPE', `You haven't granted the ${rule.scope} scope.`);
  // 4. Arguments
  const parsed = rule.args.safeParse(rawArgs ?? {});
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    return block('INVALID_ARGS', `Invalid arguments: ${issue ? `${issue.path.join('.') || 'args'} ${issue.message}` : 'rejected'}.`);
  }
  const args = parsed.data as ToolArgs<T>;
  const mode = (ACTION_TOOLS as readonly string[]).includes(tool) && perms.level !== 'L3' ? 'confirm' : 'execute';

  if (tool !== 'transfer_to_savings') return { allowed: true, perms, args, mode };
  const t = args as ToolArgs<'transfer_to_savings'>;

  // 5. Whitelist: only this user's own card -> this user's own savings
  const [card, savings] = await Promise.all([accountOfType(db, userId, 'card'), accountOfType(db, userId, 'savings')]);
  const fromAccountId = t.fromAccountId ?? card?.id;
  const toAccountId = t.toAccountId ?? savings?.id;
  if (!card || !savings || fromAccountId !== card.id || toAccountId !== savings.id) {
    const target = t.toAccountId && t.toAccountId !== savings?.id ? `${maskCards(t.toAccountId)} is not your savings account. ` : '';
    return block('TARGET_NOT_ALLOWED', `${target}Money can only move from your card to your own savings.`);
  }
  const currency = await userCurrency(db, userId);
  const fmt = (n: number) => formatMoney(n, currency);
  // 6. Per-action limit
  if (t.amount > perms.perActionLimit)
    return block('PER_ACTION_LIMIT', `${fmt(t.amount)} is over your ${fmt(perms.perActionLimit)} per-action limit.`);
  // 7. Daily limit
  const doneToday = await agentTransferredToday(db, userId);
  if (doneToday + t.amount > perms.dailyLimit)
    return block(
      'DAILY_LIMIT',
      `${fmt(doneToday)} already moved today; ${fmt(t.amount)} more would pass your ${fmt(perms.dailyLimit)} daily limit.`,
    );
  // 8. Funds
  if (card.balance < t.amount) return block('INSUFFICIENT_FUNDS', `Your card has ${fmt(card.balance)}, less than ${fmt(t.amount)}.`);

  // 9. L2 -> pending for approval, L3 -> execute now
  return { allowed: true, perms, args, mode, transfer: { fromAccountId, toAccountId } };
}
