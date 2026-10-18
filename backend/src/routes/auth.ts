import type { AuthResponse } from '@femate/shared';
import bcrypt from 'bcryptjs';
import { eq } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';

import { audit } from '../audit/audit';
import { permissions, users } from '../db/schema';
import { ApiError } from '../lib/errors';
import { newId } from '../lib/ids';
import { toUser } from '../lib/serialize';
import { parse } from '../lib/validate';

const email = z.string().trim().toLowerCase().pipe(z.email('Enter a valid email.'));
const registerBody = z.object({
  email,
  password: z.string().min(6, 'Use a password of at least 6 characters.').max(200),
  name: z.string().trim().min(1, 'Enter your name.').max(80),
});
const loginBody = z.object({ email, password: z.string().min(1, 'Enter your password.') });

export async function authRoutes(app: FastifyInstance) {
  const { db } = app;
  const authLimit = { rateLimit: { max: 10, timeWindow: '1 minute' } };

  app.post('/auth/register', { config: authLimit }, async (req, reply): Promise<AuthResponse> => {
    const b = parse(registerBody, req.body);
    const [taken] = await db.select({ id: users.id }).from(users).where(eq(users.email, b.email));
    if (taken) throw new ApiError(409, 'EMAIL_TAKEN', 'An account with this email already exists. Sign in instead.');
    const id = newId('usr');
    const passwordHash = await bcrypt.hash(b.password, 10);
    const [u] = await db
      .insert(users)
      .values({ id, email: b.email, name: b.name, passwordHash })
      .onConflictDoNothing({ target: users.email })
      .returning();
    // Two sign-ups with the same email at once: the second one lands here.
    if (!u) throw new ApiError(409, 'EMAIL_TAKEN', 'An account with this email already exists. Sign in instead.');
    // Until the bank is connected the agent can only read (L0) and has no scopes.
    await db.insert(permissions).values({ userId: id });
    await audit(db, id, { actor: 'user', event: 'auth.register', decision: 'info', reason: 'Account created. Agent starts at L0 (read-only).', level: 'L0' });
    reply.status(201);
    return { token: app.jwt.sign({ sub: id }), user: toUser(u) };
  });

  app.post('/auth/login', { config: authLimit }, async (req): Promise<AuthResponse> => {
    const b = parse(loginBody, req.body);
    const [u] = await db.select().from(users).where(eq(users.email, b.email));
    if (!u || !(await bcrypt.compare(b.password, u.passwordHash)))
      throw new ApiError(401, 'INVALID_CREDENTIALS', 'Wrong email or password.');
    return { token: app.jwt.sign({ sub: u.id }), user: toUser(u) };
  });
}
