# Quickstart: Validating the Automated Test Suite

**Feature**: [004-test-suite](./spec.md) | **Date**: 2026-10-20

How to run the suite, and how to confirm each requirement holds. This is a run guide. The implementation lives in `tasks.md` and the implementation phase.

---

## Prerequisites

| Requirement | Why |
|---|---|
| Bun 1.3.10 | Package manager, application runtime, and the end-to-end reset script |
| Node 22 | The Vitest runtime |
| A Chromium build for Playwright | The end-to-end layer |

```bash
bun install
bunx playwright install chromium
```

Nothing else. No manual file creation, no hand-edited configuration, no database preparation (FR-022).

---

## 1. Run the whole suite

```bash
make test
```

Expected: the four layers are named, every check reports an outcome, and the command exits `0`.

```text
layers: unit, integration, component, e2e
...
pass  tests/unit/filters.test.ts
...
All checks passed.
```

**Validation**: this is FR-001, FR-002, FR-004 and SC-001. The run should finish in under 5 minutes.

---

## 2. Run one layer

```bash
make test-unit
make test-integration
make test-component
make test-e2e
```

Expected: the output names only the layer that ran.

```text
layers: unit
```

**Validation**: FR-004 and FR-013. A partial run must never claim to be a full run.

---

## 3. Confirm the suite never touches the real GitHub account

This is the most important check in the guide, because the failure mode is silent.

```bash
# 1. Confirm the real account's state before the run.
gh api notifications --paginate -q 'length' 2>/dev/null | tail -1

# 2. Run the full suite.
make test

# 3. Confirm the state is identical.
gh api notifications --paginate -q 'length' 2>/dev/null | tail -1
```

Expected: the two numbers are the same.

A stronger version of the same check: run the suite with the network disabled. It must still pass.

```bash
# macOS: the suite must not need the network at all.
make test
```

**Validation**: FR-007, FR-008, FR-009 and SC-004. Every remote call must be directed at the local stand-in.

---

## 4. Confirm the suite never touches the real database

```bash
ls -l data/quiet-notifications.db
make test
ls -l data/quiet-notifications.db
```

Expected: the file's modification time is unchanged, and its size is unchanged.

The suite must use a temporary path for its database, never the one under `data/`.

**Validation**: FR-021 and FR-024.

---

## 5. Confirm the demo seeding still works

```bash
bun run db:push
bun run db:seed
```

Expected:

```text
{"repositories":10,"notifications":200}
```

**Validation**: FR-024. The manual capability is untouched.

---

## 6. Confirm a failure names the behaviour and the location

Introduce a deliberate regression, run the suite, then undo it.

```bash
# Break one rule in lib/filters.ts
# ... change the 24h cutoff ...
make test-unit
```

Expected: a failure that names the broken rule and points at the file and line, not at "the suite".

```text
fail  tests/unit/filters.test.ts
  expected: 23h old to match the 24h filter
  received: false
  at lib/filters.ts:44
```

Then undo the change.

**Validation**: FR-014 and SC-007.

---

## 7. Confirm the coverage view names every part of the application

```bash
make test-coverage
```

Expected: the report lists all 66 source files, including the ones with no checks, which appear at zero percent.

The number to compare against is the file count in `app/`, `lib/`, `components/`, `db/` and `scripts/`:

```bash
find app lib components db scripts -type f \( -name '*.ts' -o -name '*.tsx' \) | wc -l
```

The coverage report must list the same number.

**Validation**: FR-016, FR-029 and SC-005. The report must name every source file, and the ones with no check must appear at zero percent rather than being omitted. The old `bun test --coverage` listed only 18 of the 58 files that existed then, which is the failure this requirement exists to prevent.

---

## 8. Confirm the coverage ratchet behaves

### Coverage at or above the baseline passes

```bash
make test-coverage
make coverage-check
```

Expected:

```text
coverage ratchet: pass
coverage is at or above the merge-base baseline (X% vs Y%).
```

### Coverage below the baseline fails

Add a file with uncovered code, or remove a test, then:

```bash
make test-coverage
make coverage-check
```

Expected: exit code `1`.

```text
coverage ratchet: fail
coverage dropped by N percentage points against the merge base (X% vs Y%).
```

### A missing baseline is reported, not failed

```bash
make coverage-check /nonexistent/baseline.json coverage/coverage-summary.json
```

Expected: exit code `0`, and:

```text
coverage ratchet: not-evaluable
no baseline coverage summary at /nonexistent/baseline.json.
```

**Validation**: FR-030, SC-012.

---

## 9. Confirm the end-to-end layer is deterministic

```bash
make test-e2e
make test-e2e
```

Expected: two identical verdicts.

**Validation**: FR-011, FR-012, FR-018 and SC-003.

---

## 10. Confirm the suite runs with no network

```bash
make test
```

Run it with the network turned off, or on a machine with no route out. It must still pass.

**Validation**: FR-009.

---

## 11. Confirm a check that cannot run is reported

Temporarily point the stand-in at an unavailable port and run the integration layer.

Expected: the affected checks report `not run` with the reason. They are not reported as passing, and they are not omitted.

**Validation**: FR-013 and SC-009.

---

## 12. Confirm CI enforces it

Open a pull request with a deliberate regression.

Expected:

- The `quality` job runs the type check, the lint check and the suite, and reports a failure.
- The `e2e` job runs the end-to-end layer.
- The coverage artifact is attached to the run.
- The pull request cannot be merged while the run is failing.

Then push a second pull request with the regression fixed and a test that covers it.

Expected: the coverage ratchet reports `pass`, because the coverage is at or above the baseline.

**Validation**: FR-005, FR-006, FR-010, FR-017, FR-026 and SC-002.

---

## 13. Confirm the local and CI runs agree

Run the same layer locally and in CI:

```bash
make test-unit
```

Expected: the same set of checks with the same outcome locally and in CI.

**Validation**: FR-025 and SC-011. A check added locally must also run in CI, with no registration step.

---

## Requirement-to-check index

| Requirement | Check |
|---|---|
| FR-001, FR-002 | 1 |
| FR-003 | 1, 2 |
| FR-004 | 2 |
| FR-005, FR-006, FR-010, FR-026 | 12 |
| FR-007, FR-008 | 3 |
| FR-009 | 10 |
| FR-011, FR-012 | 9 |
| FR-013 | 2, 11 |
| FR-014 | 6 |
| FR-015 | 1 |
| FR-016, FR-029 | 7 |
| FR-017 | 12 |
| FR-018 | 9 |
| FR-019, FR-020 | 1, 9 |
| FR-021 | 4 |
| FR-022 | Prerequisites |
| FR-023 | 1 |
| FR-024 | 5 |
| FR-025 | 13 |
| FR-027 | 1, 2 |
| FR-028 | 13 |
| FR-030 | 8 |
| SC-001 | 1 |
| SC-003 | 9 |
| SC-004 | 3 |
| SC-005 | 7 |
| SC-007 | 6 |
| SC-009 | 11 |
| SC-012 | 8 |
