import type { z } from 'zod';

import { ApiError } from './errors';

/** Parse a body/query with zod or fail with 400 INVALID_ARGS and a readable message. */
export function parse<T extends z.ZodType>(schema: T, data: unknown): z.infer<T> {
  const r = schema.safeParse(data ?? {});
  if (r.success) return r.data;
  const issue = r.error.issues[0];
  const where = issue?.path.length ? `${issue.path.join('.')}: ` : '';
  throw new ApiError(400, 'INVALID_ARGS', `${where}${issue?.message ?? 'Invalid request.'}`);
}
