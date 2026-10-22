#!/bin/bash
# Ensure the ghn web UI is running locally, starting it when down,
# then open it in the browser.
#
# - App already running  -> open http://localhost:<port>/ and exit.
# - App not running      -> install deps when stale, start the server in
#                           the background, wait until it answers, then open it.
# - App running but stale -> kill it first, rebuild, then launch the new
#                           version: a newer commit, changed dependencies,
#                           or a dev/prod mode switch stops the old server,
#                           clears the Next.js cache (dev) or rebuilds the
#                           bundle (prod), and starts a fresh server.
#
# This is the single canonical entrypoint owning those internals; thin
# launchers (e.g. Raycast scripts, Makefile targets) just call this file
# instead of reimplementing the checks.
#
# Usage: ensure-web.sh [--prod] [--port N] [--no-open] [--no-restart] [--help]

set -u

PORT="${PORT:-}"
WEB_PORT="${WEB_PORT:-}"
OPEN=1
RESTART=1
REBUILD=0
MODE="dev"

usage() {
  cat <<EOF
Usage: ensure-web.sh [options]

Ensure the ghn web UI is running locally, then open it.

Options:
  --prod           Start the production server (build + start) instead of dev.
  --port N         Listen on port N (default: per-workspace port, or \$PORT).
  --no-open        Ensure running, but do not open the browser.
  --no-restart     Never restart a running server; just open it even
                   when it predates the current checkout.
  -h, --help       Print this help and exit.

Behavior:
  1. When http://localhost:<port>/ answers and the server matches the
     checkout (same commit, fresh deps, same dev/prod mode), just open it.
  2. When the server answers but predates the checkout (newer commit,
     stale node_modules, or dev/prod mismatch), kill it, rebuild, then
     open the fresh server. Pass --no-restart to open a stale server
     as-is.
  3. Otherwise installs deps with bun when node_modules is stale,
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
    --no-restart) RESTART=0; shift ;;
    -h|--help) usage; exit 0 ;;
    *) echo "ensure-web.sh: unknown option: $1" >&2; usage >&2; exit 1 ;;
  esac
done

APP_DIR="$(cd "$(dirname "$0")/.." && pwd -P)"
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
STATE_FILE="$HOME/Library/Logs/ghn-web-server-${PORT}.state"

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

# PIDs listening on our port. Client connections (an open browser tab to
# the app) are not holders; only listeners can keep a new server from
# binding, and only listeners may ever be stopped below.
listener_pids() {
  lsof -nP -iTCP:"${PORT}" -sTCP:LISTEN -t 2>/dev/null | sort -u || true
}

deps_stale() {
  [ ! -d node_modules ] && return 0
  [ package.json -nt node_modules ] && return 0
  [ -f bun.lock ] && [ bun.lock -nt node_modules ] && return 0
  return 1
}

current_sha() {
  git rev-parse HEAD 2>/dev/null || echo "unknown"
}

# True when the process name looks like one of ours (node/bun/next),
# whether ps reports a bare name or a full binary path.
is_server_proc() {
  local comm="$1"
  comm="${comm##*/}"
  case "${comm}" in
    node*|next*|bun*) return 0 ;;
  esac
  return 1
}

# Best-effort guess of the mode the listening server runs in. Next.js
# executes start-server.js in dev and prod alike, so the listener's own
# command line says nothing; the answer sits further up the process
# tree (e.g. "bun --bun next dev -p <port>"). Prints "dev", "prod",
# or "unknown".
running_mode() {
  local pid cmd depth
  for pid in $(listener_pids); do
    [ -n "$pid" ] || continue
    depth=0
    while [ "$depth" -lt 5 ] && [ -n "$pid" ] && [ "$pid" != "1" ] && [ "$pid" != "0" ]; do
      cmd="$(ps -o command= -p "$pid" 2>/dev/null || true)"
      [ -z "$cmd" ] && break
      case "$cmd" in
        *"next start"*) echo "prod"; return 0 ;;
        *"next dev"*) echo "dev"; return 0 ;;
      esac
      pid="$(ps -o ppid= -p "$pid" 2>/dev/null | tr -d ' ' || true)"
      depth=$((depth + 1))
    done
  done
  echo "unknown"
}

