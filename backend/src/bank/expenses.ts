import type { Category, TransactionSource } from '@femate/shared';
import { eq, sql } from 'drizzle-orm';

import type { Db } from '../db/client';
import { accounts, transactions } from '../db/schema';
import { ApiError } from '../lib/errors';
import { newId } from '../lib/ids';
import { accountOfType } from './mockBank';

/** A spend the user reports (typed, spoken, or told to the agent). Paid from cash, like the app's mock; forwarded card SMS from the card. */
export async function addExpense(
  db: Db,
  userId: string,
  e: { amount: number; category: Category; description: string; source: TransactionSource; occurredAt?: Date },
  from: 'cash' | 'card' = 'cash',
) {
  const cash = (await accountOfType(db, userId, from)) ?? (await accountOfType(db, userId, from === 'cash' ? 'card' : 'cash'));
  if (!cash) throw new ApiError(409, 'BANK_NOT_CONNECTED', 'Connect the sandbox bank first.');
  return db.transaction(async (tx) => {
    await tx
      .update(accounts)
      .set({ balance: sql`${accounts.balance} - ${e.amount}` })
      .where(eq(accounts.id, cash.id));
    const [t] = await tx
      .insert(transactions)
      .values({ id: newId('tx'), userId, accountId: cash.id, direction: 'out', ...e, occurredAt: e.occurredAt ?? new Date() })
      .returning();
    return t!;
  });
}
