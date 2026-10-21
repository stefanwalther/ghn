# Implementation Plan: Automated Test Suite

**Branch**: `t3/specify-comprehensive-testing` | **Date**: 2026-10-20 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `specs/004-test-suite/spec.md`

## Summary

Turn ghn's thin test layer into a real safety net: a three-layer automated suite (unit, integration, component) plus a Playwright end-to-end layer, runnable from one Makefile target locally and enforced on every pull request by GitHub Actions.

The work is not only "write tests". Four small production changes are prerequisites, because the application currently hardcodes the database path, the clock, the credential source, and the GitHub base URL. Without them no test can run against an isolated database, no dataset can be deterministic, and no check can guarantee it never touches the real GitHub account. Those seams are additive and each has a sensible production default.

Two further changes are not optional extras but correctness fixes that the suite exposes: the seed and the sync path disagree on repository identifiers (a seeded-then-synced database crashes with a unique-constraint error), and the seeded dataset never sets `subjectType`, so the pull-request filter and the `PR` badge match nothing.

**Technical approach**: Vitest 5 on Node for unit, integration and component layers, with `node:sqlite` behind a Drizzle proxy driver so the same schema and query code runs in tests. Playwright drives a production build against a local stand-in for the GitHub API. Coverage is measured by the v8 provider, which enumerates untested source files, and gated by a ratchet that compares the pull request against its merge base.

## Technical Context

**Language/Version**: TypeScript 5.7.2 on Node 22 (test runtime), Bun 1.3.10 (package manager, application runtime, e2e reset script)

**Primary Dependencies**: Vitest 5.0.5, @vitest/coverage-v8 5.0.5, @testing-library/react 16.3.3, @testing-library/jest-dom, @testing-library/user-event, happy-dom, @playwright/test 1.49.1 (existing), drizzle-orm 0.36.4 (existing), node:sqlite (built in)

**Storage**: SQLite via `bun:sqlite` in production (file at `./data/quiet-notifications.db`); `node:sqlite` behind `drizzle-orm/sqlite-proxy` in tests

**Testing**: Vitest (unit, integration, component) and Playwright (end-to-end), orchestrated by Makefile targets and two GitHub Actions jobs

**Target Platform**: macOS (local) and ubuntu-latest (CI); Node 22 and Bun 1.3.10 required

**Project Type**: web application (Next.js 15 App Router, React 19) with a local SQLite store and a GitHub API integration

**Performance Goals**: full local suite under 5 minutes (SC-001); e2e layer under 3 minutes; CI quality job under 6 minutes including the merge-base coverage comparison

**Constraints**: the suite MUST run with no network access and no authenticated GitHub session (FR-009); it MUST never mutate a real GitHub account (FR-007); it MUST NOT touch the maintainer's real database (FR-021); local and CI runs MUST execute the same checks (FR-025)

**Scale/Scope**: 66 source files across `app/`, `lib/`, `components/`, `db/`, `scripts/`; 11 API routes; 20 library modules; 23 components; 6 user-facing views; 3 layers plus end-to-end; 1 maintainer

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

`.specify/memory/constitution.md` is the unmodified Spec Kit template. Every principle, section and governance rule is still a bracketed placeholder (`[PRINCIPLE_1_NAME]`, `[SECTION_2_CONTENT]`, `[GOVERNANCE_RULES]`). There are therefore no substantive principles to check against.

**Result**: PASS, vacuously. No constitution rule is violated because no constitution rule exists.

**Consequence, stated plainly**: the constitution cannot constrain this feature. The constraints that actually bind it come from the specification (FR-001 through FR-030) and from the research decisions in [research.md](./research.md), which record the reasoning for each technical choice. **Recommendation for a separate task**: the constitution should be filled in for this project. Its four placeholder principles are the natural home for exactly the rules this feature depends on (test-first, integration-test coverage, no secrets in tests, offline-capable suite). A filled constitution would also make the next feature's Constitution Check meaningful rather than vacuous.

**Post-design re-check**: unchanged. The design adds no new runtime dependency to the application, introduces no new runtime behaviour in production paths, and keeps the existing gates intact.

## Project Structure

### Documentation (this feature)

```text
specs/004-test-suite/
├── plan.md              # This file
├── spec.md              # Feature specification
├── research.md          # Phase 0 output
├── data-model.md        # Phase 1 output
├── quickstart.md        # Phase 1 output
├── contracts/           # Phase 1 output
│   ├── local-command.md         # Makefile and package script surface
│   ├── github-stand-in.md       # Stand-in HTTP contract and scripting API
│   ├── coverage-ratchet.md      # Comparison script contract and CI wiring
│   └── test-support.md          # Shared test-support module contracts
└── checklists/
    └── requirements.md  # Specification quality checklist
```

