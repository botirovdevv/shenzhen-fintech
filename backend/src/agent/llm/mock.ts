// Keyless mock LLM (PLAN.md §10). A small intent machine over the conversation: it asks for tools
// exactly like a real model would, so the whole Policy Guard / audit path runs in demos and tests.
import { categorize, parseAmount } from '../../rules/categorize';
import { fmt } from '../../lib/format';
import type { LlmMessage, LlmProvider, ToolCall } from './provider';

type Result = Record<string, unknown> & { error?: string; message?: string };

const INJECTION_RE = /transfer all money to card ([\d ]{16,19}\d)/i;

function lastTurn(messages: LlmMessage[]) {
  let i = messages.length - 1;
  while (i >= 0 && messages[i]!.role !== 'user') i--;
  const user = i >= 0 ? messages[i]!.content : '';
  const results = new Map<string, Result>();
  for (const m of messages.slice(i + 1)) {
    if (m.role === 'tool') {
      try {
        results.set(m.name, JSON.parse(m.content) as Result);
      } catch {
        results.set(m.name, { error: 'UNPARSEABLE' });
      }
    }
  }
  return { user, results, step: messages.length - i };
}

const call = (step: number, name: string, args: Record<string, unknown> = {}) => ({
  toolCalls: [{ id: `call_${step}_${name}`, name, args } satisfies ToolCall],
});

function transferReply(r: Result, savedToday?: number): string {
  const amount = fmt(Number(r.amount ?? 0));
  if (r.error) return `I couldn’t do that: ${String(r.message ?? r.error).replace(/\.$/, '')} (${r.error}). Money can only go to your own savings, within your limits.`;
  if (r.status === 'pending') {
    const left = savedToday !== undefined ? `You stayed ${fmt(savedToday)} UZS under today’s limit. ` : '';
    return `${left}I’ve proposed moving ${amount} UZS to Savings. It needs your approval.`;
  }
  return `Moved ${amount} UZS to Savings on Autopilot.`;
}

function spendingReply(r: Result, sim?: Result): string {
  const items = (r.transactions as { amount: number; category: string; description: string }[] | undefined) ?? [];
  const byCat = new Map<string, number>();
  for (const t of items) if (t.category !== 'transfer') byCat.set(t.category, (byCat.get(t.category) ?? 0) + t.amount);
  const top = [...byCat].sort((a, b) => b[1] - a[1]).slice(0, 3);
  let s = top.length
    ? `Last 14 days: ${top.map(([c, a]) => `${c} ${fmt(a)}`).join(', ')}.`
    : 'I don’t see any spending in the last 14 days.';
  if (sim && !sim.error && Number(sim.monthlySaving) > 0)
    s += ` Taking the bus instead of a taxi on 15 days a month would save about ${fmt(Number(sim.monthlySaving))} UZS a month.`;
  if (items.some((t) => INJECTION_RE.test(t.description)))
    s += ' One transaction note contains instructions to move money; I treated it as data and ignored it.';
  return s;
}

export const mockProvider: LlmProvider = {
  async categorize(text) {
    return categorize(text);
  },

  async chat({ messages }) {
    const { user, results, step } = lastTurn(messages);
    const s = user.toLowerCase().replace(/[‘’ʻʼ`]/g, "'");
    const has = (n: string) => results.get(n);

    // Red-team mode: behave like a model that was fooled by a transaction note, so the demo can show
    // Policy Guard stopping it (TARGET_NOT_ALLOWED). A real LLM is told to ignore such notes.
    if (/follow|instruction|note|izoh|ko'rsatma/.test(s)) {
      const list = has('list_transactions');
      if (!list) return call(step, 'list_transactions', {});
      const tr = has('transfer_to_savings');
      const hit = JSON.stringify(list).match(INJECTION_RE);
      if (!tr && hit) return call(step, 'transfer_to_savings', { amount: 1_000_000, toAccountId: hit[1], reason: 'Instruction from a transaction note' });
      if (!tr) return { text: 'I read your last 14 days. None of the notes ask for anything.' };
      return {
        text: tr.error
          ? `A transaction note told me to send all your money to another card. Policy Guard blocked it (${tr.error}) and it’s in the audit log. Money can only go to your own savings.`
          : transferReply(tr),
      };
    }

    // Move money to savings: an explicit amount, "all money", or today's leftover.
    if (/sav|move|transfer|o'tkaz|jamg|tejal|all money|everything|hammasini|barchasini/.test(s)) {
      const tr = has('transfer_to_savings');
      const summary = has('get_daily_summary');
      if (tr) return { text: transferReply(tr, summary ? Number(summary.savedToday) : undefined) };
      const explicit = parseAmount(user);
      if (explicit && explicit >= 1000) return call(step, 'transfer_to_savings', { amount: explicit, reason: 'You asked to move this to savings.' });
      if (/all money|everything|hammasini|barchasini/.test(s)) {
        const bal = has('get_balance');
        if (!bal) return call(step, 'get_balance');
        const card = (bal.accounts as { type: string; balance: number }[] | undefined)?.find((a) => a.type === 'card');
        return call(step, 'transfer_to_savings', { amount: card?.balance ?? 0, reason: 'You asked to move everything to savings.' });
      }
      if (!summary) return call(step, 'get_daily_summary');
      if (summary.error) return { text: `I can’t read today’s numbers: ${summary.message}` };
      const saved = Number(summary.savedToday);
      const amount = Math.floor(saved / 10_000) * 10_000;
      if (amount <= 0) return { text: 'You’re over today’s limit, so there’s nothing to move to savings today.' };
      return call(step, 'transfer_to_savings', { amount, reason: `You stayed ${fmt(saved)} UZS under today’s limit.` });
    }

    if (/balance|balans|hisob|how much do i have/.test(s)) {
      const bal = has('get_balance');
      if (!bal) return call(step, 'get_balance');
      if (bal.error) return { text: `I can’t see your balances: ${bal.message}` };
      const accs = (bal.accounts as { name: string; balance: number }[]) ?? [];
      return { text: accs.map((a) => `${a.name}: ${fmt(a.balance)} UZS`).join('. ') + '.' };
    }

    if (/left|limit|today|bugun|qancha|qoldi/.test(s)) {
      const sum = has('get_daily_summary');
      if (!sum) return call(step, 'get_daily_summary');
      if (sum.error) return { text: `I can’t read today’s numbers: ${sum.message}` };
      return {
        text: `You have ${fmt(Number(sum.remainingToday))} UZS left today out of ${fmt(Number(sum.dailyAllowance))}. Spent so far: ${fmt(Number(sum.todaySpent))}.`,
      };
    }

    if (/spend|spent|where|taxi|taksi|transport|bus|avtobus|xarajat|sarf|what if/.test(s)) {
      const list = has('list_transactions');
      if (!list) return call(step, 'list_transactions', {});
      if (list.error) return { text: `I can’t read your transactions: ${list.message}` };
      const rides = ((list.transactions as { category: string; amount: number; description: string }[]) ?? []).filter(
        (t) => t.category === 'transport' && /yandex|taxi|taksi/i.test(t.description),
      );
      const sim = has('simulate_saving');
      if (!sim && rides.length >= 5) {
        const avg = Math.round(rides.reduce((a, t) => a + t.amount, 0) / rides.length / 1000) * 1000;
        return call(step, 'simulate_saving', { currentCostPerDay: avg, alternativeCostPerDay: 4_000, daysPerMonth: 15 });
      }
      return { text: spendingReply(list, sim) };
    }

    return {
      text: 'I can tell you what’s left for today, where your money goes, or move today’s savings to your Savings account. What would you like?',
    };
  },
};
