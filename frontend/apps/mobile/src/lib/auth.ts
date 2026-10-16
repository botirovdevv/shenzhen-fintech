import { kv } from './storage';

const KEY = 'femate.token';

export async function loadToken(): Promise<string | null> {
  return (await kv.getItem(KEY)) as string | null;
}

export async function saveToken(token: string | null): Promise<void> {
  if (token) await kv.setItem(KEY, token);
  else await kv.removeItem(KEY);
}
