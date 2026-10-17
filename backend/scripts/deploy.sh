#!/usr/bin/env bash
# Deploy the API to the VM: sync sources, build there (arm64), restart, wait for /health.
# First run also creates ~/femate/backend/.env with random secrets.
# Usage: backend/scripts/deploy.sh      (env: FEMATE_HOST, FEMATE_SSH_KEY)
set -euo pipefail

HOST="${FEMATE_HOST:-ubuntu@141.147.9.141}"
KEY="${FEMATE_SSH_KEY:-$HOME/Library/Mobile Documents/com~apple~CloudDocs/Documents/ssh-key/ssh-key-mysafeplace.key}"
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"

sync() { rsync -az --delete --exclude node_modules --exclude .env -e "ssh -i '$KEY'" "$ROOT/$1/" "$HOST:femate/$1/"; }
ssh -i "$KEY" "$HOST" 'mkdir -p ~/femate/backend ~/femate/frontend/packages/shared'
sync backend
sync frontend/packages/shared

ssh -i "$KEY" "$HOST" bash -s <<'REMOTE'
set -euo pipefail
cd ~/femate/backend
if [ ! -f .env ]; then
  umask 077
  cat > .env <<ENV
JWT_SECRET=$(openssl rand -hex 32)
POSTGRES_PASSWORD=$(openssl rand -hex 24)
CORS_ORIGIN=*
SEED_DEMO=true
LLM_PROVIDER=mock
GROQ_API_KEY=
ENV
  echo "Created ~/femate/backend/.env"
fi
docker compose up -d --build
for _ in $(seq 1 40); do
  if curl -fsS http://127.0.0.1:3100/api/v1/health; then echo; echo "✓ FeMate API is up on 127.0.0.1:3100"; exit 0; fi
  sleep 2
done
docker compose logs --tail 50 api
exit 1
REMOTE
