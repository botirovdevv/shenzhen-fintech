# FeMate — frontend

AI personal-finance agent for the 2026 Shenzhen International FinTechathon (Track A). FeMate tracks
spending, gives concrete savings advice and moves money **only with the user's permission**
(permission levels L0–L3, Policy Guard, kill switch, audit log). Full spec: [PLAN.md](../PLAN.md).

## Repository layout

```
apps/mobile       Expo (SDK 57) app, expo-router, TypeScript
packages/shared   API types shared by the app, API and bot
```

## Run the mobile app

Requirements: Node 22+, pnpm, the **Expo Go** app on your phone (same Wi-Fi as the computer).
Run every command below from this `frontend/` folder.

```bash
pnpm install
pnpm dev:mobile          # then scan the QR code with Expo Go
pnpm dev:mobile:tunnel   # if the phone can't reach your computer on the LAN
pnpm typecheck
pnpm lint
pnpm test                # Vitest: formatting, categorizer, policy rules of the mock API
pnpm build:web           # static web build in apps/mobile/dist, pointed at the API in apps/mobile/.env
```

Android APK: `cd apps/mobile && npx eas-cli@latest build -p android --profile preview` (needs an Expo
account). Server push notifications need that build too; in Expo Go the app schedules a local daily
report reminder instead.

`apps/mobile/.env` points the app at the live API (`https://femate-api.usm0n.uz/api/v1`); the EAS build profiles in
`eas.json` set the same URL. For a local backend put `EXPO_PUBLIC_API_URL=http://<your-ip>:3000/api/v1` in
`apps/mobile/.env.development.local` (read first by `expo start`, ignored by git). Without any
`EXPO_PUBLIC_API_URL` the app runs on a built-in mock API seeded with the demo user (aziz@femate.uz / demo1234);
Settings then says *demo data (no server)*.
