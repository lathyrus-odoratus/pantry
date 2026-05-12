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

echo "==> verifying /health"
ssh wisp 'curl -fsS http://127.0.0.1:8081/health' && echo
