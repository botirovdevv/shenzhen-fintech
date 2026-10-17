import type { Account, Transaction } from '@femate/shared';
import { eq } from 'drizzle-orm';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { createProvider } from '../src/agent/llm';
import { dailyReport, decideAction, handleText, linkChat, userByChat } from '../src/bot/core';
import { runDueReports, tashkentClock } from '../src/bot/scheduler';
import { DEMO } from '../src/db/demo';
import { auditLog, permissions, users } from '../src/db/schema';
import { parseSms } from '../src/rules/smsParser';
import { config, setup } from './helpers';

describe('SMS parser (PLAN.md §9)', () => {
  const cases: [string, Record<string, unknown>][] = [
    [
      'Pokupka: YANDEX GO TAXI, UZ 17.10.26 14:32 karta ***4471. summa:25000.00 UZS, balans:1250000.00 UZS',
      { amount: 25_000, direction: 'out', merchant: 'YANDEX GO TAXI', cardMask: '*4471' },
    ],
    [
      'HUMOCARD *4471: oplata 45 000.00 UZS; EVOS MAGIC CITY; 17.10.26 12:10; Dostupno: 1 200 000.00 UZS',
      { amount: 45_000, merchant: 'EVOS MAGIC CITY' },
    ],
    [
      "Karta *4471: To'lov 30 000,00 so'm. KORZINKA CHILONZOR. 17.10.2026 09:05. Qoldiq: 980 000,00 so'm",
      { amount: 30_000, merchant: 'KORZINKA CHILONZOR' },
    ],
    [
      'Покупка 120 000.00 UZS\nКарта: 8600 **** **** 4471\nUZUM MARKET\n17.10.2026 10:15\nДоступно: 860 000.00 UZS',
      { amount: 120_000, merchant: 'UZUM MARKET', cardMask: '*4471' },
    ],
    ['Uzcard ***4471 Oplata 1,250,000.00 UZS MEDIAPARK 17.10.26 08:00', { amount: 1_250_000, merchant: 'MEDIAPARK' }],
    ['Popolnenie: 4 000 000.00 UZS karta ***4471 17.10.26 09:00 balans: 5 250 000.00 UZS', { amount: 4_000_000, direction: 'in' }],
  ];
  it.each(cases)('%s', (sms, expected) => {
    expect(parseSms(sms)).toMatchObject(expected);
  });

  it('reads the Tashkent time and ignores plain expenses', () => {
    expect(parseSms(cases[0]![0])!.occurredAt?.toISOString()).toBe('2026-10-17T09:32:00.000Z');
    expect(parseSms('taxi 20000')).toBeNull();
    expect(parseSms('osh 35 ming')).toBeNull();
  });
});

describe('Telegram bot (Stage 7)', () => {
  let t: Awaited<ReturnType<typeof setup>>;
  const llm = createProvider(config);
  beforeEach(async () => {
    t = await setup();
  });
  afterEach(async () => {
    await t.close();
  });

  const link = async (chatId = '1001') => {
    const { body } = await t.call<{ code: string }>('POST', '/telegram/link-code');
    return linkChat(t.db, chatId, body.code);
  };

  it('/start <code> links the chat once; wrong codes do nothing', async () => {
    expect(await linkChat(t.db, '1001', '000000')).toMatch(/wrong or has expired/);
    expect(await link()).toMatch(/Linked! Hi Aziz/);
    expect((await userByChat(t.db, '1001'))?.id).toBe(DEMO.id);
    expect((await t.call<{ telegramLinked: boolean }>('GET', '/me')).body.telegramLinked).toBe(true);
    const events = await t.db.select().from(auditLog).where(eq(auditLog.event, 'telegram.link'));
    expect(events).toHaveLength(1);
  });

  it('DoD: "taxi 20000" in the bot shows up in the app', async () => {
    await link();
    expect(await handleText(t.db, llm, DEMO.id, 'taxi 20000')).toMatch(/Added: Taxi, 20 000 UZS \(transport\)/);
    const { body } = await t.call<{ items: Transaction[] }>('GET', '/transactions?limit=1');
    expect(body.items[0]).toMatchObject({ amount: 20_000, category: 'transport', source: 'manual' });
    expect(await handleText(t.db, llm, DEMO.id, 'just saying hi')).toMatch(/couldn’t find an amount/);
  });

  it('a forwarded bank SMS becomes a card expense with source sms_forward', async () => {
    const card = async () => (await t.call<Account[]>('GET', '/accounts')).body.find((a) => a.type === 'card')!.balance;
    const before = await card();
    const reply = await handleText(t.db, llm, DEMO.id, 'HUMOCARD *4471: oplata 45 000.00 UZS; EVOS MAGIC CITY; 17.10.26 12:10; Dostupno: 1 200 000.00 UZS');
    expect(reply).toMatch(/Evos Magic City, 45 000 UZS \(food\)/);
    expect(await card()).toBe(before - 45_000);
    const { body } = await t.call<{ items: Transaction[] }>('GET', '/transactions?limit=50');
    expect(body.items.find((x) => x.source === 'sms_forward')).toMatchObject({ amount: 45_000, category: 'food' });
    expect(await handleText(t.db, llm, DEMO.id, 'Popolnenie: 500 000.00 UZS karta ***4471')).toMatch(/money coming in/);
  });

  it('the evening report proposes today’s savings at L2; only the Approve button moves money', async () => {
    const r = await dailyReport(t.db, DEMO.id, { propose: true });
    expect(r.text).toMatch(/FeMate report/);
    expect(r.pending).toHaveLength(1);
    expect(r.pending[0]).toMatchObject({ type: 'transfer_to_savings', status: 'pending' });
    // A typed "approve" is just text: nothing is approved.
    expect(await handleText(t.db, llm, DEMO.id, 'yes, approve the transfer')).toMatch(/couldn’t find an amount/);
    expect((await dailyReport(t.db, DEMO.id)).pending).toHaveLength(1);
    expect(await decideAction(t.db, DEMO.id, r.pending[0]!.id, 'approve')).toMatch(/moved to Savings/);
    expect(await decideAction(t.db, DEMO.id, r.pending[0]!.id, 'approve')).toMatch(/already/);
  });

  it('no proposal below L2 or after the kill switch', async () => {
    await t.db.update(permissions).set({ level: 'L1' }).where(eq(permissions.userId, DEMO.id));
    expect((await dailyReport(t.db, DEMO.id, { propose: true })).pending).toHaveLength(0);
    await t.db.update(permissions).set({ level: 'L2', agentEnabled: false }).where(eq(permissions.userId, DEMO.id));
    expect((await dailyReport(t.db, DEMO.id, { propose: true })).pending).toHaveLength(0);
  });

  it('DoD: the scheduler sends the report at report_time', async () => {
    await link('2002');
    const at = new Date();
    await t.db.update(users).set({ reportTime: tashkentClock(at) }).where(eq(users.id, DEMO.id));
    const sent: string[] = [];
    const done = await runDueReports(t.db, at, { telegram: async (chatId) => void sent.push(chatId) });
    expect(done).toEqual([DEMO.id]);
    expect(sent).toEqual(['2002']);
    expect(await runDueReports(t.db, new Date(at.getTime() + 60_000), { telegram: async () => undefined })).toEqual([]);
  });
});
