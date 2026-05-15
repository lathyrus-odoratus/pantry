#!/usr/bin/env bash
set -euo pipefail

# Announce a pending backend restart to a pantry room, wait, then deploy.
# Usage:
#   ./scripts/deploy-with-notice.sh <room> [delay-seconds]
#   pnpm deploy:with-notice <room> [delay-seconds]
#
# TODO(noracami): decide when notice should fire vs. plain `pnpm deploy`.
# Open questions:
#   - default-on for any deploy, or only when ≥ N online / world active?
#   - per-room loop when multiple rooms are populated?
#   - hook into deploy.sh as a pre-step instead of a separate script?
# Memory rule "always announce before redeploy" was removed on 2026-05-16
# pending this decision.

ROOM="${1:-}"
DELAY="${2:-30}"

if [ -z "$ROOM" ]; then
  echo "usage: $0 <room> [delay-seconds]" >&2
  exit 2
fi

REPO_ROOT="$(git rev-parse --show-toplevel)"
cd "$REPO_ROOT"

echo "==> announcing redeploy to room \"$ROOM\" (restart in ${DELAY}s)"
ssh wisp "docker exec -i -e PANTRY_ROOM='$ROOM' -e PANTRY_DELAY='$DELAY' pantry-backend node --input-type=module" <<'NODE'
const res = await fetch('http://127.0.0.1:8080/admin/broadcast', {
  method: 'POST',
  headers: {
    'x-admin-key': process.env.ADMIN_KEY,
    'content-type': 'application/json',
  },
  body: JSON.stringify({
    room: process.env.PANTRY_ROOM,
    body: `服務即將更新，約 ${process.env.PANTRY_DELAY}s 後重啟（你會看到斷線重連）`,
  }),
});
if (res.status !== 204) {
  console.error('announce failed:', res.status, await res.text());
  process.exit(1);
}
console.log('announce ok');
NODE

echo "==> waiting ${DELAY}s..."
sleep "$DELAY"

exec "$REPO_ROOT/scripts/deploy.sh"
