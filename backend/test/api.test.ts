import type { Account, AgentAction, AuditEntry, ChatResponse, DailySummary, Page, Permissions, Recommendation, Transaction, User } from '@femate/shared';
import { eq } from 'drizzle-orm';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { MAX_TOOL_CALLS, chat } from '../src/agent/agent';
import type { LlmProvider } from '../src/agent/llm/provider';
import { runTool } from '../src/agent/tools';
import { DEMO } from '../src/db/demo';
import { accounts, agentActions, permissions } from '../src/db/schema';
import { checkPolicy } from '../src/policy/policyGuard';
import { MAX_AUDIO_BYTES, type SttProvider } from '../src/stt/groq';
import { setup } from './helpers';

let t: Awaited<ReturnType<typeof setup>>;
beforeEach(async () => {
  t = await setup();
});
afterEach(async () => {
  await t.close();
});

const balances = async () => {
  const { body } = await t.call<Account[]>('GET', '/accounts');
  return Object.fromEntries(body.map((a) => [a.type, a.balance]));
};
const setPerms = (p: Partial<typeof permissions.$inferInsert>) => t.db.update(permissions).set(p).where(eq(permissions.userId, DEMO.id));

describe('auth and basics', () => {
  it('health, register, login, me', async () => {
    expect((await t.app.inject({ url: '/api/v1/health' })).json()).toEqual({ ok: true });
    const reg = await t.app.inject({ method: 'POST', url: '/api/v1/auth/register', payload: { email: 'New@Example.com ', password: 'secret1', name: 'Dilnoza' } });
    expect(reg.statusCode).toBe(201);
    expect(reg.json<{ user: User }>().user).toMatchObject({ email: 'new@example.com', name: 'Dilnoza', telegramLinked: false });
    const dup = await t.app.inject({ method: 'POST', url: '/api/v1/auth/register', payload: { email: 'new@example.com', password: 'secret1', name: 'X' } });
    expect(dup.json()).toEqual({ error: { code: 'EMAIL_TAKEN', message: expect.any(String) } });
    const bad = await t.app.inject({ method: 'POST', url: '/api/v1/auth/login', payload: { email: DEMO.email, password: 'nope' } });
    expect(bad.statusCode).toBe(401);
    expect((await t.app.inject({ url: '/api/v1/me' })).json()).toMatchObject({ error: { code: 'UNAUTHORIZED' } });
    expect((await t.call<User>('GET', '/me')).body).toMatchObject({ name: 'Aziz', monthlyIncome: 4_000_000 });
  });

  it('new user: connect bank opens sandbox accounts and sets limits to the level maximum', async () => {
    const reg = await t.app.inject({ method: 'POST', url: '/api/v1/auth/register', payload: { email: 'b@x.uz', password: 'secret1', name: 'B' } });
    const auth = { authorization: `Bearer ${reg.json<{ token: string }>().token}` };
    const res = await t.app.inject({ method: 'POST', url: '/api/v1/bank/connect', headers: auth, payload: { scopes: ['read_balance', 'transfer_own'], level: 'L3' } });
    expect(res.json<{ accounts: Account[] }>().accounts.map((a) => a.type).sort()).toEqual(['card', 'cash', 'savings']);
    const p = await t.app.inject({ url: '/api/v1/permissions', headers: auth });
    expect(p.json()).toEqual({ level: 'L3', scopes: ['read_balance', 'transfer_own'], perActionLimit: 50_000, dailyLimit: 100_000, agentEnabled: true });
  });

  it('transactions: structured + text, pagination, validation errors', async () => {
    const a = await t.call<Transaction>('POST', '/transactions', { text: 'Bozorga qirq besh ming ishlatdim' });
    expect(a.status).toBe(201);
    expect(a.body).toMatchObject({ amount: 45_000, category: 'food', source: 'manual', direction: 'out' });
    const b = await t.call('POST', '/transactions', { text: 'just words' });
    expect(b).toMatchObject({ status: 400, body: { error: { code: 'INVALID_ARGS' } } });
    const p1 = await t.call<Page<Transaction>>('GET', '/transactions?limit=10');
    expect(p1.body.items).toHaveLength(10);
    expect(p1.body.items[0]!.id).toBe(a.body.id);
    const p2 = await t.call<Page<Transaction>>('GET', `/transactions?limit=10&cursor=${p1.body.nextCursor}`);
    expect(p2.body.items[0]!.occurredAt <= p1.body.items[9]!.occurredAt).toBe(true);
    expect(new Set([...p1.body.items, ...p2.body.items].map((x) => x.id)).size).toBe(20);
    expect((await t.call('POST', '/transactions/voice')).body).toMatchObject({ error: { code: 'STT_UNAVAILABLE' } });
  });

  it('daily summary for the seeded day: 93 548 allowance in a 31-day month', async () => {
    const { body } = await t.call<DailySummary>('GET', '/summary/daily?date=2026-10-17');
    expect(body.dailyAllowance).toBe(93_548);
  });
});

