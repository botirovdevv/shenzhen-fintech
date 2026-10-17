// Telegram bot logic without Telegram (PLAN.md Stage 7), so tests can drive it on PGlite.
// The bot reads and adds expenses. Money moves only through an inline Approve button on an
// agent action that Policy Guard already let through (PLAN.md §8), never from a typed command.
import { formatMoney, toMinor, type AgentAction, type Currency } from '@femate/shared';
import { and, eq, gt } from 'drizzle-orm';

import type { LlmProvider } from '../agent/llm/provider';
import { audit } from '../audit/audit';
import { userCurrency } from '../bank/currency';
import { addExpense, parsedExpense, spentText } from '../bank/expenses';
import type { Db } from '../db/client';
import { agentActions, permissions, telegramLinkCodes, users } from '../db/schema';
import { ApiError } from '../lib/errors';
import { toAction } from '../lib/serialize';
import { approveAction, expirePending, proposeAction, rejectAction } from '../policy/actions';
import { dailySummary } from '../rules/dailyAllowance';
import { parseSms } from '../rules/smsParser';

export const HELP = [
  'Send me what you spent and I’ll add it to FeMate:',
  '• taxi 20000  •  osh 35 ming  •  kofe 18k  •  coffee $4.50',
  '• Send a voice note: “taksi yigirma ming” or “lunch twelve dollars”.',
  '• Forward a bank SMS (Uzcard / Humo) and I’ll read it.',
  '',
  '/today: today’s report',
  '/unlink: disconnect this chat',
  '',
  'I can read and add expenses. I can never move money on my own: transfers need your tap on Approve.',
].join('\n');

export async function userByChat(db: Db, chatId: string) {
  const [u] = await db.select().from(users).where(eq(users.telegramChatId, chatId));
  return u ?? null;
}

/** /start <code>: tie this chat to the account that asked for the code in the app. */
export async function linkChat(db: Db, chatId: string, code: string): Promise<string> {
  const [row] = await db
    .select()
    .from(telegramLinkCodes)
    .where(and(eq(telegramLinkCodes.code, code), gt(telegramLinkCodes.expiresAt, new Date())));
  if (!row) return 'That code is wrong or has expired. In the app open Settings → Telegram bot → Get a link code, then send /start <code>.';
  await db.transaction(async (tx) => {
    // One chat, one account: a chat linked before moves to the new account.
    await tx.update(users).set({ telegramChatId: null }).where(eq(users.telegramChatId, chatId));
    await tx.update(users).set({ telegramChatId: chatId }).where(eq(users.id, row.userId));
    await tx.delete(telegramLinkCodes).where(eq(telegramLinkCodes.userId, row.userId));
  });
  await audit(db, row.userId, {
    actor: 'user',
    event: 'telegram.link',
    decision: 'info',
    reason: 'Telegram chat linked. The bot can read and add expenses; it cannot move money.',
  });
  const [u] = await db.select({ name: users.name }).from(users).where(eq(users.id, row.userId));
  return `Linked! Hi ${u?.name ?? 'there'} 👋\n\n${HELP}`;
}

export async function unlinkChat(db: Db, userId: string): Promise<string> {
  await db.update(users).set({ telegramChatId: null }).where(eq(users.id, userId));
  await audit(db, userId, { actor: 'user', event: 'telegram.unlink', decision: 'info', reason: 'Telegram chat unlinked.' });
  return 'Done. This chat is no longer linked to FeMate. Get a new code in the app to link again.';
}

/** A typed expense ("taxi 20000") or a forwarded bank SMS. Text from Telegram is untrusted: it is only parsed, never obeyed. */
export async function handleText(db: Db, llm: LlmProvider, userId: string, text: string): Promise<string> {
  const own = await userCurrency(db, userId);
  const sms = parseSms(text);
  if (sms) {
    const amount = toMinor(sms.amount, sms.currency);
    if (sms.direction === 'in') return `That’s money coming in (+${formatMoney(amount, sms.currency)}), so I didn’t add it as spending.`;
    const { category } = await llm.categorize(sms.merchant || text);
    const description = sms.merchant ? titleCase(sms.merchant) : 'Card payment';
    const t = await addExpense(
      db,
      userId,
      { amount, currency: sms.currency, category, description, source: 'sms_forward', occurredAt: sms.occurredAt ?? undefined },
      'card',
    );
    return `✅ From the SMS: ${description}, ${spentText(t, own)} (${category}).\n${await leftToday(db, userId, own)}`;
  }
  const c = await llm.categorize(text);
  if (!c.amount || c.amount <= 0) return 'I couldn’t find an amount. Try “taxi 20000” or “osh 35 ming”.';
  const t = await addExpense(db, userId, { ...(await parsedExpense(db, userId, { ...c, amount: c.amount })), source: 'manual' });
  return `✅ Added: ${c.description}, ${spentText(t, own)} (${c.category}).\n${await leftToday(db, userId, own)}`;
}

