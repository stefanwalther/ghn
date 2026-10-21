#!/usr/bin/env bash
#
# Compare the current coverage against the merge base.
#
# The baseline is measured from source in a second worktree, in the same job.
# Nothing is stored on the base branch and no bot pushes anything, so the
# baseline can never drift from the code it describes.
#
# Three outcomes. Only a real drop blocks:
#
#   pass           coverage is at or above the baseline
#   fail           coverage is below the baseline
#   not evaluable  there is no baseline to compare against
#
# The not evaluable case is expected, not an error. The first pull request
# that introduces the suite has a merge base with no coverage configuration
# at all, so there is nothing to measure.

set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

BASE_SHA="${GHN_BASE_SHA:-}"
if [ -z "$BASE_SHA" ]; then
  if ! git rev-parse --verify origin/main >/dev/null 2>&1; then
    echo "coverage ratchet: not-evaluable"
    echo "no merge base could be resolved. Fetch origin/main and try again."
    exit 0
  fi
  BASE_SHA="$(git merge-base origin/main HEAD)"
fi

echo "coverage ratchet: merge base $BASE_SHA"

BASE_DIR="$(mktemp -d)"
cleanup() {
  git worktree remove --force "$BASE_DIR" >/dev/null 2>&1 || true
  rm -rf "$BASE_DIR"
}
trap cleanup EXIT

if ! git worktree add --detach "$BASE_DIR" "$BASE_SHA" >/dev/null 2>&1; then
  echo "coverage ratchet: not-evaluable"
  echo "the merge base $BASE_SHA could not be checked out."
  exit 0
fi

# The baseline needs its own dependencies, because it is a different commit.
if ! (cd "$BASE_DIR" && bun install --frozen-lockfile >/dev/null 2>&1); then
  echo "coverage ratchet: not-evaluable"
  echo "the merge base $BASE_SHA has no installable dependency set to measure."
  exit 0
fi

BASE_DB="$(mktemp -d)/baseline.db"
if ! (cd "$BASE_DIR" && GHN_DB_PATH="$BASE_DB" GHN_NOW="${GHN_NOW:-2026-01-15T12:00:00Z}" \
      bun run test:coverage >/dev/null 2>&1); then
  echo "coverage ratchet: not-evaluable"
  echo "the merge base $BASE_SHA produces no coverage measurement to compare against."
  exit 0
fi

BASE_SUMMARY="$BASE_DIR/coverage/coverage-summary.json"
HEAD_SUMMARY="$ROOT/coverage/coverage-summary.json"

if [ ! -f "$HEAD_SUMMARY" ]; then
  echo "coverage ratchet: not-evaluable"
  echo "no coverage summary at $HEAD_SUMMARY. Run the coverage suite first."
  exit 0
fi

bun run scripts/compare-coverage.ts "$BASE_SUMMARY" "$HEAD_SUMMARY"
