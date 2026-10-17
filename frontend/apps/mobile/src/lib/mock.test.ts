import { beforeEach, describe, expect, it, vi } from 'vitest';

// The mock keeps state in module scope, so each test gets a fresh copy.
async function fresh() {
  vi.resetModules();
  return import('./mock');
}

describe('categorize (mock LLM, PLAN.md §10)', () => {
  let categorize: Awaited<ReturnType<typeof fresh>>['categorize'];
  beforeEach(async () => {
    ({ categorize } = await fresh());
  });

  it.each([
    ['taxi 20k', 20_000, 'transport'],
    ['taxi 20 ming', 20_000, 'transport'],
    ['lunch 35 ming', 35_000, 'food'],
    ['electricity 120000', 120_000, 'utilities'],
    ['Uzum 250 000', 250_000, 'shopping'],
    ['Bozorga qirq besh ming ishlatdim', 45_000, 'food'],
    ['Taksiga yigirma ming berdim', 20_000, 'transport'],
  ] as const)('%s → %i %s', (text, amount, category) => {
    const r = categorize(text);
    expect(r.amount).toBe(amount);
    expect(r.category).toBe(category);
  });

  it('returns no amount when there is none', () => {
    expect(categorize('coffee').amount).toBeNull();
  });
});

describe('parseUzbekNumber', () => {
  it('reads compound numbers', async () => {
    const { parseUzbekNumber } = await fresh();
    expect(parseUzbekNumber('qirq besh ming')).toBe(45_000);
    expect(parseUzbekNumber('bir yuz yigirma ming')).toBe(120_000);
    expect(parseUzbekNumber("o'ttiz besh ming")).toBe(35_000);
    expect(parseUzbekNumber('hech narsa')).toBeNull();
  });
});

describe('mock API rules (PLAN.md §8, §9)', () => {
  it('computes the daily allowance from income, fixed costs and goal', async () => {
    const { mockApi } = await fresh();
    const s = await mockApi.dailySummary();
    const now = new Date();
    const days = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
    expect(s.dailyAllowance).toBe(Math.floor((4_000_000 - 600_000 - 500_000) / days));
    expect(s.todaySpent).toBe(72_000);
    expect(s.remainingToday).toBe(s.dailyAllowance - 72_000);
  });

  it('blocks a transfer over the per-action limit and logs it', async () => {
    const { mockApi } = await fresh();
    const res = await mockApi.chat('Move 500 000 to savings');
    expect(res.actions[0]?.status).toBe('blocked');
    expect(res.actions[0]?.reason).toMatch(/^PER_ACTION_LIMIT/);
    const audit = await mockApi.audit();
    expect(audit.items[0]).toMatchObject({ decision: 'blocked', event: 'tool.transfer_to_savings' });
  });

  it('moves money only after approval (L2)', async () => {
    const { mockApi } = await fresh();
    const [pending] = await mockApi.actions('pending');
    expect(pending?.amount).toBe(20_000);
    const before = await mockApi.accounts();
    await mockApi.approveAction(pending!.id);
    const after = await mockApi.accounts();
    const bal = (list: typeof before, type: string) => list.find((a) => a.type === type)!.balance;
    expect(bal(after, 'card')).toBe(bal(before, 'card') - 20_000);
    expect(bal(after, 'savings')).toBe(bal(before, 'savings') + 20_000);
  });

  it('kill switch rejects pending actions and blocks new ones', async () => {
    const { mockApi } = await fresh();
    const [pending] = await mockApi.actions('pending');
    const perms = await mockApi.killSwitch();
    expect(perms.agentEnabled).toBe(false);
    await expect(mockApi.approveAction(pending!.id)).rejects.toMatchObject({ code: 'NOT_PENDING' });
    const res = await mockApi.chat('move today’s savings');
    expect(res.actions[0]?.reason).toMatch(/^KILL_SWITCH_ACTIVE/);
  });

  it('caps limits at the system maximum for the level', async () => {
    const { mockApi } = await fresh();
    const p = await mockApi.updatePermissions({ level: 'L3', perActionLimit: 1_000_000 });
    expect(p.perActionLimit).toBe(50_000);
    expect(p.dailyLimit).toBe(100_000);
  });

  it('turns a voice note into a saved expense', async () => {
    const { mockApi } = await fresh();
    const res = await mockApi.voiceTransaction('file://voice.m4a');
    expect(res.transcript).toBe('Bozorga qirq besh ming ishlatdim');
    expect(res.transaction).toMatchObject({ amount: 45_000, category: 'food', source: 'voice' });
  });

  it('tops up, moves between own accounts and corrects a balance, none of it as spending', async () => {
    const { mockApi } = await fresh();
    const bal = async () => Object.fromEntries((await mockApi.accounts()).map((a) => [a.type, a.balance]));
    const before = await bal();
    const spent = (await mockApi.dailySummary()).todaySpent;
    await mockApi.deposit({ to: 'card', amount: 100_000 });
    const atm = await mockApi.transfer({ from: 'card', to: 'cash', amount: 40_000 });
    expect(atm.transaction).toMatchObject({ description: 'ATM withdrawal', category: 'transfer' });
    expect(await bal()).toMatchObject({ card: before.card! + 60_000, cash: before.cash! + 40_000 });
    await expect(mockApi.transfer({ from: 'cash', to: 'card', amount: 1e12 })).rejects.toMatchObject({ code: 'INSUFFICIENT_FUNDS' });
    const fix = await mockApi.setBalance({ account: 'cash', balance: 10_000 });
    expect(fix.transaction).toMatchObject({ description: 'Balance correction', direction: 'out' });
    expect((await mockApi.dailySummary()).todaySpent).toBe(spent);
  });
});