/** A voice note, already turned into text. Same rules as a typed expense, saved with source voice. */
export async function handleVoice(db: Db, llm: LlmProvider, userId: string, transcript: string): Promise<string> {
  if (!transcript) return 'I didn’t hear anything. Try again, like “taxi 20 ming”.';
  const heard = `🎤 “${transcript.slice(0, 200)}”`;
  const c = await llm.categorize(transcript);
  if (!c.amount || c.amount <= 0) return `${heard}\nI couldn’t find an amount. Try “taxi 20 ming” or type it.`;
  const own = await userCurrency(db, userId);
  const t = await addExpense(db, userId, { ...(await parsedExpense(db, userId, { ...c, amount: c.amount })), source: 'voice' });
  return `${heard}\n✅ Added: ${c.description}, ${spentText(t, own)} (${c.category}).\n${await leftToday(db, userId, own)}`;
}

async function leftToday(db: Db, userId: string, cur: Currency) {
  const s = await dailySummary(db, userId);
  const fmt = (n: number) => formatMoney(n, cur);
  return s.remainingToday >= 0
    ? `Left for today: ${fmt(s.remainingToday)} of ${fmt(s.dailyAllowance)}.`
    : `You’re ${fmt(-s.remainingToday)} over today’s ${fmt(s.dailyAllowance)}.`;
}

const titleCase = (s: string) => s.toLowerCase().replace(/(^|\s)\p{L}/gu, (c) => c.toUpperCase());

export interface Report {
  text: string;
  /** Pending actions to show with Approve / Reject buttons. */
  pending: AgentAction[];
  currency: Currency;
}

/**
 * Today's numbers. With `propose` (the scheduled evening report) the agent also offers to move
 * today's unspent allowance to savings: pending at L2 (buttons), done at L3, nothing below L2.
 */
export async function dailyReport(db: Db, userId: string, opts: { propose?: boolean } = {}): Promise<Report> {
  const s = await dailySummary(db, userId);
  const cur = await userCurrency(db, userId);
  const fmt = (n: number) => formatMoney(n, cur);
  const lines = [
    `📊 FeMate report for ${s.date}`,
    '',
    `Spent today: ${fmt(s.todaySpent)}`,
    `Daily allowance: ${fmt(s.dailyAllowance)}`,
    s.remainingToday >= 0 ? `Left: ${fmt(s.remainingToday)}` : `Over by: ${fmt(-s.remainingToday)}`,
  ];
  if (s.byCategory.length) {
    lines.push('', ...s.byCategory.slice(0, 5).map((c) => `• ${c.category}: ${fmt(c.amount)}`));
  }

  if (opts.propose && s.savedToday > 0) {
    const [p] = await db.select().from(permissions).where(eq(permissions.userId, userId));
    if (p?.agentEnabled && (p.level === 'L2' || p.level === 'L3')) {
      const r = await proposeAction(db, userId, 'transfer_to_savings', { amount: s.savedToday }, {
        actor: 'agent',
        reason: `Unspent daily allowance on ${s.date}`,
      });
      lines.push('', r.action.status === 'blocked' ? `I wanted to save ${fmt(s.savedToday)}, but: ${r.message}` : `💰 ${r.message}`);
    }
  }

  await expirePending(db, userId);
  const pending = await db
    .select()
    .from(agentActions)
    .where(and(eq(agentActions.userId, userId), eq(agentActions.status, 'pending')));
  if (!pending.length) lines.push('', s.remainingToday >= 0 ? 'Nice work today 👏' : 'Tomorrow is a new day. You’ve got this.');
  return { text: lines.join('\n'), pending: pending.map(toAction), currency: cur };
}

export function describeAction(a: AgentAction, cur: Currency): string {
  return a.type === 'transfer_to_savings'
    ? `Move ${formatMoney(a.amount ?? 0, cur)} from Card to Savings?\nReason: ${a.reason}`
    : `Set a budget? ${a.reason}`;
}

/** An Approve / Reject tap. Approval goes through the same re-check as in the app. */
export async function decideAction(db: Db, userId: string, id: string, decision: 'approve' | 'reject'): Promise<string> {
  try {
    const a = await (decision === 'approve' ? approveAction : rejectAction)(db, userId, id);
    if (a.status !== 'executed') return '❌ Rejected. Nothing was changed.';
    return a.type === 'transfer_to_savings'
      ? `✅ Done: ${formatMoney(a.amount ?? 0, await userCurrency(db, userId))} moved to Savings.`
      : '✅ Done: budget set.';
  } catch (e) {
    if (e instanceof ApiError) return `⚠️ ${e.message}`;
    throw e;
  }
}
