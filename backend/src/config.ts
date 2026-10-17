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
  // FeMate virtual card. Empty key = card off (GET /card answers available: false).
  LITHIC_API_KEY: z.string().default(''),
  LITHIC_ENV: z.enum(['sandbox', 'production']).default('sandbox'),
  // ASA HMAC secret (scripts/lithic-setup.ts prints it). Required in production; sandbox accepts unsigned requests without it.
  LITHIC_ASA_SECRET: z.string().default(''),
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
