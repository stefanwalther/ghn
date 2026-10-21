# Data Model: Automated Test Suite

**Feature**: [004-test-suite](./spec.md) | **Date**: 2026-10-20

This feature introduces no user-facing domain data. It introduces the entities of the test infrastructure itself, plus the environment seams that let the application be pointed at controlled substitutes. The existing application schema (`db/schema.ts`) is unchanged.

---

## 1. Environment Seam

A named input that redirects part of the application away from its production source. Each seam has a production default, so the application behaves identically when the variable is unset.

| Seam | Default | Controls | Consumed by |
|---|---|---|---|
| `GHN_TOKEN` | unset (read from the local `gh` credential helper) | The credential presented to GitHub. An explicitly empty value means **no credential**, and must not fall back to the helper. | `lib/github.ts` `readToken` |
| `GHN_API_BASE` | `https://api.github.com` | The base URL of every GitHub request. An explicitly empty value means unset and restores the default. | `lib/github.ts` `apiBase`, `lib/rate-limits.ts` `graphqlUrl` |
| `GHN_DB_PATH` | `./data/quiet-notifications.db` | The SQLite file the application opens. | `db/client.ts`, `scripts/push.ts` |
| `GHN_NOW` | unset (the real clock) | The instant every time-dependent decision reads. | `lib/clock.ts` `now` |

**Validation rules**

- `GHN_TOKEN`: trimmed. Empty after trimming resolves to `null`, which the application treats as "not connected". The value is never logged and never written to the database.
- `GHN_API_BASE`: trimmed, trailing slashes removed. Empty resolves to the default.
- `GHN_DB_PATH`: used as given. The parent directory must exist; `bun:sqlite` creates the file but not the directory.
- `GHN_NOW`: parsed as a number of milliseconds since the epoch first, then as a date string. An unparseable value falls back to the real clock rather than throwing, so a malformed value degrades to "not pinned" instead of breaking the application.

**Relationships**: a seam is set on the process that consumes it. The end-to-end layer sets all four on the application server process; the integration layer sets them per test file; the unit layer sets none, because unit-tested functions take their collaborators as parameters.

---

## 2. Test Layer

One of the categories the suite is divided into, distinguished by how much of the application it exercises.

| Layer | Exercises | Environment | Runner |
|---|---|---|---|
| `unit` | Individual rules and functions in isolation, with every collaborator supplied as a parameter | `node` | Vitest |
| `integration` | The service and storage layers together: request handlers, the database, the write-back queue, the sync orchestration | `node` | Vitest |
| `component` | React client components rendered in a DOM | `happy-dom` | Vitest |
| `e2e` | The assembled application driven through its user-facing journeys | Browser | Playwright |

FR-003 names three layers. These four runner projects map onto them without adding a fourth kind of check: `component` is a subdivision of the first layer, split off only because React client components need a DOM environment. The specification's three layers are all present and none is duplicated.

**Validation rules**

- Each layer runs on its own and reports which layers were executed (FR-004).
- A run of a subset MUST NOT report itself as a full run.
- `e2e` is a layer for reporting purposes but a separate runner in practice, because it needs a built application and a browser.

---

## 3. Check

A single automated assertion set. A check belongs to exactly one layer and is discovered automatically, never registered by hand (FR-028).

**Attributes**: identity, layer, what behaviour it protects, and the expected outcome.

**State transitions**: a check moves through exactly one terminal state per run.

| State | Meaning |
|---|---|
| `pass` | Every assertion held |
| `fail` | An assertion did not hold. The output names the behaviour that broke and the location (FR-014) |
| `not run` | The check could not execute in this environment. The reason is recorded. Never silently skipped (FR-013) |
| `crash` | The check died rather than failing an assertion. The remaining checks still run (FR-015) |

**Relationships**: one check belongs to one layer. A check may depend on shared support fixtures, never on another check's state or leftovers (FR-012).

---

## 4. Local Run

One invocation of the suite on a developer's machine.

**Attributes**: the layers included, the environment seams in force, the resulting per-check states, and the overall verdict.

**Rules**

- The verdict is `pass` when no check is in `fail` or `crash` state.
- A `not run` check is reported and does not by itself make the verdict `fail`, but it is always visible (FR-013).
- Ten consecutive runs on an unchanged checkout produce identical verdicts (SC-003).

---

## 5. Gate

A required check on a pull request that blocks merging while it is failing.

| Gate | Blocks on | Source |
|---|---|---|
| Type check | A type error | `bun run typecheck` |
| Lint | A lint error | `bun run lint` |
| Test suite | Any check in `fail` or `crash` state | `make test` |
| Coverage ratchet | Coverage below the merge-base baseline | `scripts/compare-coverage.ts` |

**Rules**: all four continue to exist and block after this feature lands (FR-026). The coverage ratchet has three outcomes, of which only one blocks.

---

## 6. Coverage View

The map from the application's source files to the checks that exercise them.

**Attributes**: per file, the covered and total counts and the resulting percentage for lines, statements, functions and branches; and per file, whether any check exercises it at all.

**Rules**

