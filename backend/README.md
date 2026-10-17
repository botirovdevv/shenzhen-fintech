# FeMate — backend

The API for the FeMate app (PLAN.md §11): Fastify 5, Drizzle ORM on PostgreSQL 16, zod, JWT.
Every money action goes through **Policy Guard** (`src/policy/policyGuard.ts`, the 9 checks of
PLAN.md §8, in order) and every outcome lands in the **audit log**.

```
src/
  app.ts, index.ts, config.ts   Fastify app factory, server start (runs migrations), env
  routes/                       /api/v1/* endpoints (auth, me, bank, transactions, summary, agent, permissions, audit, telegram)
  bot/                          Telegram bot (grammY): core.ts (logic), bot.ts (wiring), scheduler.ts (daily report + push)
  policy/                       policyGuard.ts (checks 1–9), actions.ts (pending / approve / reject / expire), limits.ts
  agent/                        agent.ts (loop, ≤ 5 tool calls), tools.ts, prompts.ts, recommendations.ts, llm/ (provider + mock)
  bank/                         mockBank.ts (sandbox accounts, atomic card → savings), expenses.ts
  rules/                        dailyAllowance.ts, whatIf.ts, categorize.ts, smsParser.ts — deterministic numbers
  audit/audit.ts                append-only log, card numbers masked
  db/                           schema.ts, migrations/, demo.ts (Aziz), seed.ts, migrate.ts
test/                           Vitest on PGlite (in-process Postgres, no server needed)
```

## Develop

Node 20+ and pnpm. Shared API types come from `../frontend/packages/shared` (`@femate/shared`).

```bash
cd backend
pnpm install
pnpm test          # 51 tests: rules, every Policy Guard check, demo scenario, agent loop, SMS parser, bot
pnpm typecheck
```

To run the server locally you need a Postgres. The simplest is the VM's, through an SSH tunnel:

```bash
ssh -i <key> -L 5433:127.0.0.1:5433 ubuntu@141.147.9.141   # keep open
cp .env.example .env    # set DATABASE_URL to the VM password (in ~/femate/backend/.env on the VM)
pnpm dev                # http://localhost:3000/api/v1/health
```

After changing `src/db/schema.ts`: `pnpm db:generate --name <change>` and commit the new migration.
The server applies pending migrations on start.

## Deploy (VM)

```bash
backend/scripts/deploy.sh
```

This syncs `backend/` and `frontend/packages/shared` to `~/femate` on the VM, builds the image
there (arm64), and runs `docker compose up -d` (`femate-db` Postgres, `femate-api`, `femate-tunnel`).
It waits for `/health`. The first run creates `~/femate/backend/.env` with random `JWT_SECRET` and
`POSTGRES_PASSWORD`; `TUNNEL_TOKEN` and `TELEGRAM_BOT_TOKEN` were added to it by hand.
Both ports are bound to 127.0.0.1 only: the API on **3100**, Postgres on **5433**.

**Public URL: https://femate-api.usm0n.uz/api/v1** through the Cloudflare tunnel `femate`
(its own `cloudflared` container; the route `femate-api.usm0n.uz → http://api:3000` lives in the
Cloudflare dashboard under Networking → Tunnels → femate → Routes).

- Reset the demo user (aziz@femate.uz / demo1234): `ssh … 'docker exec femate-api node_modules/.bin/tsx src/db/seed.ts'`
- Logs: `ssh … 'cd ~/femate/backend && docker compose logs -f api'`
- Try the app against it: set `EXPO_PUBLIC_API_URL=https://femate-api.usm0n.uz/api/v1` in `frontend/apps/mobile/.env`.

## Telegram bot

[@femate_uz_bot](https://t.me/femate_uz_bot) runs inside the API process (long polling) when
`TELEGRAM_BOT_TOKEN` is set.

- Link: the app's Settings → Telegram bot → Get a link code → `/start 123456` (or the Open in Telegram
  button). Codes live 10 minutes; 5 tries per chat per 10 minutes.
- Text like `taxi 20000` / `osh 35 ming` adds an expense. A forwarded Uzcard / Humo SMS is parsed
  (`rules/smsParser.ts`) and added from the card with `source: 'sms_forward'`.
- `/today` sends the report. At each user's `report_time` the scheduler sends it to Telegram (and
  as an Expo push if the app registered a token). At L2 it proposes moving today's unspent allowance
  to savings with ✅ Approve / ❌ Reject buttons; at L3 it is done within limits; below L2 nothing.
- The bot can't move money from typed text. Only the Approve button can, and approval re-runs
  Policy Guard like the app does.

## Not yet (pass 2)

- Groq speech-to-text: `/transactions/voice` answers 503 `STT_UNAVAILABLE` until then
- Anomaly alerts
- Claude provider: `LLM_PROVIDER=mock` is the only one so far
