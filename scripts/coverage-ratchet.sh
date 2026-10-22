#!/usr/bin/env bash
#
# Compare the current coverage against the merge base.
#
# The baseline is measured from source in a second worktree, in the same job.
# Nothing is stored on the base branch and no bot pushes anything, so the
# baseline can never drift from the code it describes.
#
# Four outcomes. Only a real drop blocks, and only a broken baseline is an
# error:
#
#   pass            coverage is at or above the baseline
#   fail            coverage is below the baseline
#   not evaluable   the merge base has no coverage configuration at all
#   error           the merge base should have produced a baseline and did not
#
# The not evaluable case is expected for the first pull request that
# introduces the suite, because the merge base has no coverage configuration
# to measure. Anything else that goes wrong is an error, because a gate that
# silently stops gating is worse than no gate.

set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

if ! git rev-parse --verify origin/main >/dev/null 2>&1; then
  echo "coverage ratchet: error"
  echo "origin/main could not be resolved, so the merge base is unknown. Fetch it and try again."
  exit 1
fi

# The merge base, not the head of the base branch. The base branch moves on
# while a pull request is open, and a baseline measured at a different
# commit is not the baseline the gate is named after.
BASE_SHA="$(git merge-base origin/main HEAD)"

echo "coverage ratchet: merge base $BASE_SHA"

BASE_DIR="$(mktemp -d)"
BASE_DB_DIR="$(mktemp -d)"
cleanup() {
  git worktree remove --force "$BASE_DIR" >/dev/null 2>&1 ||
    echo "warning: the worktree at $BASE_DIR could not be removed" >&2
  rm -rf "$BASE_DIR" "$BASE_DB_DIR"
}
trap cleanup EXIT

if ! git worktree add --detach "$BASE_DIR" "$BASE_SHA" >/dev/null 2>&1; then
  echo "coverage ratchet: error"
  echo "the merge base $BASE_SHA could not be checked out."
  exit 1
fi

# A merge base with no coverage configuration has nothing to measure. That is
# the first pull request that introduces the suite, and it is reported rather
# than failed.
if [ ! -f "$BASE_DIR/vitest.config.mts" ] && [ ! -f "$BASE_DIR/vitest.config.ts" ]; then
  echo "coverage ratchet: not-evaluable"
  echo "the merge base $BASE_SHA has no coverage configuration, so there is no baseline to compare against."
  exit 0
fi

# The baseline needs its own dependencies, because it is a different commit.
if ! (cd "$BASE_DIR" && bun install --frozen-lockfile >/dev/null 2>&1); then
  echo "coverage ratchet: error"
  echo "the merge base $BASE_SHA has no installable dependency set, so the baseline could not be measured."
  exit 1
fi

if ! (cd "$BASE_DIR" && GHN_DB_PATH="$BASE_DB_DIR/baseline.db" GHN_NOW="${GHN_NOW:-2026-01-15T12:00:00Z}" \
      bun run test:coverage >/dev/null 2>&1); then
  # The merge base has a coverage configuration, so a baseline is expected.
  # It could not be produced because the base's own suite does not pass. That
  # is a known state of the base rather than a fault of this pull request,
  # and blocking here would leave the base unfixable: the change that
  # repairs a red base is exactly the one that cannot measure it.
  echo "coverage ratchet: not-evaluable"
  echo "the merge base $BASE_SHA has a coverage configuration, but its own suite does not pass."
  echo "There is no baseline to compare against until the base is green."
  exit 0
fi

BASE_SUMMARY="$BASE_DIR/coverage/coverage-summary.json"
HEAD_SUMMARY="$ROOT/coverage/coverage-summary.json"

if [ ! -f "$HEAD_SUMMARY" ]; then
  echo "coverage ratchet: error"
  echo "no coverage summary at $HEAD_SUMMARY. Run the coverage suite first."
  exit 1
fi

bun run scripts/compare-coverage.ts "$BASE_SUMMARY" "$HEAD_SUMMARY"