- Every source file in `app/`, `lib/`, `components/`, `db/` and `scripts/` appears, including files with no check at all (FR-016). `bun test --coverage` listed 18 of the 58 files that existed at the time; the chosen tool lists every one of them, including the untested ones.
- A file with no check is listed as uncovered, not omitted.
- The view is produced from a single merged run across the `unit`, `integration` and `component` layers.

---

## 7. Coverage Baseline

The merge base's coverage, computed the same way as the head's, used as the reference for the ratchet.

**Attributes**: the overall percentage, and the merge-base commit it was measured from.

**Rules**

- The baseline is computed from source in the same job, never from a stored artifact or a committed file, so it cannot drift from the code it describes (D7).
- A baseline that cannot be produced yields a `not evaluable` verdict, which is reported and does not block. This is the expected case for the first pull request that introduces the suite.

---

## 8. Ratchet Verdict

The outcome of comparing the head's coverage against the baseline.

| Verdict | Condition | Blocks the merge |
|---|---|---|
| `pass` | Head coverage is at or above the baseline | No |
| `fail` | Head coverage is below the baseline | Yes |
| `not evaluable` | The baseline or the head figure could not be produced | No, but it is reported with the reason |

---

## 9. GitHub Stand-In

A controllable local substitute for the GitHub service.

**Attributes**: the base URL it listens on, the credential it accepts, the dataset it serves, and a set of scripted scenarios.

**Scripted scenario**

| Attribute | Meaning |
|---|---|
| Target path | The path the scenario applies to |
| Status | The HTTP status to return |
| Body | The JSON body to return |
| Delay | How long to wait before responding, for timeout paths |
| Rate-limit headers | The `x-ratelimit-*` headers to attach, which select between the rate-limited and the authorization-error readings of a 403 |

**Relationships**: one stand-in serves both the integration layer (in-process) and the end-to-end layer (as a separate process). Both consume the same dataset and the same scenario set, so a behaviour scripted once is exercised identically in both places.

**Rules**

- It serves every endpoint the application calls, enumerated in [contracts/github-stand-in.md](./contracts/github-stand-in.md).
- It rejects a request that does not carry the expected credential, so the authorization-failure path is reachable.
- It never forwards anything to the real GitHub service.

---

## 10. Dataset

The deterministic set of repositories and notifications used by the end-to-end layer and by the integration layer's sync tests.

**Repository attributes**: identifier, full name, ownership, rhythm, and the promotion and due instants.

**Notification attributes**: identifier, repository, subject title, subject type, subject state, reason, merged flag, creation instant, read flag, and source URL.

**Rules**

- Repository identifiers are derived from the full name by the same function the sync path uses, so the two agree. This is the fix for the unique-constraint crash.
- The `pull_request` filter and the `PR` badge have a non-zero population. `subjectType` is always set.
- Every age filter from 24 hours upward has a known, non-zero count in the visible set. The recent items sit in the repositories that are due, so they are visible rather than collapsed.
- The merged flag is set only on items whose subject type is a pull request, because that is the only case the sync path records.
- The creation instants are relative to the frozen instant, so the age buckets are stable for as long as the clock is pinned.

---

## 11. Shared Fixture

Reusable test setup, so that adding a check does not mean copying scaffolding (FR-027).

| Fixture | Provides |
|---|---|
| Database factory | An isolated database with the full schema, created in a temporary location |
| Thread factory | A GitHub-shaped thread with sensible defaults |
| Clock pinning | A fixed instant applied to the environment seam and to the fake timers |
| Stand-in controller | Start, stop, and scenario scripting |
| DOM stubs | The browser APIs jsdom and happy-dom do not implement |

**Rules**: fixtures are shared by every layer that needs them. They hold no state between checks, and each check that uses a fixture gets a fresh instance.

---

## Entity relationships

```text
Local Run ──includes──> Test Layer ──includes──> Check
                                              │
                                              └──uses──> Shared Fixture
                                                          │
                                                          ├──uses──> Dataset
                                                          └──uses──> GitHub Stand-In

Coverage View ──derived from──> Local Run (merged across unit, integration, component)
Coverage Baseline ──compared with──> Coverage View ──> Ratchet Verdict
Ratchet Verdict ──gates──> Gate ──gates──> Pull Request

Environment Seam ──redirects──> Application (database path, clock, credential, GitHub base URL)
```

---

## Validation rules summary

| Rule | Requirement |
|---|---|
| A seam with an unset value restores the production default | FR-007, FR-021 |
| An explicitly empty `GHN_TOKEN` resolves to no credential and never falls back | FR-007, FR-009 |
| A layer reports which layers it ran | FR-004 |
| A check is never silently skipped; it is `pass`, `fail`, `not run` or `crash` | FR-013 |
| A `crash` does not stop the remaining checks | FR-015 |
| Every source file appears in the coverage view | FR-016, SC-005 |
| Only the `fail` ratchet verdict blocks the merge | FR-030, SC-012 |
| The stand-in never contacts the real GitHub service | FR-007, FR-008 |
| The dataset's age buckets and pull-request population are non-zero and stable | FR-011, FR-018 |
| Fixtures hold no state between checks | FR-012 |
