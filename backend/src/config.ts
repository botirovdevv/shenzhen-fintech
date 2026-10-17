// Environment, validated once at startup (PLAN.md §17).
import { z } from 'zod';

const schema = z.object({
  PORT: z.coerce.number().int().default(3000),
  JWT_SECRET: z.string().min(16, 'JWT_SECRET must be at least 16 characters'),
  DATABASE_URL: z.string().min(1),
  CORS_ORIGIN: z.string().default('*'),
  SEED_DEMO: z
    .enum(['true', 'false'])
    .default('false')
    .transform((v) => v === 'true'),
  LLM_PROVIDER: z.enum(['mock']).default('mock'),
  GROQ_API_KEY: z.string().default(''),
  TELEGRAM_BOT_TOKEN: z.string().default(''),
});

export type Config = z.infer<typeof schema>;

export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const parsed = schema.safeParse(env);
  if (!parsed.success) {
    const issues = parsed.error.issues.map((i) => `  ${i.path.join('.')}: ${i.message}`).join('\n');
    throw new Error(`Invalid environment:\n${issues}`);
  }
  return parsed.data;
}
