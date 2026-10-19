# FeMate — an AI money co-pilot that acts only with your permission

FeMate is an AI personal-finance agent for the **2026 Shenzhen International FinTechathon, Track A (Personal Finance)**,
theme *"AI as a Financial Participant"*. It collects your spending (card, typed or spoken notes, forwarded bank SMS),
tells you exactly how much you can still spend today, gives savings advice with real numbers — and moves the money you
saved into Savings **only within the permission level and limits you set**.

> The language model only proposes. Plain code (**Policy Guard**) checks every money action in 9 fixed steps, a human
> approves at Co-pilot level, a kill switch stops everything in one tap, and every decision lands in an audit log.

## Try it

| | |
|---|---|
| **Android app** | [Download the APK](https://github.com/botirovdevv/shenzhen-fintech/releases/download/v1.0.0/shenzhen-fintech-v1.0.0.apk) (v1.0.0, 27.7 MB — [all releases](https://github.com/botirovdevv/shenzhen-fintech/releases)); allow installs from unknown sources |
| **Demo account** | `aziz@femate.uz` / `demo1234` — or tap **Use demo account** on the sign-in screen |
| **Live API** | https://femate-api.usm0n.uz/api/v1/health |
| **Telegram bot** | [@femate_uz_bot](https://t.me/femate_uz_bot) — link it in the app: Settings → Telegram bot → Get a link code |

### A 5-minute walkthrough

1. **Today** — the daily limit (93 548 UZS for Aziz) and what is left, where the money went this month.
2. **Add** — type `taxi 20k` or tap the microphone and say "Groceries forty five thousand"; FeMate shows what it
   understood, then saves it.
3. **Assistant** — the bus tip (*save 240 000 UZS a month*) → **Apply**; ask *"Move today's savings"* → a pending
   action → **Approve** → the money moves Card → Savings.
4. Ask *"Move 500 000 to savings"* → blocked with `PER_ACTION_LIMIT`.
5. **Agent** — **Stop the agent now** (kill switch); the next request is blocked with `KILL_SWITCH_ACTIVE`.
   The audit log shows every step; **Export JSON** downloads it.

## Documents

| | |
|---|---|
| [docs/technical.md](docs/technical.md) | Architecture, algorithms (Rules Engine formulas), agent and LLM design, API, tests |
| [docs/security.md](docs/security.md) | Permission levels, Policy Guard, kill switch, prompt-injection defence, audit log, risk table |
| [docs/proof/](docs/proof/) | Audit-log export and full request/response log of the demo run on the live API |
| [PLAN.md](PLAN.md) | Team plan and spec (Uzbek) |

## Repository

| Folder | What |
|---|---|
| [`frontend/`](frontend/) | Mobile app (Expo SDK 57, React Native, TypeScript) in `apps/mobile`, shared API types and categorizer in `packages/shared` — see [frontend/README.md](frontend/README.md) |
| [`backend/`](backend/) | API, agent, Policy Guard, Telegram bot, scheduler, virtual card (Fastify 5, PostgreSQL 16, Drizzle) — see [backend/README.md](backend/README.md) |
| [`docs/`](docs/) | Submission documents and proof of work |

## Run it locally

Requirements: **Node 22+**, **pnpm**, and for the API a **PostgreSQL 16** (Docker is the easiest).

```bash
# 1. API
cd backend
pnpm install
docker run -d --name femate-pg -p 5433:5432 \
  -e POSTGRES_USER=femate -e POSTGRES_PASSWORD=femate -e POSTGRES_DB=femate postgres:16
cp .env.example .env          # works as is: mock LLM, demo user seeded on start
pnpm dev                      # http://localhost:3000/api/v1/health → {"ok":true}

# 2. App (another terminal)
cd frontend
pnpm install
echo "EXPO_PUBLIC_API_URL=http://<your-computer-ip>:3000/api/v1" > apps/mobile/.env.development.local
pnpm dev:mobile               # scan the QR code with Expo Go, or press w for the web
```

With no `EXPO_PUBLIC_API_URL` at all, the app runs on a built-in mock API (labelled *demo data* in Settings).
Optional keys in `backend/.env`: `LLM_PROVIDER=openai` + `OPENAI_API_KEY` (real agent), `GROQ_API_KEY` (voice),
`TELEGRAM_BOT_TOKEN` (bot), `LITHIC_API_KEY` (virtual card).

## Tests

```bash
cd backend  && pnpm typecheck && pnpm test                 # 92 tests on an in-process Postgres (PGlite)
cd frontend && pnpm typecheck && pnpm lint && pnpm test    # 36 tests
```

## Deploy

- **API + bot:** `backend/scripts/deploy.sh` (Docker Compose on the VM, Cloudflare tunnel) — details in
  [backend/README.md](backend/README.md#deploy-vm).
- **Android APK:** `cd frontend/apps/mobile && eas build -p android --profile preview`.
- **Web:** `cd frontend && pnpm build:web` → static files in `apps/mobile/dist`.
