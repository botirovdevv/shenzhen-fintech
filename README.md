# FeMate

AI personal-finance agent for the 2026 Shenzhen International FinTechathon (Track A). FeMate tracks
spending, gives concrete savings advice and moves money **only with the user's permission**
(permission levels L0–L3, Policy Guard, kill switch, audit log).

| Folder | What |
|---|---|
| [`frontend/`](frontend/) | Mobile app (Expo SDK 57, React Native, TypeScript) and shared API types — see [frontend/README.md](frontend/README.md) |
| [`backend/`](backend/) | API (Fastify 5, Postgres, Policy Guard, agent) — see [backend/README.md](backend/README.md). Telegram bot next |
| [`PLAN.md`](PLAN.md) | Full spec, stages and team plan |

Try it: web build at https://femate.expo.app (demo account inside the app).
