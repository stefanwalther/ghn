#!/usr/bin/env bash
#
# Resolve a per-workspace dev-server port so concurrent sessions (T3
# worktrees, conductor workspaces, plain checkouts) do not collide.
#
# Modelled on bg's scripts/resolve-dev-runtime.sh, trimmed to ghn's needs:
# ghn serves a single Next.js port (no Postgres/Garage/pgweb slots) and
# stores state in a per-worktree sqlite file, so one port per slot is enough.
#
# Slots: range 21120-21219 (100 ports, SLOT_SIZE=1). Slot 0 (21120) is
# reserved for non-worktree checkouts (the main repo). Worktrees hash
# workspace_root to a stable preferred slot and take the first free one.
#
# Usage:
#   eval "$(./scripts/resolve-dev-runtime.sh)"   # exports PORT/WEB_PORT/...
#   ./scripts/resolve-dev-runtime.sh --port-only # prints just the port number
#
# Explicit override: when PORT or WEB_PORT is already set in the environment
# (or passed via ensure-web.sh --port), the resolver keeps it and reports
# GHN_PORT_SLOT=manual. This preserves `PORT=21121 make web-dev`.
#
# Config (env overrides):
#   GHN_PORT_RANGE_START (default 21120)
#   GHN_PORT_RANGE_END   (default 21219)
#   GHN_PORT_SLOT_SIZE   (default 1)
#   GHN_PORT_RESERVED_NON_WORKTREE_PORTS (default 1, must divide SLOT_SIZE)

set -euo pipefail

MODE="full"
if [[ "${1:-}" == "--port-only" ]]; then
  MODE="port-only"
fi

PROJECT_NAME="ghn"

RANGE_START="${GHN_PORT_RANGE_START:-21120}"
RANGE_END="${GHN_PORT_RANGE_END:-21219}"
SLOT_SIZE="${GHN_PORT_SLOT_SIZE:-1}"
RESERVED_NON_WORKTREE_PORTS="${GHN_PORT_RESERVED_NON_WORKTREE_PORTS:-1}"

WEB_OFFSET="${GHN_PORT_OFFSET_WEB:-0}"

if (( RANGE_END < RANGE_START )); then
  echo "Invalid port range: GHN_PORT_RANGE_START must be <= GHN_PORT_RANGE_END" >&2
  exit 1
fi

if (( SLOT_SIZE <= 0 )); then
  echo "Invalid slot size: GHN_PORT_SLOT_SIZE must be > 0" >&2
  exit 1
fi

if (( RESERVED_NON_WORKTREE_PORTS <= 0 )) || (( RESERVED_NON_WORKTREE_PORTS % SLOT_SIZE != 0 )); then
  echo "Invalid reservation: GHN_PORT_RESERVED_NON_WORKTREE_PORTS must be > 0 and divisible by GHN_PORT_SLOT_SIZE" >&2
  exit 1
fi

if (( WEB_OFFSET < 0 )) || (( WEB_OFFSET >= SLOT_SIZE )); then
  echo "Invalid port offset ${WEB_OFFSET}: offsets must be within [0, ${SLOT_SIZE})" >&2
  exit 1
fi

TOTAL_PORTS=$((RANGE_END - RANGE_START + 1))
if (( TOTAL_PORTS % SLOT_SIZE != 0 )); then
  echo "Invalid range: total ports (${TOTAL_PORTS}) must be divisible by slot size (${SLOT_SIZE})" >&2
  exit 1
fi

TOTAL_SLOTS=$((TOTAL_PORTS / SLOT_SIZE))
RESERVED_NON_WORKTREE_SLOTS=$((RESERVED_NON_WORKTREE_PORTS / SLOT_SIZE))
if (( TOTAL_SLOTS <= RESERVED_NON_WORKTREE_SLOTS )); then
  echo "Invalid configuration: no slots left for worktrees" >&2
  exit 1
fi

WORKTREE_SLOT_COUNT=$((TOTAL_SLOTS - RESERVED_NON_WORKTREE_SLOTS))

emit_export() {
  local key="$1"
  local value="$2"
  printf 'export %s=%q\n' "$key" "$value"
}

hash_hex() {
  local input="$1"
  local width="$2"

  if command -v shasum >/dev/null 2>&1; then
    printf '%s' "$input" | shasum | cut -c1-"$width"
    return
  fi

  if command -v sha1sum >/dev/null 2>&1; then
    printf '%s' "$input" | sha1sum | cut -c1-"$width"
    return
  fi

  echo "Neither shasum nor sha1sum is available; cannot compute deterministic slot hash." >&2
  exit 1
}

port_is_free() {
  local port="$1"

  if command -v lsof >/dev/null 2>&1; then
    ! lsof -nP -iTCP:"$port" -sTCP:LISTEN >/dev/null 2>&1
    return
  fi

  if command -v nc >/dev/null 2>&1; then
    ! nc -z 127.0.0.1 "$port" >/dev/null 2>&1
    return
  fi

  ! (echo >"/dev/tcp/127.0.0.1/$port") >/dev/null 2>&1
}

