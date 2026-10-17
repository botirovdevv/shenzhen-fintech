# Build context is the repo root (the API links ../frontend/packages/shared).
FROM node:22-alpine
RUN corepack enable
WORKDIR /app/frontend/packages/shared
COPY frontend/packages/shared/ ./
WORKDIR /app/backend
COPY backend/package.json backend/pnpm-lock.yaml backend/pnpm-workspace.yaml ./
RUN CI=true pnpm install --frozen-lockfile --prod
COPY backend/ ./
ENV NODE_ENV=production
USER node
EXPOSE 3000
CMD ["node_modules/.bin/tsx", "src/index.ts"]
