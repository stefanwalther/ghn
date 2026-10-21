# Contract: Coverage Ratchet

**Feature**: [004-test-suite](../spec.md) | **Date**: 2026-10-20

The mechanism that makes coverage a gate which can only improve.

---

## 1. Rule

The merge-time run measures coverage for the pull request's head and for its merge base, computed the same way, and fails the run when the head's coverage is below the base's.

Coverage that is equal to or higher passes. The baseline therefore ratchets upward and is never renegotiated (FR-030).

---

## 2. Script contract

### 2.1 Invocation

```text
bun run scripts/compare-coverage.ts <baseline-summary.json> <head-summary.json>
```

| Argument | Meaning |
|---|---|
| `baseline-summary.json` | The merge base's `coverage-summary.json` |
| `head-summary.json` | The head's `coverage-summary.json` |

Both paths are required. With either missing, the script prints its usage and exits `2`.

### 2.2 Exit codes

| Exit code | Meaning |
|---|---|
| `0` | `pass` or `not evaluable` |
| `1` | `fail` |
| `2` | The script was called incorrectly |

### 2.3 The exported function

The comparison is also exported, so it can be checked without spawning a process:

```ts
import { compareCoverage } from "@/scripts/compare-coverage";

const result = compareCoverage(basePath, headPath);
// { status: "pass" | "fail" | "not-evaluable", message: string, exitCode: number }
```

`compareCoverage` never exits the process. The command-line wrapper maps `exitCode` onto the process exit status.

### 2.3 Output

The script prints one status line, then a human-readable line.

```text
coverage ratchet: pass
coverage is at or above the merge-base baseline (62.14% vs 61.90%).
```

```text
coverage ratchet: fail
coverage dropped by 1.24 percentage points against the merge base (60.90% vs 62.14%).
```

```text
coverage ratchet: not-evaluable
no baseline coverage summary at <path>. The merge base has no coverage measurement to compare against.
```

On `fail` the script also writes a GitHub Actions error annotation:

```text
::error::Coverage fell below the merge-base baseline.
```

### 2.4 The arithmetic

The figure compared is `total.lines.pct` from each summary file. Statements are printed alongside for context but do not affect the verdict.

The coverage tool rounds percentages to two decimals, so comparing the rounded values is exact. No tolerance is applied.

```ts
const delta = Number((headLines - baseLines).toFixed(4));
if (delta < 0) -> fail
```

A tolerance flag may be added later if environment noise proves to matter. It is not part of this contract.

---

## 3. The three verdicts

| Verdict | Condition | Blocks the merge | Expected frequency |
|---|---|---|---|
| `pass` | The head figure is at or above the baseline | No | The normal case |
| `fail` | The head figure is below the baseline | Yes | The case the gate exists for |
| `not evaluable` | There is no baseline to compare against | No, but it is reported with the reason | The first pull request that introduces the suite, and any pull request while the base is red |

`not evaluable` is an expected outcome, not an error. It is reported and never blocks (FR-030). It covers two distinct states, and the script names which one it is in:

- The merge base has no coverage configuration at all. There is nothing to measure, which is the case for the first pull request that introduces the suite.
- The merge base has a coverage configuration but its own suite does not pass. The base is red, so there is no baseline. This must not block, because the change that repairs a red base is exactly the one that cannot measure it.

A failure that is neither of those is an error and does block: the merge base cannot be installed, the head produced no coverage summary, or the merge base cannot be resolved. A gate that silently stops gating is worse than no gate, so those cases fail the run.

---

## 4. How the baseline is produced

In the same CI job, in a second git worktree checked out at the merge base.

```text
1. Resolve the merge base commit.
2. git worktree add --detach <temp> <merge-base>
3. Install dependencies in the base worktree.
4. Run the coverage suite in the base worktree, with its own isolated
   database and the same frozen clock.
5. Run the comparison from the pull request's checkout, against the two
   summary files.
6. git worktree remove --force <temp>
```

Two constraints on this flow:

- The base run's database path MUST be inside the base worktree, not the pull request's, or the two runs share a file.
- The comparison script runs from the pull request's checkout. Only the coverage *measurement* happens in the base worktree, so both sides use the same comparison code.

### 4.1 Resolving the merge base

```text
GHN_BASE_SHA   the pull request's base commit, when the event supplies one
otherwise       git merge-base origin/main HEAD
```

The repository must be checked out with full history depth for the fallback to work.

---

## 5. The coverage summary format

The comparison reads the coverage tool's `json-summary` output.

```json
{
  "total": {
    "lines": { "total": 4210, "covered": 2616, "pct": 62.14 },
    "statements": { "total": 4210, "covered": 2590, "pct": 61.52 },
    "functions": { "total": 612, "covered": 448, "pct": 73.2 },
    "branches": { "total": 1180, "covered": 700, "pct": 59.32 }
  },
  "app/page.tsx": { "lines": { "total": 628, "covered": 0, "pct": 0 } }
}
```

A metric with no data at all is reported as the string `"Unknown"`. The comparison treats that as "not evaluable" rather than as zero, so a missing metric never silently reads as a catastrophic drop.

---

## 6. What the ratchet catches, and what it does not

Measured against the merge base's coverage computed with the merge base's own tests:

| Change | Caught |
|---|---|
| A pull request deletes tests | Yes, coverage falls below the base |
| A pull request adds code without tests | Yes, coverage falls below the base |
| A pull request adds well-tested code | No, and it should not be |
| A pull request adds a large amount of well-tested code alongside a smaller amount of uncovered code | No. The added tests push the head figure above the base figure |

The stricter variant measures the base with the **head's** test suite against the base's source, which catches the last case. That is a different and more expensive job, and the specification's wording does not require it. The literal reading ships.

---

## 7. CI wiring

```yaml
- run: bun run typecheck
- run: bun run lint
- name: Unit, integration and component tests with coverage
  run: bun run test:coverage
- name: Coverage ratchet against the merge base
  run: bun run scripts/compare-coverage.ts "$BASE/coverage/coverage-summary.json" coverage/coverage-summary.json
  env:
    GHN_BASE_SHA: ${{ github.event.pull_request.base.sha }}
- uses: actions/upload-artifact@v4
  if: always()
  with:
    name: coverage
    path: coverage/
    retention-days: 14
```

The coverage artifact is uploaded whether the ratchet passed or failed, so the coverage view is always inspectable (FR-017).

---

## 8. Change impact

| Change | Breaking for |
|---|---|
| The compared metric | Every previously recorded baseline, which means the first comparison after such a change fails |
| The exit codes | The CI step that relies on them |
| The verdict names | Anything parsing the output |
| The merge-base resolution | Pull requests from forks, where `origin/main` must be fetchable |