# A port occupied only by processes whose cwd is this workspace counts as
# ours (dev server already running here) and is reusable. Anything held from
# outside this workspace is a real collision.
port_owned_by_workspace() {
  local port="$1"
  local workspace_root="$2"

  if ! command -v lsof >/dev/null 2>&1; then
    return 1
  fi

  local holders
  # LISTEN-only: established client connections (e.g. an open browser tab
  # pointed at the dev server) must not mark the slot as foreign. Without
  # the LISTEN filter a running server plus an open tab reads as "held by
  # someone else" and the resolver wrongly reports the range exhausted.
  holders="$(lsof -nP -iTCP:"${port}" -sTCP:LISTEN -t 2>/dev/null | sort -u || true)"
  if [[ -z "$holders" ]]; then
    return 1
  fi

  local pid
  local process_cwd
  while IFS= read -r pid; do
    [[ -n "$pid" ]] || continue
    process_cwd="$(lsof -a -p "$pid" -d cwd -Fn 2>/dev/null | sed -n 's/^n//p' | head -n1)"
    if [[ "$process_cwd" != "$workspace_root" ]]; then
      return 1
    fi
  done <<< "$holders"

  return 0
}

slot_is_free_or_owned() {
  local slot="$1"
  local workspace_root="$2"
  local base_port=$((RANGE_START + (slot * SLOT_SIZE)))
  local web_port=$((base_port + WEB_OFFSET))

  if port_is_free "$web_port"; then
    return 0
  fi

  port_owned_by_workspace "$web_port" "$workspace_root"
}

git_dir="$(git rev-parse --git-dir 2>/dev/null || true)"
if [[ -z "$git_dir" ]]; then
  echo "Not inside a git repository." >&2
  exit 1
fi

workspace_root="$(git rev-parse --show-toplevel)"
# Canonicalise for cwd comparisons (macOS /private symlink, etc.).
if command -v realpath >/dev/null 2>&1; then
  workspace_root="$(realpath "$workspace_root" 2>/dev/null || pwd -P)"
else
  workspace_root="$(cd "$workspace_root" && pwd -P)"
fi

# Explicit override wins: keep a user-supplied PORT/WEB_PORT untouched so
# `PORT=21121 make web-dev` and `ensure-web.sh --port 21121` keep working.
manual_port="${WEB_PORT:-${PORT:-}}"
if [[ -n "$manual_port" ]]; then
  if ! [[ "$manual_port" =~ ^[0-9]+$ ]]; then
    echo "Invalid manual port: ${manual_port}" >&2
    exit 1
  fi
  if [[ "$MODE" == "port-only" ]]; then
    printf '%s\n' "$manual_port"
    exit 0
  fi
  emit_export "GHN_PORT_SLOT" "manual"
  emit_export "GHN_PORT_SLOT_BASE" "$manual_port"
  emit_export "GHN_IS_WORKTREE" "false"
  emit_export "WEB_PORT" "$manual_port"
  emit_export "PORT" "$manual_port"
  emit_export "PLAYWRIGHT_BASE_URL" "http://localhost:${manual_port}"
  emit_export "E2E_BASE_URL" "http://localhost:${manual_port}"
  exit 0
fi

is_worktree=false
if [[ "$git_dir" == *"/worktrees/"* ]] || [[ "$workspace_root" == *"/worktrees/"* ]] || [[ "$workspace_root" == *"/workspaces/"* ]]; then
  is_worktree=true
fi

selected_slot=""

if [[ "$is_worktree" == "true" ]]; then
  hash_seed_hex="$(hash_hex "$workspace_root" 8)"
  hash_seed_dec=$((16#$hash_seed_hex))
  preferred_offset=$((hash_seed_dec % WORKTREE_SLOT_COUNT))

  for ((i = 0; i < WORKTREE_SLOT_COUNT; i++)); do
    slot=$((RESERVED_NON_WORKTREE_SLOTS + ((preferred_offset + i) % WORKTREE_SLOT_COUNT)))
    if slot_is_free_or_owned "$slot" "$workspace_root"; then
      selected_slot="$slot"
      break
    fi
  done
else
  for ((slot = 0; slot < RESERVED_NON_WORKTREE_SLOTS; slot++)); do
    if slot_is_free_or_owned "$slot" "$workspace_root"; then
      selected_slot="$slot"
      break
    fi
  done
fi

if [[ -z "$selected_slot" ]]; then
  if [[ "$is_worktree" == "true" ]]; then
    echo "No free worktree slot found in range ${RANGE_START}-${RANGE_END}." >&2
  else
    echo "No free non-worktree slot found in reserved range ${RANGE_START}-$((RANGE_START + RESERVED_NON_WORKTREE_PORTS - 1))." >&2
  fi
  exit 1
fi

slot_base=$((RANGE_START + (selected_slot * SLOT_SIZE)))
web_port=$((slot_base + WEB_OFFSET))

if [[ "$MODE" == "port-only" ]]; then
  printf '%s\n' "$web_port"
  exit 0
fi

emit_export "GHN_PORT_SLOT" "$selected_slot"
emit_export "GHN_PORT_SLOT_BASE" "$slot_base"
emit_export "GHN_IS_WORKTREE" "$is_worktree"
emit_export "WEB_PORT" "$web_port"
emit_export "PORT" "$web_port"
emit_export "PLAYWRIGHT_BASE_URL" "http://localhost:${web_port}"
emit_export "E2E_BASE_URL" "http://localhost:${web_port}"