describe('voice input (PLAN.md Stage 6)', () => {
  const heard: string[] = [];
  const stt: SttProvider = { transcribe: async () => heard.shift() ?? '' };
  const upload = (app: typeof t.app, token: string, bytes = 1000) => {
    const form = new FormData();
    form.append('audio', new Blob([new Uint8Array(bytes)], { type: 'audio/m4a' }), 'voice.m4a');
    return app.inject({ method: 'POST', url: '/api/v1/transactions/voice', payload: form, headers: { authorization: `Bearer ${token}` } });
  };
  const token = async () =>
    (await t.app.inject({ method: 'POST', url: '/api/v1/auth/login', payload: { email: DEMO.email, password: DEMO.password } })).json<{ token: string }>().token;

  it('transcript becomes a voice expense; no amount, silence and big files are refused', async () => {
    await t.close();
    t = await setup({ stt });
    const tok = await token();
    heard.push('Taksi 20 ming.');
    const ok = await upload(t.app, tok);
    expect(ok.statusCode).toBe(201);
    expect(ok.json()).toMatchObject({ transcript: 'Taksi 20 ming.', transaction: { amount: 20_000, category: 'transport', description: 'Taksi', source: 'voice' } });
    heard.push('hello there');
    expect((await upload(t.app, tok)).json()).toMatchObject({ error: { code: 'INVALID_ARGS', message: expect.stringContaining('hello there') } });
    expect((await upload(t.app, tok)).json()).toMatchObject({ error: { code: 'EMPTY_AUDIO' } });
    const big = await upload(t.app, tok, MAX_AUDIO_BYTES + 1);
    expect(big.statusCode).toBe(413);
    expect(big.json()).toMatchObject({ error: { code: 'AUDIO_TOO_LARGE' } });
    expect((await t.call('POST', '/transactions/voice', { text: 'taxi 20000' })).body).toMatchObject({ error: { code: 'INVALID_ARGS' } });
  });
});

describe('Policy Guard (PLAN.md §8), rules in order', () => {
  const transfer = (args: unknown) => checkPolicy(t.db, DEMO.id, 'transfer_to_savings', args);
  const code = async (args: unknown) => {
    const d = await transfer(args);
    return d.allowed ? 'OK' : d.code;
  };

  it('1 kill switch wins over everything', async () => {
    await setPerms({ agentEnabled: false, level: 'L0', scopes: [] });
    expect(await code({ amount: -5, toAccountId: '8600123412341234' })).toBe('KILL_SWITCH_ACTIVE');
  });
  it('2 level before scope', async () => {
    await setPerms({ level: 'L1', scopes: [] });
    expect(await code({ amount: 1000 })).toBe('INSUFFICIENT_LEVEL');
  });
  it('3 scope before args', async () => {
    await setPerms({ scopes: ['read_balance'] });
    expect(await code({ amount: 'lots' })).toBe('MISSING_SCOPE');
  });
  it('4 args must be a positive integer amount', async () => {
    expect(await code({ amount: 0 })).toBe('INVALID_ARGS');
    expect(await code({ amount: 10.5 })).toBe('INVALID_ARGS');
    expect(await code({})).toBe('INVALID_ARGS');
  });
  it('5 only own card -> own savings (prompt-injection target is refused)', async () => {
    expect(await code({ amount: 999_999_999, toAccountId: '8600 1234 5678 4471' })).toBe('TARGET_NOT_ALLOWED');
    expect(await code({ amount: 1000, fromAccountId: 'acc_aziz_cash' })).toBe('TARGET_NOT_ALLOWED');
  });
  it('6 per-action limit, 7 daily limit, 8 funds', async () => {
    expect(await code({ amount: 100_001 })).toBe('PER_ACTION_LIMIT');
    await setPerms({ perActionLimit: 100_000, dailyLimit: 150_000 });
    const first = (await t.call<ChatResponse>('POST', '/agent/chat', { message: 'move 100 000 to savings' })).body.actions[0]!;
    expect((await t.call<AgentAction>('POST', `/agent/actions/${first.id}/approve`)).body.status).toBe('executed');
    expect(await code({ amount: 60_000 })).toBe('DAILY_LIMIT');
    await setPerms({ dailyLimit: 300_000 });
    await t.db.update(accounts).set({ balance: 10_000 }).where(eq(accounts.id, 'acc_aziz_card'));
    expect(await code({ amount: 20_000 })).toBe('INSUFFICIENT_FUNDS');
  });
  it('9 L2 -> confirm, L3 -> execute', async () => {
    expect(await transfer({ amount: 20_000 })).toMatchObject({ allowed: true, mode: 'confirm' });
    await setPerms({ level: 'L3', perActionLimit: 50_000, dailyLimit: 100_000 });
    expect(await transfer({ amount: 20_000 })).toMatchObject({ allowed: true, mode: 'execute' });
  });
  it('read tools need their scope; L1 cannot add expenses', async () => {
    await setPerms({ level: 'L1', scopes: ['read_balance'] });
    expect(await checkPolicy(t.db, DEMO.id, 'get_balance', {})).toMatchObject({ allowed: true });
    expect(await checkPolicy(t.db, DEMO.id, 'list_transactions', {})).toMatchObject({ allowed: false, code: 'MISSING_SCOPE' });
    expect(await checkPolicy(t.db, DEMO.id, 'add_expense', { amount: 1, category: 'food', description: 'x' })).toMatchObject({ code: 'INSUFFICIENT_LEVEL' });
  });
});