state_field() {
  sed -n "s/^$1=//p" "$STATE_FILE" 2>/dev/null | head -n1
}

# Record what is serving this port so later runs can tell a stale server
# from a fresh one. Also adopts servers this script did not start: the
# next run then restarts them once the checkout moves on.
write_state() {
  printf 'SHA=%s\nMODE=%s\nAPP_DIR=%s\n' "$(current_sha)" "$MODE" "$APP_DIR" >"$STATE_FILE" 2>/dev/null || true
}

# Stop only listeners we own: node/bun processes whose working directory
# is this checkout. Anything else aborts so we never take down an
# unrelated service (or another workspace's server on an explicit --port).
# The whole supervisor chain comes down (next dev -> .bin/next ->
# start-server): killing only the listener leaves the supervisor alive to
# respawn it. The walk stops at the first ancestor outside the server
# tree, at pid 1, and at our own script, so a foreground server in the
# user's shell loses only its server processes, never the shell.
stop_server() {
  local pid comm pcwd cmd parent anc depth chain victims p
  victims=""
  for pid in $(listener_pids); do
    [ -n "$pid" ] || continue
    comm="$(ps -o comm= -p "$pid" 2>/dev/null || true)"
    if ! is_server_proc "$comm"; then
      echo "ensure-web.sh: port ${PORT} listened on by pid ${pid} (${comm:-unknown}), not a node/bun process; leaving it alone." >&2
      return 1
    fi
    pcwd="$(lsof -a -p "$pid" -d cwd -Fn 2>/dev/null | sed -n 's/^n//p' | head -n1)"
    if [ "${pcwd}" != "${APP_DIR}" ]; then
      echo "ensure-web.sh: server on port ${PORT} belongs to ${pcwd:-unknown}, not ${APP_DIR}; leaving it alone." >&2
      return 1
    fi
    chain="$pid"
    anc="$pid"
    depth=0
    while [ "$depth" -lt 5 ]; do
      parent="$(ps -o ppid= -p "$anc" 2>/dev/null | tr -d ' ' || true)"
      if [ -z "$parent" ] || [ "$parent" = "1" ] || [ "$parent" = "0" ] || [ "$parent" = "$$" ]; then
        break
      fi
      cmd="$(ps -o command= -p "$parent" 2>/dev/null || true)"
      case "$cmd" in
        *"next dev"*|*"next start"*|*start-server*|*.bin/next*) ;;
        *) break ;;
      esac
      pcwd="$(lsof -a -p "$parent" -d cwd -Fn 2>/dev/null | sed -n 's/^n//p' | head -n1)"
      if [ "${pcwd}" != "${APP_DIR}" ]; then
        echo "ensure-web.sh: server on port ${PORT} belongs to ${pcwd:-unknown}, not ${APP_DIR}; leaving it alone." >&2
        return 1
      fi
      chain="$parent $chain"
      anc="$parent"
      depth=$((depth + 1))
    done
    for p in $chain; do
      case " $victims " in
        *" $p "*) ;;
        *) victims="$victims $p" ;;
      esac
    done
  done
  for p in $victims; do
    kill "$p" 2>/dev/null || true
  done
  for _ in $(seq 1 10); do
    [ -z "$(listener_pids)" ] && break
    sleep 1
  done
  if [ -n "$(listener_pids)" ]; then
    echo "ensure-web.sh: port ${PORT} still held 10s after stop; leaving it alone." >&2
    return 1
  fi
  return 0
}

