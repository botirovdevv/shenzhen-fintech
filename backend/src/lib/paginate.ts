// Opaque keyset cursor over (timestamp desc, id desc).
import { ApiError } from './errors';

export interface Cursor {
  at: Date;
  id: string;
}

export const encodeCursor = (at: Date, id: string) => Buffer.from(`${at.toISOString()}|${id}`).toString('base64url');

export function decodeCursor(raw: string | undefined): Cursor | null {
  if (!raw) return null;
  const [iso, id] = Buffer.from(raw, 'base64url').toString().split('|');
  const at = new Date(iso ?? '');
  if (!id || Number.isNaN(at.getTime())) throw new ApiError(400, 'INVALID_ARGS', 'Bad cursor.');
  return { at, id };
}