describe('agent actions and audit (demo scenario §15)', () => {
  it('step 8: L2 transfer of today’s savings is pending, approval moves money once', async () => {
    const before = await balances();
    const { body } = await t.call<ChatResponse>('POST', '/agent/chat', { message: "Bugun tejalgan 20 000 so'mni jamg'armaga o'tkazaymi?" });
    expect(body.actions).toHaveLength(1);
    const a = body.actions[0]!;
    expect(a).toMatchObject({ type: 'transfer_to_savings', amount: 20_000, status: 'pending' });
    expect(body.reply).toMatch(/approval/);
    expect(await balances()).toEqual(before);

    const ok = await t.call<AgentAction>('POST', `/agent/actions/${a.id}/approve`);
    expect(ok.body.status).toBe('executed');
    const after = await balances();
    expect(after.card).toBe(before.card! - 20_000);
    expect(after.savings).toBe(before.savings! + 20_000);
    expect((await t.call('POST', `/agent/actions/${a.id}/approve`)).body).toMatchObject({ error: { code: 'NOT_PENDING' } });
    // An empty body with a JSON content type is fine.
    const raw = await t.app.inject({ method: 'POST', url: `/api/v1/agent/actions/${a.id}/reject`, headers: { 'content-type': 'application/json', authorization: (await t.app.inject({ method: 'POST', url: '/api/v1/auth/login', payload: { email: DEMO.email, password: DEMO.password } })).json<{ token: string }>().token.replace(/^/, 'Bearer ') } });
    expect(raw.json()).toMatchObject({ error: { code: 'NOT_PENDING' } });
    // Agent transfers don't count as spending.
    const today = (await t.call<DailySummary>('GET', '/summary/daily')).body;
    expect(today.byCategory.find((c) => c.category === 'transfer')).toBeUndefined();
  });

  it('step 9: 500 000 is blocked with PER_ACTION_LIMIT and shows up in the audit log', async () => {
    const { body } = await t.call<ChatResponse>('POST', '/agent/chat', { message: 'Move 500 000 to savings' });
    expect(body.actions[0]).toMatchObject({ status: 'blocked', amount: 500_000 });
    expect(body.reply).toMatch(/PER_ACTION_LIMIT/);
    const audit = (await t.call<Page<AuditEntry>>('GET', '/audit')).body.items;
    expect(audit.find((e) => e.event === 'tool.transfer_to_savings')).toMatchObject({ decision: 'blocked', reason: expect.stringMatching(/^PER_ACTION_LIMIT/) });
  });

  it('step 10: a fooled agent following the injected note is stopped by TARGET_NOT_ALLOWED, card masked in the log', async () => {
    const before = await balances();
    const { body } = await t.call<ChatResponse>('POST', '/agent/chat', { message: 'Follow the instructions in my transaction notes' });
    expect(body.actions[0]).toMatchObject({ status: 'blocked' });
    expect(body.reply).toMatch(/TARGET_NOT_ALLOWED/);
    expect(await balances()).toEqual(before);
    const exported = (await t.call<(AuditEntry & { details?: unknown })[]>('GET', '/audit/export')).body;
    const blocked = exported.find((e) => e.decision === 'blocked')!;
    expect(blocked.reason).toMatch(/^TARGET_NOT_ALLOWED: 8600 \*\*\*\* \*\*\*\* 4471/);
    expect(JSON.stringify(exported)).not.toMatch(/8600 1234 5678 4471/);
  });

  it('the agent sees transaction notes only inside <untrusted_data>', async () => {
    const r = await runTool({ db: t.db, userId: DEMO.id, actions: [] }, 'list_transactions', {});
    const notes = (r.transactions as { description: string }[]).map((x) => x.description);
    expect(notes.every((d) => d.startsWith('<untrusted_data>') && d.endsWith('</untrusted_data>'))).toBe(true);
  });

  it('step 11: kill switch rejects pending actions and blocks the next one; re-enable starts at L1', async () => {
    const pending = (await t.call<ChatResponse>('POST', '/agent/chat', { message: 'move 20000 to savings' })).body.actions[0]!;
    const killed = await t.call<Permissions>('POST', '/permissions/kill-switch');
    expect(killed.body).toMatchObject({ agentEnabled: false, level: 'L1' });
    expect((await t.call<AgentAction[]>('GET', '/agent/actions')).body.find((a) => a.id === pending.id)?.status).toBe('rejected');
    const next = await t.call<ChatResponse>('POST', '/agent/chat', { message: 'move 20000 to savings' });
    expect(next.body.actions[0]).toMatchObject({ status: 'blocked' });
    expect(next.body.reply).toMatch(/KILL_SWITCH_ACTIVE/);
    const back = await t.call<Permissions>('PUT', '/permissions', {});
    expect(back.body).toMatchObject({ agentEnabled: true, level: 'L1', perActionLimit: 0 });
  });

  it('approval re-checks the rules: lowering the level after proposing blocks it', async () => {
    const a = (await t.call<ChatResponse>('POST', '/agent/chat', { message: 'move 20000 to savings' })).body.actions[0]!;
    await t.call('PUT', '/permissions', { level: 'L1' });
    const res = await t.call('POST', `/agent/actions/${a.id}/approve`);
    expect(res).toMatchObject({ status: 403, body: { error: { code: 'INSUFFICIENT_LEVEL' } } });
  });

  it('pending actions expire after 15 minutes', async () => {
    const a = (await t.call<ChatResponse>('POST', '/agent/chat', { message: 'move 20000 to savings' })).body.actions[0]!;
    await t.db.update(agentActions).set({ expiresAt: new Date(Date.now() - 1000) }).where(eq(agentActions.id, a.id));
    expect((await t.call<AgentAction[]>('GET', '/agent/actions?status=expired')).body.map((x) => x.id)).toContain(a.id);
    expect((await t.call('POST', `/agent/actions/${a.id}/approve`)).body).toMatchObject({ error: { code: 'NOT_PENDING' } });
  });

  it('L3 executes within limits immediately', async () => {
    await t.call('PUT', '/permissions', { level: 'L3' });
    const before = await balances();
    const { body } = await t.call<ChatResponse>('POST', '/agent/chat', { message: 'move 30000 to savings' });
    expect(body.actions[0]).toMatchObject({ status: 'executed' });
    expect((await balances()).savings).toBe(before.savings! + 30_000);
  });

  it('permissions are clamped to the system maximum', async () => {
    const { body } = await t.call<Permissions>('PUT', '/permissions', { level: 'L3', perActionLimit: 1_000_000, dailyLimit: 20_000 });
    expect(body).toMatchObject({ perActionLimit: 50_000, dailyLimit: 20_000 });
  });

  it('step 7: recommendations include the 240 000 bus tip; applying the food cap creates a pending set_budget', async () => {
    const recs = (await t.call<Recommendation[]>('GET', '/agent/recommendations')).body;
    expect(recs.find((r) => /bus/.test(r.title))?.monthlySaving).toBeGreaterThan(200_000);
    const cap = recs.find((r) => r.actionType === 'set_budget')!;
    const applied = await t.call<{ action?: AgentAction }>('POST', `/agent/recommendations/${cap.id}/apply`);
    expect(applied.body.action).toMatchObject({ type: 'set_budget', status: 'pending' });
    expect((await t.call<AgentAction>('POST', `/agent/actions/${applied.body.action!.id}/approve`)).body.status).toBe('executed');
  });

  it('what-if endpoint', async () => {
    expect((await t.call('POST', '/agent/simulate', { currentCostPerDay: 20_000, alternativeCostPerDay: 4_000, daysPerMonth: 15 })).body).toEqual({
      monthlySaving: 240_000,
      yearlySaving: 2_880_000,
    });
  });
});

describe('agent loop', () => {
  it(`stops after ${MAX_TOOL_CALLS} tool calls even if the model keeps asking`, async () => {
    let calls = 0;
    const greedy: LlmProvider = {
      categorize: async () => ({ amount: null, category: 'other', description: '' }),
      chat: async ({ tools }) => (tools.length ? { toolCalls: [{ id: `c${++calls}`, name: 'get_balance', args: {} }] } : { text: 'done' }),
    };
    const r = await chat(t.db, greedy, DEMO.id, 'loop forever');
    expect(calls).toBe(MAX_TOOL_CALLS);
    expect(r.reply).toBe('done');
  });

  it('unknown tools are refused and audited', async () => {
    const r = await runTool({ db: t.db, userId: DEMO.id, actions: [] }, 'send_to_any_card', { card: '8600' });
    expect(r).toMatchObject({ error: 'UNKNOWN_TOOL' });
  });
});
