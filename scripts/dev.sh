#!/usr/bin/env bash
# Dev-server entrypoint with per-workspace port allocation.
# Resolves a collision-free port via resolve-dev-runtime.sh, then execs
# `next dev`. Explicit PORT/WEB_PORT in the environment is respected.
set -euo pipefail
cd "$(dirname "$0")/.."
runtime_exports="$(./scripts/resolve-dev-runtime.sh)" || {
  echo "ghn dev: failed to resolve a free port (range exhausted or git lookup failed)." >&2
  exit 1
}
eval "$runtime_exports"
echo "ghn dev on http://localhost:${PORT} (slot ${GHN_PORT_SLOT}, base ${GHN_PORT_SLOT_BASE})" >&2
exec bun --bun next dev -p "$PORT" "$@"