### Source Code (repository root)

```text
# Application (unchanged in shape; four files gain environment seams)
app/
├── api/                       # 11 route handlers
│   ├── connection/route.ts
│   ├── contributions/route.ts
│   ├── notifications/route.ts
│   ├── notifications/bulk/route.ts
│   ├── notifications/seed/route.ts
│   ├── rate-limits/route.ts
│   ├── repositories/route.ts
│   ├── repositories/[id]/route.ts
│   ├── sync/route.ts
│   ├── thread/route.ts
│   └── thread/sync/route.ts
├── page.tsx                   # 628-line inbox screen; logic extracted to lib/
├── rate-limits/page.tsx
└── repos/page.tsx

components/
├── inbox/                     # 8 components (notification-list, item-drawer, item-menu,
│                              #  filter-sidebar, inbox-filters, bulk-bar, digest-section,
│                              #  empty-states, markdown, shortcuts-help)
├── repos/repo-row.tsx
├── ui/                        # 8 primitives
├── app-shell.tsx
├── contributions-chip.tsx
└── demo-banner.tsx

lib/
├── clock.ts                   # NEW: single source of "now", reads GHN_NOW
├── api-base.ts                # NEW: shared apiBase() and graphqlUrl(), honours GHN_API_BASE
├── inbox-state.ts             # NEW: extracted pure logic from app/page.tsx
├── sync-errors.ts             # NEW: extracted sync reason to message mapping
├── seed-data.ts               # NEW: the single dataset in GitHub thread shape
├── bulk.ts  clipboard.ts  contributions.ts  digest.ts  filters.ts
├── github.ts  markdown.ts  queue.ts  rate-limit-meta.ts  rate-limits.ts
├── seed.ts  shortcuts.ts  snooze.ts  sync.ts  utils.ts  view-state.ts

db/
├── client.ts                  # GHN_DB_PATH override, cache keyed on path
└── schema.ts

scripts/
├── push.ts                    # GHN_DB_PATH override
├── seed.ts                    # uses lib/clock nowMs()
├── e2e-reset.ts               # NEW: in-place isolated database reset
└── compare-coverage.ts        # NEW: merge-base coverage ratchet comparison

tests/
├── unit/                      # 14 existing files, migrated to vitest
├── integration/               # NEW: route handlers, database, queue, sync orchestration
├── component/                 # NEW: React client components in a DOM
├── e2e/                       # Playwright specs
│   ├── fixtures.ts            # NEW: per-test database reset
│   └── inbox.spec.ts          # rewritten to deterministic assertions
└── support/                   # NEW: shared test infrastructure
    ├── github-stand-in.ts     # the GitHub stand-in (D4)
    ├── stand-in-server.ts     # standalone process entry point for Playwright
    ├── db-client.node.ts      # node:sqlite + drizzle proxy driver (D2)
    ├── dom-setup.ts           # matchMedia, scrollIntoView, clipboard stubs
    └── fixtures.ts            # in-memory database factory, thread factory, clock pinning

vitest.config.ts               # NEW: three projects, coverage config
playwright.config.ts           # rewritten: dedicated ports, stand-in, frozen clock
Makefile                       # test targets added
package.json                   # test scripts added, start port parameterised
.github/workflows/ci.yml       # two jobs: quality (+coverage ratchet), e2e
```

**Structure Decision**: The existing layout is kept. Tests are organised by layer under `tests/`, with a shared `tests/support/` directory for the infrastructure that more than one layer needs. The `lib/` additions are pure functions and small modules with no framework dependencies, so they stay importable by the application without a test-only build. Nothing moves between `app/`, `lib/`, `components/` or `db/`; the only structural change is that six functions move out of `app/page.tsx` into `lib/`, which leaves `app/page.tsx` smaller and puts the testable logic where the other testable logic already lives.

### Layer mapping

FR-003 names three layers. The implementation runs four, because React client components need a DOM environment and therefore a separate runner project from the pure-function checks. The extra project is a subdivision of the first layer, not a fourth kind of check, so the specification's three layers are all present and none is duplicated.

| Specification layer (FR-003) | Runner projects | Environment |
|---|---|---|
| Fast in-process checks of individual rules and functions | `unit`, and `component` for the React client components | `node`, `happy-dom` |
| Checks that exercise the service and storage layers together | `integration` | `node` |
| Checks that drive the assembled application through its user-facing journeys | `e2e` | Browser |

Every run reports the runner projects it executed, so the mapping is visible in the output rather than only in this document (FR-004).

## Phase 0 Summary

Full reasoning in [research.md](./research.md). The decisions that shape the implementation:

