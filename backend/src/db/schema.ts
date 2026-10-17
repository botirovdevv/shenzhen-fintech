// Database schema (PLAN.md §7). Money is an integer in the user's currency's minor unit, ids are prefixed nanoids.
import type { AgentActionStatus, AuditEntry, Category, Currency, PermissionLevel, Scope, TransactionSource, VoiceLanguage } from '@femate/shared';
import { boolean, index, integer, jsonb, pgTable, text, timestamp, uniqueIndex } from 'drizzle-orm/pg-core';

const createdAt = () => timestamp('created_at', { withTimezone: true }).notNull().defaultNow();
const userRef = () =>
  text('user_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' });

export const users = pgTable('users', {
  id: text('id').primaryKey(),
  email: text('email').notNull().unique(),
  passwordHash: text('password_hash').notNull(),
  name: text('name').notNull(),
  monthlyIncome: integer('monthly_income').notNull().default(0),
  savingsGoalMonthly: integer('savings_goal_monthly').notNull().default(0),
  fixedCostsMonthly: integer('fixed_costs_monthly').notNull().default(0),
  reportTime: text('report_time').notNull().default('21:00'),
  currency: text('currency').$type<Currency>().notNull().default('UZS'),
  voiceLanguage: text('voice_language').$type<VoiceLanguage>().notNull().default('auto'),
  telegramChatId: text('telegram_chat_id'),
  expoPushToken: text('expo_push_token'),
  createdAt: createdAt(),
});

export const accounts = pgTable(
  'accounts',
  {
    id: text('id').primaryKey(),
    userId: userRef(),
    type: text('type').$type<'card' | 'savings' | 'cash'>().notNull(),
    name: text('name').notNull(),
    balance: integer('balance').notNull(),
    currency: text('currency').$type<Currency>().notNull().default('UZS'),
    createdAt: createdAt(),
  },
  (t) => [index('accounts_user_idx').on(t.userId)],
);

export const transactions = pgTable(
  'transactions',
  {
    id: text('id').primaryKey(),
    userId: userRef(),
    accountId: text('account_id')
      .notNull()
      .references(() => accounts.id, { onDelete: 'cascade' }),
    amount: integer('amount').notNull(),
    direction: text('direction').$type<'out' | 'in'>().notNull(),
    category: text('category').$type<Category>().notNull(),
    description: text('description').notNull(),
    source: text('source').$type<TransactionSource>().notNull(),
    // What the user entered when it wasn't their currency ("coffee $5" on a UZS account).
    originalAmount: integer('original_amount'),
    originalCurrency: text('original_currency').$type<Currency>(),
    occurredAt: timestamp('occurred_at', { withTimezone: true }).notNull(),
    createdAt: createdAt(),
  },
  (t) => [index('transactions_user_time_idx').on(t.userId, t.occurredAt)],
);

export const budgets = pgTable(
  'budgets',
  {
    id: text('id').primaryKey(),
    userId: userRef(),
    category: text('category').$type<Category>().notNull(),
    monthlyLimit: integer('monthly_limit').notNull(),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex('budgets_user_category_idx').on(t.userId, t.category)],
);

export const permissions = pgTable('permissions', {
  userId: text('user_id')
    .primaryKey()
    .references(() => users.id, { onDelete: 'cascade' }),
  level: text('level').$type<PermissionLevel>().notNull().default('L0'),
  scopes: jsonb('scopes').$type<Scope[]>().notNull().default([]),
  perActionLimit: integer('per_action_limit').notNull().default(0),
  dailyLimit: integer('daily_limit').notNull().default(0),
  agentEnabled: boolean('agent_enabled').notNull().default(true),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export const agentActions = pgTable(
  'agent_actions',
  {
    id: text('id').primaryKey(),
    userId: userRef(),
    type: text('type').$type<'transfer_to_savings' | 'set_budget'>().notNull(),
    payload: jsonb('payload').$type<Record<string, unknown>>().notNull(),
    amount: integer('amount'),
    reason: text('reason').notNull(),
    status: text('status').$type<AgentActionStatus>().notNull(),
    expiresAt: timestamp('expires_at', { withTimezone: true }),
    createdAt: createdAt(),
    decidedAt: timestamp('decided_at', { withTimezone: true }),
  },
  (t) => [index('agent_actions_user_idx').on(t.userId, t.createdAt)],
);

export const recommendations = pgTable('recommendations', {
  id: text('id').primaryKey(),
  userId: userRef(),
  title: text('title').notNull(),
  body: text('body').notNull(),
  monthlySaving: integer('monthly_saving').notNull(),
  actionType: text('action_type').$type<'transfer_to_savings' | 'set_budget'>(),
  actionPayload: jsonb('action_payload').$type<Record<string, unknown>>(),
  status: text('status').$type<'new' | 'applied' | 'dismissed'>().notNull().default('new'),
  createdAt: createdAt(),
});

export const auditLog = pgTable(
  'audit_log',
  {
    id: text('id').primaryKey(),
    userId: userRef(),
    actor: text('actor').$type<AuditEntry['actor']>().notNull(),
    event: text('event').notNull(),
    permissionLevel: text('permission_level').$type<PermissionLevel>().notNull(),
    decision: text('decision').$type<AuditEntry['decision']>().notNull(),
    reason: text('reason').notNull(),
    details: jsonb('details').$type<Record<string, unknown>>(),
    createdAt: createdAt(),
  },
  (t) => [index('audit_user_time_idx').on(t.userId, t.createdAt)],
);

// Chat history for the agent; only the last 10 messages are sent to the LLM (PLAN.md §10).
export const chatMessages = pgTable(
  'chat_messages',
  {
    id: text('id').primaryKey(),
    userId: userRef(),
    role: text('role').$type<'user' | 'assistant'>().notNull(),
    content: text('content').notNull(),
    createdAt: createdAt(),
  },
  (t) => [index('chat_user_time_idx').on(t.userId, t.createdAt)],
);

export const telegramLinkCodes = pgTable('telegram_link_codes', {
  code: text('code').primaryKey(),
  userId: userRef(),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
});