# Prints why the answering server no longer matches this checkout, or
# nothing when it is fresh.
stale_reason() {
  local sha state_sha state_mode state_dir detected
  sha="$(current_sha)"
  state_sha="$(state_field SHA)"
  state_mode="$(state_field MODE)"
  state_dir="$(state_field APP_DIR)"
  if [ -n "${state_dir}" ] && [ "${state_dir}" != "${APP_DIR}" ]; then
    echo "server on this port was started from ${state_dir}"
    return 0
  fi
  if [ -n "${state_sha}" ] && [ "${state_sha}" != "${sha}" ]; then
    echo "server started at ${state_sha} but checkout is at ${sha}"
    return 0
  fi
  if [ -n "${state_mode}" ] && [ "${state_mode}" != "${MODE}" ]; then
    echo "server runs in ${state_mode} mode but ${MODE} was requested"
    return 0
  fi
  if deps_stale; then
    echo "dependencies changed (package.json/bun.lock newer than node_modules)"
    return 0
  fi
  detected="$(running_mode)"
  if [ "${detected}" != "unknown" ] && [ "${detected}" != "${MODE}" ]; then
    echo "server runs in ${detected} mode but ${MODE} was requested"
    return 0
  fi
  if [ "${MODE}" = "prod" ] && { [ ! -f .next/BUILD_ID ] || [ package.json -nt .next/BUILD_ID ]; }; then
    echo "production bundle is missing or older than package.json"
    return 0
  fi
  return 1
}

# Fast path: running and fresh -> record state, just open it.
# Running but stale -> stop it below and fall through to the start flow.
if is_up; then
  REASON=""
  if [ "${RESTART}" -eq 1 ]; then
    REASON="$(stale_reason || true)"
  fi
  if [ -z "${REASON}" ]; then
    write_state
    [ "${OPEN}" -eq 1 ] && open_url
    exit 0
  fi
  echo "ensure-web.sh: ${REASON}; restarting" >&2
  if ! stop_server; then
    [ "${OPEN}" -eq 1 ] && open_url
    exit 1
  fi
  REBUILD=1
fi

# New version while the server was down: it still gets a clean rebuild
# on the way up. (After a restart above REBUILD is already set.)
if [ "${REBUILD}" -eq 0 ]; then
  PREV_SHA="$(state_field SHA)"
  if [ -n "${PREV_SHA}" ] && [ "${PREV_SHA}" != "$(current_sha)" ]; then
    REBUILD=1
  fi
fi

# The port answers nothing, but something else may hold it. Only listeners
# count here: an open browser tab to a dead server is not a holder. Only
# bun/node processes are ours; anything else aborts so we never take down
# an unrelated service.
if command -v lsof >/dev/null 2>&1; then
  PIDS="$(listener_pids)"
  if [ -n "${PIDS}" ]; then
    for pid in ${PIDS}; do
      comm="$(ps -o comm= -p "$pid" 2>/dev/null || true)"
      if is_server_proc "$comm"; then
        :
      else
        echo "ensure-web.sh: port ${PORT} held by pid ${pid} (${comm:-unknown}), not a node/bun process; leaving it alone." >&2
        [ "${OPEN}" -eq 1 ] && open_url
        exit 1
      fi
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
  # A no-op install leaves node_modules older than the manifests, which
  # would read as "stale deps" on every later run and restart the server
  # in a loop. Mark deps current once the install succeeds.
  [ -d node_modules ] && touch node_modules
fi

if [ "${MODE}" = "prod" ]; then
  echo "ensure-web.sh: building production bundle"
  bun run build || exit 1
elif [ "${REBUILD}" -eq 1 ] && [ -d .next ]; then
  # Dev compiles on demand, but a new version must not reuse the old
  # cache (stale chunks survive a plain restart). Clear it so the new
  # server builds the new version from scratch. The server is stopped
  # (or was down) at this point, so nothing holds .next open.
  echo "ensure-web.sh: clearing stale Next.js cache (.next) for a clean rebuild"
  rm -rf .next
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

write_state

if [ "${OPEN}" -eq 1 ]; then
  open_url
fi
exit 0
