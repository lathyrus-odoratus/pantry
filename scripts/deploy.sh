#!/usr/bin/env bash
set -euo pipefail

# Sync local source to wisp and rebuild + restart pantry-backend.
# Run from anywhere inside the repo:
#   ./scripts/deploy.sh

REPO_ROOT="$(git rev-parse --show-toplevel)"
cd "$REPO_ROOT"

echo "==> rsync source to wisp:/opt/pantry"
rsync -avz --delete \
  --exclude='.env' \
  --exclude='.env.*' \
  --exclude='node_modules' \
  --exclude='**/node_modules' \
  --exclude='dist' \
  --exclude='**/dist' \
  --exclude='.git' \
  --exclude='.DS_Store' \
  --exclude='coverage' \
  ./ wisp:/opt/pantry/

echo "==> docker compose up -d --build on wisp"
ssh wisp '
  set -euo pipefail
  cd /opt/pantry
  docker compose up -d --build
  docker compose ps
'

echo "==> verifying /health (waits for container health: starting → healthy)"
ssh wisp '
  set -euo pipefail
  for i in $(seq 1 30); do
    if curl -fsS http://127.0.0.1:8081/health; then
      echo
      exit 0
    fi
    sleep 1
  done
  echo "health check timed out after 30s" >&2
  exit 1
'
