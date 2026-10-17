// Demo user from PLAN.md §7: aziz@femate.uz / demo1234, L2 Co-pilot, 14 days of sandbox history.
import bcrypt from 'bcryptjs';
import { eq } from 'drizzle-orm';

import { audit } from '../audit/audit';
import { openSandboxAccounts, seedDemoHistory } from '../bank/mockBank';
import type { Db } from './client';
import { permissions, users } from './schema';

export const DEMO = { id: 'usr_aziz', email: 'aziz@femate.uz', password: 'demo1234' };

export async function demoExists(db: Db) {
  const [u] = await db.select({ id: users.id }).from(users).where(eq(users.id, DEMO.id));
  return Boolean(u);
}

/** Deletes the demo user (everything cascades) and creates it again from scratch. */
export async function resetDemo(db: Db) {
  await db.delete(users).where(eq(users.id, DEMO.id));
  await db.insert(users).values({
    id: DEMO.id,
    email: DEMO.email,
    passwordHash: await bcrypt.hash(DEMO.password, 10),
    name: 'Aziz',
    monthlyIncome: 4_000_000,
    fixedCostsMonthly: 600_000,
    savingsGoalMonthly: 500_000,
  });
  await db.insert(permissions).values({
    userId: DEMO.id,
    level: 'L2',
    scopes: ['read_balance', 'read_transactions', 'transfer_own'],
    perActionLimit: 100_000,
    dailyLimit: 300_000,
    agentEnabled: true,
  });
  const ids = { card: 'acc_aziz_card', savings: 'acc_aziz_savings', cash: 'acc_aziz_cash' };
  await openSandboxAccounts(db, DEMO.id, ids);
  await seedDemoHistory(db, DEMO.id, ids);
  await audit(db, DEMO.id, {
    actor: 'user',
    event: 'bank.connect',
    decision: 'info',
    reason: 'Sandbox Bank connected at L2 with read_balance, read_transactions, transfer_own.',
    level: 'L2',
  });
}
