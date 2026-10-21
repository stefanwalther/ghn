#!/usr/bin/env bash
# Production-server entrypoint with per-workspace port allocation.
# Mirrors dev.sh for `next start`.
set -euo pipefail
cd "$(dirname "$0")/.."
runtime_exports="$(./scripts/resolve-dev-runtime.sh)" || {
  echo "ghn start: failed to resolve a free port (range exhausted or git lookup failed)." >&2
  exit 1
}
eval "$runtime_exports"
echo "ghn start on http://localhost:${PORT} (slot ${GHN_PORT_SLOT}, base ${GHN_PORT_SLOT_BASE})" >&2
exec bun --bun next start -p "$PORT" "$@"
