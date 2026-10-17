// DB rows -> API contract types (@femate/shared).
import type { Account, AgentAction, AuditEntry, CardAuthorization, PaymentCard, Permissions, Recommendation, Transaction, User } from '@femate/shared';

import type * as s from '../db/schema';

type Row<T extends { $inferSelect: unknown }> = T['$inferSelect'];

export const toUser = (u: Row<typeof s.users>): User => ({
  id: u.id,
  email: u.email,
  name: u.name,
  monthlyIncome: u.monthlyIncome,
  savingsGoalMonthly: u.savingsGoalMonthly,
  fixedCostsMonthly: u.fixedCostsMonthly,
  reportTime: u.reportTime,
  telegramLinked: u.telegramChatId !== null,
  currency: u.currency,
  voiceLanguage: u.voiceLanguage,
});

export const toAccount = (a: Row<typeof s.accounts>): Account => ({
  id: a.id,
  type: a.type,
  name: a.name,
  balance: a.balance,
  currency: a.currency,
});

export const toTransaction = (t: Row<typeof s.transactions>): Transaction => ({
  id: t.id,
  accountId: t.accountId,
  amount: t.amount,
  direction: t.direction,
  category: t.category,
  description: t.description,
  source: t.source,
  occurredAt: t.occurredAt.toISOString(),
  ...(t.originalAmount !== null && t.originalCurrency ? { original: { amount: t.originalAmount, currency: t.originalCurrency } } : {}),
});

export const toAction = (a: Row<typeof s.agentActions>): AgentAction => ({
  id: a.id,
  type: a.type,
  ...(a.amount !== null ? { amount: a.amount } : {}),
  reason: a.reason,
  status: a.status,
  ...(a.expiresAt ? { expiresAt: a.expiresAt.toISOString() } : {}),
  createdAt: a.createdAt.toISOString(),
});

export const toRecommendation = (r: Row<typeof s.recommendations>): Recommendation => ({
  id: r.id,
  title: r.title,
  body: r.body,
  monthlySaving: r.monthlySaving,
  ...(r.actionType ? { actionType: r.actionType } : {}),
  status: r.status,
});

export const toPermissions = (p: Row<typeof s.permissions>): Permissions => ({
  level: p.level,
  scopes: p.scopes,
  perActionLimit: p.perActionLimit,
  dailyLimit: p.dailyLimit,
  agentEnabled: p.agentEnabled,
});

export const toAudit = (e: Row<typeof s.auditLog>): AuditEntry => ({
  id: e.id,
  actor: e.actor,
  event: e.event,
  permissionLevel: e.permissionLevel,
  decision: e.decision,
  reason: e.reason,
  createdAt: e.createdAt.toISOString(),
});

export const toPaymentCard = (c: Row<typeof s.cards>): PaymentCard => ({
  id: c.id,
  network: c.network,
  lastFour: c.lastFour,
  expMonth: c.expMonth,
  expYear: c.expYear,
  frozen: c.frozen,
  blockOverBudget: c.blockOverBudget,
  accountId: c.accountId,
  createdAt: c.createdAt.toISOString(),
});

export const toCardAuthorization = (a: Row<typeof s.cardAuthorizations>): CardAuthorization => ({
  id: a.id,
  amount: a.amount,
  ...(a.originalAmount !== null && a.originalCurrency ? { original: { amount: a.originalAmount, currency: a.originalCurrency } } : {}),
  merchant: a.merchant,
  category: a.category,
  approved: a.result === 'APPROVED',
  result: a.result,
  reason: a.reason,
  ...(a.transactionId ? { transactionId: a.transactionId } : {}),
  createdAt: a.createdAt.toISOString(),
});
