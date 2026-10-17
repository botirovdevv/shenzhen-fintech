import { PGlite } from '@electric-sql/pglite';
import { drizzle } from 'drizzle-orm/pglite';
import { migrate } from 'drizzle-orm/pglite/migrator';

import { buildApp } from '../src/app';
import type { Config } from '../src/config';
import { MIGRATIONS_DIR, type Db } from '../src/db/client';
import { DEMO, resetDemo } from '../src/db/demo';
import * as schema from '../src/db/schema';

export const config: Config = {
  PORT: 0,
  JWT_SECRET: 'test-secret-test-secret-test-secret',
  DATABASE_URL: 'pglite://memory',
  CORS_ORIGIN: '*',
  SEED_DEMO: true,
  LLM_PROVIDER: 'mock',
  GROQ_API_KEY: '',
  TELEGRAM_BOT_TOKEN: '',
};

/** Fresh in-process Postgres with migrations and the demo user, plus an app and Aziz's token. */
export async function setup() {
  const client = new PGlite();
  const pg = drizzle(client, { schema });
  await migrate(pg, { migrationsFolder: MIGRATIONS_DIR });
  const db = pg as unknown as Db;
  await resetDemo(db);
  const app = await buildApp({ db, config });
  const login = await app.inject({ method: 'POST', url: '/api/v1/auth/login', payload: { email: DEMO.email, password: DEMO.password } });
  const token = login.json<{ token: string }>().token;
  const call = async <T = unknown>(method: 'GET' | 'POST' | 'PUT' | 'PATCH', url: string, payload?: unknown) => {
    const res = await app.inject({ method, url: `/api/v1${url}`, payload: payload as object, headers: { authorization: `Bearer ${token}` } });
    return { status: res.statusCode, body: res.json<T>() };
  };
  return {
    db,
    app,
    call,
    close: async () => {
      await app.close();
      await client.close();
    },
  };
}
