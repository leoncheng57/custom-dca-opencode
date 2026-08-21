#!/usr/bin/env bash
# One-command local dev: BFF (tsx watch) + Vite UI, both on the host.
#
# Unlike the predecessor there is no `docker compose` step — `opencode serve`
# is a plain process you supervise yourself (see deploy/ai.opencode.serve.plist).
# This script does not start it; it checks that it is reachable and tells you
# what to do if it isn't.
set -euo pipefail

cd "$(dirname "$0")/.."

[ -f .env ] && set -a && . ./.env && set +a

OPENCODE_URL="${OPENCODE_URL:-http://127.0.0.1:4096}"
PORT="${PORT:-3000}"

auth=()
if [ -n "${OPENCODE_SERVER_PASSWORD:-}" ]; then
  auth=(--user "${OPENCODE_SERVER_USERNAME:-opencode}:${OPENCODE_SERVER_PASSWORD}")
fi

echo "→ checking opencode server at ${OPENCODE_URL}"
if ! health=$(curl -fsS --max-time 5 "${auth[@]}" "${OPENCODE_URL}/global/health" 2>/dev/null); then
  cat >&2 <<EOF

✗ Cannot reach an opencode server at ${OPENCODE_URL}

  Start one:      opencode serve --hostname 127.0.0.1 --port 4096
  Or install the launchd unit:
                  cp deploy/ai.opencode.serve.plist ~/Library/LaunchAgents/
                  launchctl load ~/Library/LaunchAgents/ai.opencode.serve.plist

  If it is running with a password, set OPENCODE_SERVER_PASSWORD in .env.
EOF
  exit 1
fi
echo "  ✓ ${health}"

# Warn early on version skew — it is the first thing to suspect when a
# response shape looks wrong.
expected=$(grep -oE 'EXPECTED_SERVER_VERSION = "[^"]+"' server/opencode/client.ts | grep -oE '[0-9]+\.[0-9]+\.[0-9]+' || true)
actual=$(printf '%s' "$health" | grep -oE '"version":"[^"]+"' | cut -d'"' -f4 || true)
if [ -n "$expected" ] && [ -n "$actual" ] && [ "$expected" != "$actual" ]; then
  echo "  ! version skew: server ${actual}, client pinned to ${expected}" >&2
fi

cleanup() { jobs -p | xargs -r kill 2>/dev/null || true; }
trap cleanup EXIT INT TERM

echo "→ BFF   :${PORT}"
PORT="$PORT" npx tsx watch server/index.ts &

echo "→ UI    :5173"
npx vite &

wait
