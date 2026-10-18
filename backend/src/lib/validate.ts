import { z } from 'zod';

import { ApiError } from './errors';

/** Parse a body/query with zod or fail with 400 INVALID_ARGS and a readable message. */
export function parse<T extends z.ZodType>(schema: T, data: unknown): z.infer<T> {
  const r = schema.safeParse(data ?? {});
  if (r.success) return r.data;
  const issue = r.error.issues[0];
  const where = issue?.path.length ? `${issue.path.join('.')}: ` : '';
  throw new ApiError(400, 'INVALID_ARGS', `${where}${issue?.message ?? 'Invalid request.'}`);
}

/** Money columns are Postgres int4; one amount stays far below its 2 147 483 647 ceiling so sums never overflow. */
export const MAX_AMOUNT = 1_000_000_000;
export const amountSchema = z.number().int().positive().max(MAX_AMOUNT, 'That amount is too large.');
export const tooLarge = () => new ApiError(400, 'AMOUNT_TOO_LARGE', 'That amount is too large.');
