#!/bin/bash
# Ensure the ghn web UI is running locally, starting it when down,
# then open it in the browser.
#
# - App already running  -> open http://localhost:<port>/ and exit.
# - App not running      -> install deps when stale, start the server in
#                           the background, wait until it answers, then open it.
#
# This is the single canonical entrypoint owning those internals; thin
# launchers (e.g. Raycast scripts, Makefile targets) just call this file
# instead of reimplementing the checks.
#
# Usage: ensure-web.sh [--prod] [--port N] [--no-open] [--help]

set -u

PORT="${PORT:-}"
WEB_PORT="${WEB_PORT:-}"
OPEN=1
MODE="dev"

usage() {
  cat <<EOF
Usage: ensure-web.sh [options]

Ensure the ghn web UI is running locally, then open it.

Options:
  --prod           Start the production server (build + start) instead of dev.
  --port N         Listen on port N (default: per-workspace port, or \$PORT).
  --no-open        Ensure running, but do not open the browser.
  -h, --help       Print this help and exit.

Behavior:
  1. When http://localhost:<port>/ answers, just open it.
  2. Otherwise installs deps with bun when node_modules is stale,
     starts the server in the background (dev by default), waits
     until it answers, then opens it.

Port allocation (bg-style):
  Each checkout resolves a stable per-workspace port via
  scripts/resolve-dev-runtime.sh (range 21120-21219, slot 0 reserved
  for non-worktree checkouts). Explicit --port or PORT/WEB_PORT wins.

Examples:
  scripts/ensure-web.sh
  scripts/ensure-web.sh --prod
  PORT=21121 scripts/ensure-web.sh --no-open
EOF
}

PORT_FROM_CLI=""
while [ $# -gt 0 ]; do
  case "$1" in
    --prod) MODE="prod"; shift ;;
    --port) PORT_FROM_CLI="${2:?--port needs a value}"; shift 2 ;;
    --port=*) PORT_FROM_CLI="${1#--port=}"; shift ;;
    --no-open) OPEN=0; shift ;;
    -h|--help) usage; exit 0 ;;
    *) echo "ensure-web.sh: unknown option: $1" >&2; usage >&2; exit 1 ;;
  esac
done

APP_DIR="$(cd "$(dirname "$0")/.." && pwd)"
cd "${APP_DIR}" || exit 1

# Explicit --port wins over the environment; the resolver respects either.
if [ -n "${PORT_FROM_CLI}" ]; then
  PORT="${PORT_FROM_CLI}"
  WEB_PORT="${PORT_FROM_CLI}"
  export PORT WEB_PORT
else
  # Re-export only when set so the resolver can tell "explicit" from "auto".
  if [ -n "${PORT}" ]; then export PORT; fi
  if [ -n "${WEB_PORT}" ]; then export WEB_PORT; fi
fi

# Resolve the per-workspace port (bg-style). Fails when the slot range is
# exhausted so concurrent sessions never silently share a port.
runtime_exports="$(./scripts/resolve-dev-runtime.sh)" || {
  echo "ensure-web.sh: failed to resolve a free port (range exhausted or git lookup failed)." >&2
  exit 1
}
eval "${runtime_exports}"
PORT="${WEB_PORT}"
export PORT

case "$PORT" in
  ''|*[!0-9]*) echo "ensure-web.sh: invalid port: $PORT" >&2; exit 1 ;;
esac

URL="http://localhost:${PORT}/"
LOG_FILE="$HOME/Library/Logs/ghn-web-server-${PORT}.log"

open_url() {
  if command -v open >/dev/null 2>&1; then
    open "${URL}"
  elif command -v xdg-open >/dev/null 2>&1; then
    xdg-open "${URL}"
  else
    echo "ensure-web.sh: no opener found (open/xdg-open); server is at ${URL}" >&2
    exit 1
  fi
}

is_up() {
  curl -sf -o /dev/null --max-time 2 "${URL}" 2>/dev/null
}

# Fast path: already running -> just open it.
if is_up; then
  [ "${OPEN}" -eq 1 ] && open_url
  exit 0
fi

# The port answers nothing, but something else may hold it. Only bun/node
# processes are ours; anything else aborts so we never take down an
# unrelated service.
if command -v lsof >/dev/null 2>&1; then
  PIDS="$(lsof -ti "tcp:${PORT}" 2>/dev/null || true)"
  if [ -n "${PIDS}" ]; then
    for pid in ${PIDS}; do
      comm="$(ps -o comm= -p "$pid" 2>/dev/null || true)"
      case "${comm}" in
        node*|next*|bun*)
          ;;
        *)
          echo "ensure-web.sh: port ${PORT} held by pid ${pid} (${comm:-unknown}), not a node/bun process; leaving it alone." >&2
          [ "${OPEN}" -eq 1 ] && open_url
          exit 1
          ;;
      esac
    done
  fi
fi

if ! command -v bun >/dev/null 2>&1; then
  echo "ensure-web.sh: bun is not on PATH" >&2
  exit 1
fi

cd "${APP_DIR}" || exit 1

if [ ! -d node_modules ] || [ package.json -nt node_modules ] || { [ -f bun.lock ] && [ bun.lock -nt node_modules ]; }; then
  echo "ensure-web.sh: installing dependencies (bun install)"
  bun install || exit 1
fi

if [ "${MODE}" = "prod" ]; then
  echo "ensure-web.sh: building production bundle"
  bun run build || exit 1
fi

mkdir -p "$(dirname "$LOG_FILE")"
if [ "${MODE}" = "prod" ]; then
  echo "ensure-web.sh: starting production server on port ${PORT} (log: ${LOG_FILE})"
  nohup bun --bun next start -p "$PORT" >"$LOG_FILE" 2>&1 &
else
  echo "ensure-web.sh: starting dev server on port ${PORT} (log: ${LOG_FILE})"
  nohup bun --bun next dev -p "$PORT" >"$LOG_FILE" 2>&1 &
fi

for _ in $(seq 1 60); do
  if is_up; then
    break
  fi
  sleep 1
done

if ! is_up; then
  echo "ensure-web.sh: server did not answer at ${URL} within 60s - see ${LOG_FILE}" >&2
  exit 1
fi

if [ "${OPEN}" -eq 1 ]; then
  open_url
fi
exit 0