| # | Decision | Why it matters to the plan |
|---|---|---|
| D1 | Vitest 5 on Node, not `bun test` | The only runner that enumerates untested files in its coverage report, mocks `await import("bun")`, and isolates the module registry per file. Three MUST requirements fail under Bun. |
| D2 | `node:sqlite` plus `drizzle-orm/sqlite-proxy` | Lets the same Drizzle schema and query code run under Node with no native dependency. |
| D3 | Four environment seams: `GHN_TOKEN`, `GHN_API_BASE`, `GHN_DB_PATH`, `GHN_NOW` | The only way to run against an isolated database, a frozen clock, and a stand-in instead of the real GitHub account. |
| D4 | One GitHub stand-in on `node:http`, used in-process and as a standalone process | The single scripted behaviour source for both the integration and end-to-end layers. |
| D5 | One dataset in `lib/seed-data.ts`, explicit age ladder, `subjectType` set | Determinism, plus the fix for the unique-constraint crash and the pull-request filter that matches nothing. |
| D6 | Playwright against a production build, dedicated ports, in-place database reset | Production fidelity, and a reset that does not leave the running server reading a stale inode. |
| D7 | Coverage ratchet computed in a merge-base worktree in the same job | No bot, no push, no artifact dependency; the baseline cannot drift from the code it describes. |
| D8 | Extract the pure logic from `app/page.tsx`, then add thin wiring tests | Failures name a behaviour rather than "the inbox page", which FR-014 requires. |
| D9 | happy-dom for the component project | Verified with React 19 and faster than jsdom; keeps the runtime question closed. |
| D10 | Four layers: `unit`, `integration`, `component`, `e2e` | FR-003 and FR-004: each layer runs alone, and every run reports which layers ran. |

### Risks carried into implementation

| Risk | Mitigation |
|---|---|
| The happy-dom plus React 19 combination was verified under `bun test`, not under Vitest on Node | Spike it first, per the open items in [research.md](./research.md). Fall back to jsdom, verified working under Node. |
| `node:sqlite` plus the Drizzle proxy driver has not been exercised against every table, index or the `onConflictDoNothing` call in `lib/seed.ts` | Spike it against the full schema before writing the integration layer. `muted_subjects` has no unique index, so `onConflictDoNothing` cannot deduplicate. |
| The `globalThis`-cached database client is evaluated once per worker, which may affect coverage instrumentation | Confirm during the coverage spike. D3's path-keyed cache addresses the wrong-database problem in the meantime. |
| The production build sets `NODE_ENV=production`, which disables the seed API route | Seeding is done by `scripts/e2e-reset.ts`, which is the path that must work anyway. |
| The ratchet's merge-base worktree needs `fetch-depth: 0` and its own `bun install` | Both are in the CI workflow. The not-evaluable outcome covers the first pull request, which has no baseline. |

## Verification

The gates in the specification map to checks in the following way. Every one of them is executable.

| Requirement | Verified by |
|---|---|
| FR-001, FR-002, FR-004, FR-022 | `make test` runs all layers and exits non-zero on failure; `make help` lists the targets; a fresh clone needs only `bun install` |
| FR-003, FR-028 | Three Vitest projects plus the Playwright project; a new file in `tests/unit/` runs with no registration |
| FR-005, FR-006, FR-010, FR-026 | The `quality` CI job runs typecheck, lint and the suite; a deliberately failing pull request is blocked |
| FR-007, FR-008, FR-009 | The stand-in serves every endpoint; `GHN_TOKEN=""` yields no credential; the suite passes with the network disabled |
| FR-011, FR-012, FR-013, FR-015 | Ten consecutive runs give identical verdicts; a check that cannot run is reported as not run; a crashing check does not stop the rest |
| FR-014 | A deliberately broken rule produces a failure naming the behaviour and its location |
| FR-016, FR-017 | The coverage report lists all 66 source files including the 10 with no check; the artifact is uploaded from the CI job |
| FR-018, FR-019, FR-020 | The e2e layer asserts exact counts against the frozen dataset, with the conditional assertions in `tests/e2e/inbox.spec.ts` replaced |
| FR-021, FR-024 | The suite runs against `GHN_DB_PATH` in a temporary directory; `bun run db:seed` still works against the real database |
| FR-023 | The full local suite completes in under 5 minutes |
| FR-025, FR-030, SC-012 | The merge-base comparison script returns pass, fail or not-evaluable; only fail exits non-zero |
| FR-027 | The shared fixtures in `tests/support/` are reused by the integration, component and end-to-end layers |

## Complexity Tracking

> **Fill ONLY if Constitution Check has violations that must be justified**

No constitution violations, because the constitution is an unmodified template with no principles in it. The four production seams added by D3, and the six functions extracted from `app/page.tsx` by D8, are the only departures from the existing shape. Both are recorded in [research.md](./research.md) with the alternatives that were rejected and the measurements that drove the choice.
