---

description: "Task list for the automated test suite"
---

# Tasks: Automated Test Suite

**Input**: Design documents from `/specs/004-test-suite/`

**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/, quickstart.md

**Tests**: Included. This feature *is* the test suite, so every layer's checks are part of the deliverable.

**Organization**: Tasks are grouped by user story so each story can be implemented, tested, and delivered independently.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (US1 through US6)
- Include exact file paths in descriptions

## Path Conventions

- Single project at the repository root: `app/`, `lib/`, `components/`, `db/`, `scripts/`, `tests/`
- Test layers: `tests/unit/`, `tests/integration/`, `tests/component/`, `tests/e2e/`, `tests/support/`

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Install the test toolchain and configure the runner.

- [x] T001 Install test dependencies: `vitest@5.0.5`, `@vitest/coverage-v8@5.0.5`, `@testing-library/react@16.3.3`, `@testing-library/jest-dom@7.0.1`, `@testing-library/user-event@14.6.8`, `happy-dom@21.0.4` as devDependencies in `package.json`
- [x] T002 Create `vitest.config.mts` with three projects named `unit` (environment `node`, include `tests/unit/**/*.test.{ts,tsx}`), `integration` (environment `node`, include `tests/integration/**/*.test.{ts,tsx}`), `component` (environment `happy-dom`, include `tests/component/**/*.test.{ts,tsx}`), plus `resolve.alias` mapping `@` to the repository root and `oxc.jsx.runtime: "automatic"` to override the root `tsconfig.json` `"jsx": "preserve"`
- [x] T003 [P] Add `playwright-report/`, `test-results/`, and `blob-report/` to `.gitignore` alongside the existing `coverage/` entry
- [x] T004 [P] Add `coverage/`, `playwright-report/`, and `test-results/` to the `ignores` list in `eslint.config.mjs`

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: The four environment seams, the shared test infrastructure, and the migration of the existing checks onto the new runner.

**⚠️ CRITICAL**: No user story work can begin until this phase is complete.

### Environment seams

- [x] T005 Create `lib/clock.ts` exporting `nowMs(): number`, which reads `GHN_NOW` and parses it as milliseconds first then as a date string, falling back to `Date.now()` when unset or unparseable
- [x] T006 Update `db/client.ts` to read the path from `GHN_DB_PATH` with the default `./data/quiet-notifications.db`, and key the `globalThis.__quietDb` cache on the resolved path so a changed path cannot return a handle to a different file
- [x] T007 Update `scripts/push.ts` so `main()` opens the path from `GHN_DB_PATH` with the same default
- [x] T008 Resolve the GitHub base URL in one place, honouring `GHN_API_BASE` with an empty value treated as unset and `GH_HOST` for an enterprise host
- [x] T009 Update `lib/github.ts` to move the credential lookup into `readToken` with a `GHN_TOKEN` override where an explicitly empty value resolves to `null` and never falls back to the `gh` helper; make `subjectApiUrlFromHtml` and `subjectCommentsUrlFromHtml` build their URLs from `apiBase()`; and make `apiBase()` agree with `apiBases()`
- [x] T010 Rewrite `lib/contributions.ts` so `getViewerLogin` and `fetchDayCount` use `fetch` against `apiBase()` and `graphqlUrl()` instead of shelling out to `gh api user` and `gh api graphql`, sending the GraphQL variables as `{ query, variables: { login, from, to } }`
- [x] T011 Update `lib/rate-limits.ts` to use the shared base resolver instead of deriving the GraphQL URL locally
- [x] T012 Replace `Date.now()` with `nowMs()` from `lib/clock.ts` in `app/api/notifications/route.ts`, `app/api/repositories/route.ts`, `app/api/repositories/[id]/route.ts`, `app/api/notifications/bulk/route.ts`, `app/api/sync/route.ts`, and `app/api/contributions/route.ts`

### Shared test infrastructure

- [x] T013 Create `tests/support/db-client.node.ts` exporting `createDb(path)` and `createMemoryDb()`, backed by `node:sqlite` and `drizzle-orm/sqlite-proxy`, mapping result rows through the statement's column list because the proxy expects positional rows, and creating the schema with the existing `ensureSchema` from `scripts/push.ts`
- [x] T014 Create `tests/support/test-env.ts` exporting `withEnv(vars)`, `pinnedNow(ms)` and `tempDbPath(label)`, where `tempDbPath` returns a path under the system temporary directory and never inside the repository
- [x] T015 Create `tests/support/fixtures.ts` exporting `makeTestDb()`, `makeThread(overrides)`, `makeRepo(overrides)` and `seedTestDataset(db, now)`, each returning a fresh instance with no state carried between checks
- [x] T016 Create `tests/support/dom-setup.ts` stubbing `window.matchMedia`, `Element.prototype.scrollIntoView`, `window.open`, `window.scrollTo` and `navigator.clipboard`, which neither `happy-dom` nor `jsdom` implements

### Migrating the existing checks

- [x] T017 Rewrite the `bun:test` imports in the 14 files under `tests/unit/` to `vitest`, keeping the `describe`, `expect` and `test` names
- [x] T018 Change `new Response("[]", { status: 304 })` in `tests/unit/sync.test.ts` to pass a `null` body for the 304 status, which Node's undici rejects with a body
- [x] T019 Replace the `bun:sqlite` import in `tests/unit/sync.test.ts` and `tests/unit/writeback.test.ts` with the `createMemoryDb` helper from `tests/support/db-client.node.ts`
- [x] T020 Replace the `Bun.serve` fixture servers in `tests/unit/github.test.ts`, `tests/unit/sync.test.ts` and `tests/unit/writeback.test.ts` with a `node:http` based helper that forwards the request body, and add that helper to `tests/support/`
- [x] T021 Verify the migrated suite runs green under Vitest with `bun run vitest run --project unit`, and that `bun run typecheck` and `bun run lint` still pass

**Checkpoint**: Foundation ready. Every user story can now be implemented independently.

---

## Phase 3: User Story 1 - Verify a change locally with one command (Priority: P1) 🎯 MVP

**Goal**: A single documented Makefile target runs the complete suite and reports a clear pass or fail verdict.

**Independent Test**: Introduce a deliberate regression in a rule in `lib/filters.ts`, run `make test`, and confirm it reports a failure naming the broken behaviour and the location, then undo the regression.

### Implementation for User Story 1

- [x] T022 [US1] Add `test`, `test-unit`, `test-integration`, `test-component`, `test-e2e`, `test-coverage` and `coverage-check` targets to the `Makefile`, and list each of them in the `help` output
- [x] T023 [US1] Add `test`, `test:unit`, `test:integration`, `test:component`, `test:e2e`, `test:coverage`, `test:all` and `coverage:check` scripts to `package.json`, delegating the layer targets to `vitest run --project <name>` and `test:e2e` to `playwright test`
- [x] T024 [US1] Change the `start` script in `package.json` to `bun --bun next start -p ${PORT:-21120}` so the port can be overridden, leaving the existing behaviour unchanged when `PORT` is unset
- [x] T025 [US1] Make the `make test` target print the layers it executed before starting, so a partial run is never mistaken for a full one, per FR-004

**Checkpoint**: `make test` runs everything and reports the layers. User Story 1 is independently demonstrable.

---

## Phase 4: User Story 2 - Catch regressions before a change is merged (Priority: P1)

**Goal**: Every pull request runs the automated suite in GitHub Actions, and a failing run blocks the merge.

**Independent Test**: Open a pull request containing a deliberate regression and confirm the automated run fails and the change cannot be merged until it is fixed.

### Implementation for User Story 2

- [x] T026 [US2] Update `.github/workflows/ci.yml` so the `gates` job runs `bun run typecheck`, `bun run lint` and `bun run test:coverage`, keeping the existing type and lint gates intact
- [x] T027 [US2] Add an `e2e` job to `.github/workflows/ci.yml` that checks out, sets up Bun, installs the Playwright Chromium browser with `--with-deps`, runs `bun run build` and then `bun run test:e2e`
- [x] T028 [US2] Add a cache step for `~/.cache/ms-playwright` keyed on `hashFiles('bun.lock')` to the `e2e` job in `.github/workflows/ci.yml`
- [x] T029 [US2] Upload the Playwright report and `test-results/` as an artifact with `if: failure()` from the `e2e` job, and the coverage directory as an artifact with `if: always()` from the `gates` job

**Checkpoint**: A failing check blocks the merge. User Story 2 is independently demonstrable.

---

## Phase 5: User Story 3 - Run the suite without touching the real GitHub account (Priority: P1)

**Goal**: Every check that exercises remote behaviour talks to a local stand-in, so the suite can never mutate a real account.

**Independent Test**: Run the full suite on a machine where `gh` is authenticated, then compare the real account's notification count before and after. It must be unchanged.

### Tests for User Story 3

- [x] T030 [P] [US3] Write a contract check for the GitHub stand-in in `tests/integration/github-stand-in.test.ts` covering the endpoint inventory, the rate-limit headers, the `link` pagination header including its port, the per-item subject payload, the credential rejection and the scripted scenarios
- [x] T031 [P] [US3] Write a check in `tests/integration/no-network.test.ts` that replaces the global `fetch` with one that throws for any non-loopback URL and then runs a representative slice of the application code

### Implementation for User Story 3

- [x] T032 [US3] Create `tests/support/github-stand-in.ts` exporting `startGitHubStandIn(options)` on `node:http`, serving every endpoint listed in `specs/004-test-suite/contracts/github-stand-in.md`, and returning a controller with `url`, `requests`, `setThreads`, `setSubject`, `setScenario`, `setRateLimit`, `reset` and `close`
- [x] T033 [US3] Create `tests/support/stand-in-server.ts` as the standalone entry point that starts the stand-in with the shared dataset and prints its base URL
- [x] T034 [US3] Add integration checks for `GET /api/notifications` in `tests/integration/notifications-route.test.ts` covering the age, type, state and repository filters, the main flow versus the collapsed digest split, and the facet counts
- [x] T035 [US3] Add integration checks for `GET /api/repositories` and `PATCH /api/repositories/[id]` in `tests/integration/repositories-route.test.ts` covering the pending counts, the digest labels, the rhythm update and the snooze update
- [x] T036 [US3] Add integration checks for `POST /api/notifications/bulk` in `tests/integration/bulk-route.test.ts` covering the input validation, the unknown-id rejection, each of the four actions, the remote failure path and the write-back queue fallback
- [x] T037 [US3] Add integration checks for `POST /api/sync` in `tests/integration/sync-route.test.ts` covering the unauthorized path, the repository discovery, the thread upsert and the queue drain, all against the stand-in
- [x] T038 [US3] Add integration checks for `GET /api/thread` and `POST /api/thread/sync` in `tests/integration/thread-route.test.ts` covering the thread payload, the comments, the check summary, the workflow runs and the missing-thread path
- [x] T039 [US3] Add integration checks for `GET /api/connection`, `GET /api/contributions` and `GET /api/rate-limits` in `tests/integration/status-routes.test.ts` covering the connected, unauthorized and unreachable paths
- [x] T040 [US3] Add integration checks for `POST /api/notifications/seed` in `tests/integration/seed-route.test.ts` covering the production refusal, the live-data guard and the forced reseed

**Checkpoint**: The suite cannot reach a real account. User Story 3 is independently demonstrable.

---

## Phase 6: User Story 4 - Know which behavior is protected and which is not (Priority: P2)

**Goal**: The coverage view names every part of the application, including the parts with no checks, and the merge-time run fails when coverage drops below the merge base.

**Independent Test**: Run `make test-coverage` and confirm the report lists all 70 source files, then lower the coverage and confirm `make coverage-check` exits non-zero.

### Implementation for User Story 4

- [x] T041 [US4] Configure the coverage block in `vitest.config.mts` with `provider: "v8"`, `include` globs for `app/**`, `lib/**`, `components/**`, `db/**` and `scripts/**`, and the `text`, `html`, `lcov` and `json-summary` reporters
- [x] T042 [US4] Create `scripts/compare-coverage.ts` that reads two `coverage-summary.json` files, compares `total.lines.pct`, prints `pass`, `fail` or `not-evaluable`, and exits `1` only on `fail` and `2` when called incorrectly
- [x] T043 [US4] Add the merge-base coverage step to `.github/workflows/ci.yml`: resolve the merge base, add it as a detached worktree, install and run the coverage suite there with its own database path and the same frozen clock, then run `scripts/compare-coverage.ts` against the two summaries
- [x] T044 [US4] Verify the coverage report lists all 70 source files, including the ones at zero percent, and that the count matches `find app lib components db scripts -type f \( -name '*.ts' -o -name '*.tsx' \) | wc -l`
- [x] T045 [US4] Add a check in `tests/unit/compare-coverage.test.ts` covering the pass, fail, not-evaluable and missing-argument outcomes of `scripts/compare-coverage.ts`

**Checkpoint**: The coverage map is complete and the ratchet works. User Story 4 is independently demonstrable.

---

## Phase 7: User Story 5 - Have the core inbox journeys verified end to end (Priority: P2)

**Goal**: The five core inbox journeys and the three primary views are verified by end-to-end checks against a fixed, deterministic dataset.

**Independent Test**: Break a user journey at the screen level, such as making the filter control not apply its selection, and confirm the end-to-end check for that journey fails.

### Implementation for User Story 5

- [x] T046 [US5] Create `lib/seed-data.ts` exporting `SEED_REPOS` and `buildSeedThreads(apiBase, now)`, with repository identifiers derived by `repoIdForFullName`, `subjectType` always set, `prMerged` set only on pull-request items, and an explicit age ladder that places the recent items in the repositories that are due
- [x] T047 [US5] Refactor `lib/seed.ts` to load its dataset from `lib/seed-data.ts` so the database seeder and the stand-in serve the same threads, and to use `nowMs()` from `lib/clock.ts`
- [x] T048 [US5] Create `scripts/e2e-reset.ts` that drops and recreates the tables in place at `GHN_DB_PATH` and reseeds, never unlinking the file, so the running server does not keep serving a stale inode
- [x] T049 [US5] Rewrite `playwright.config.ts` with the dedicated ports 21140 and 21141, the frozen instant `2026-01-15T12:00:00Z`, `TZ=UTC`, an isolated database path, the stand-in and the application as two `webServer` entries, `workers: 1`, `fullyParallel: false`, and `trace: "retain-on-failure"`
- [x] T050 [US5] Create `tests/e2e/fixtures.ts` extending Playwright's `test` with a `beforeEach` that runs `scripts/e2e-reset.ts`, so every check starts from the identical dataset
- [x] T051 [US5] Rewrite `tests/e2e/inbox.spec.ts` so every assertion is deterministic, replacing each conditional assertion with an exact expected count
- [x] T052 [US5] Add the end-to-end checks for the selection, inspection and triage journeys in `tests/e2e/triage.spec.ts`, including the write journey whose result is visible afterwards
- [x] T053 [US5] Add the end-to-end checks for the repository and rate-limit views in `tests/e2e/views.spec.ts`
- [x] T054 [US5] Verify the end-to-end suite produces two identical verdicts across two consecutive runs

**Checkpoint**: The core journeys are verified end to end. User Story 5 is independently demonstrable.

---

## Phase 8: User Story 6 - Trust that a green local run predicts a green merge (Priority: P3)

**Goal**: The local run and the merge-time run execute the same checks with the same setup, and a check that cannot run is reported rather than silently passed.

**Independent Test**: Point the suite at an unavailable stand-in and confirm the affected checks are reported as not run with a reason, and are not reported as passing.

### Implementation for User Story 6

- [x] T056 [US6] Add the dependency array to the keydown effect in `app/page.tsx` so the listener is not removed and re-added on every render, using `useCallback` for the handler
- [x] T057 [US6] Configure the Vitest reporters so a check that cannot run is reported with its reason and never counted as a pass, and confirm a crashing check does not stop the remaining checks
- [x] T058 [US6] Verify that the local `make test` and the merge-time run execute the same set of checks, and that a check added under `tests/unit/` runs in both without a registration step

**Checkpoint**: Local and merge-time runs agree. User Story 6 is independently demonstrable.

---

## Phase 9: Polish & Cross-Cutting Concerns

**Purpose**: Complete the breadth requirement FR-029, which demands a check for every service action and every business rule the application exposes.

- [x] T059 Extract the pure decision logic from `app/page.tsx` into `lib/inbox-state.ts` and `lib/sync-errors.ts`, moving `nextSelection`, `applyLocalAction`, `nextFocusIndex`, `pollWindow` and `syncErrorMessage`, and move the quick-select rule into `lib/filters.ts` as `selectByQuickFilter`
- [x] T060 Add unit checks in `tests/unit/inbox-state.test.ts` for the extracted functions, covering the selection set arithmetic, the optimistic action for each of the four actions, the focus index arithmetic and the poll window
- [x] T061 Add component checks in `tests/component/inbox-page.test.tsx` for the page's wiring: it fetches and renders the list, a filter click calls `router.replace` with the right query string, Escape closes the drawer, and a bulk action posts to the right endpoint, with `next/navigation` mocked and `fetch` stubbed
- [x] T062 [P] Add component checks in `tests/component/components.test.tsx` for the remaining client components: the notification list, the item menu, the item drawer, the filter sidebar, the bulk bar, the digest section, the repository row and the shortcuts help
- [x] T063 [P] Add unit checks for the remaining business rules in `tests/unit/` covering `lib/clipboard.ts`, `lib/rate-limit-meta.ts`, `lib/contributions.ts` and the remaining branches of `lib/view-state.ts`, `lib/filters.ts`, `lib/digest.ts`, `lib/snooze.ts`, `lib/queue.ts` and `lib/sync.ts`
- [x] T064 [P] Add the missing `GHN_API_BASE` handling to `parsePullCoords` in `lib/github.ts` so the check summary is reachable under the stand-in
- [x] T065 [P] Update `docs/` with a testing guide covering the local commands, the layers, the environment seams and how to add a check
- [x] T066 Run the full validation pass from `specs/004-test-suite/quickstart.md`, including the ten consecutive runs for determinism and the before-and-after comparison of the real database and the real GitHub account

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies, can start immediately
- **Foundational (Phase 2)**: Depends on Setup completion, BLOCKS all user stories
- **User Stories (Phase 3 to 8)**: All depend on Foundational completion
  - User Story 1, 2 and 3 are P1 and can be worked on in parallel
  - User Story 4 and 5 are P2 and depend on the stand-in from User Story 3
  - User Story 6 is P3
- **Polish (Phase 9)**: Depends on all desired user stories being complete

### User Story Dependencies

- **User Story 1 (P1)**: Starts after Foundational. No dependency on another story
- **User Story 2 (P1)**: Starts after Foundational. Depends on User Story 1 for the `make test` target it invokes
- **User Story 3 (P1)**: Starts after Foundational. The stand-in it produces is consumed by User Story 5
- **User Story 4 (P2)**: Starts after Foundational. Depends on User Story 1 for the coverage target
- **User Story 5 (P2)**: Starts after Foundational. Depends on User Story 3 for the stand-in
- **User Story 6 (P3)**: Starts after Foundational. Depends on User Story 1 and 2

### Within Each User Story

- Tests are written and must fail before the implementation they cover
- Models before services, services before endpoints
- The seam changes in Phase 2 land before the checks that depend on them

### Parallel Opportunities

- All Setup tasks marked `[P]` can run in parallel
- The four seam groups in Phase 2 that touch different files can run in parallel: `lib/clock.ts`, `db/client.ts` with `scripts/push.ts`, `lib/github.ts` with `lib/rate-limits.ts`, `lib/contributions.ts`
- All test files in the same story marked `[P]` can run in parallel
- User Stories 1, 2 and 3 can be worked on in parallel once Foundational completes
- The breadth checks in Phase 9 marked `[P]` can run in parallel

---

## Parallel Example: User Story 3

```bash
# The stand-in and its contract check
Task: "Create tests/support/github-stand-in.ts"
Task: "Write a contract check for the GitHub stand-in in tests/integration/github-stand-in.test.ts"

# The route checks, each in its own file
Task: "Add integration checks for GET /api/notifications in tests/integration/notifications-route.test.ts"
Task: "Add integration checks for GET /api/repositories and PATCH /api/repositories/[id] in tests/integration/repositories-route.test.ts"
Task: "Add integration checks for POST /api/notifications/bulk in tests/integration/bulk-route.test.ts"
Task: "Add integration checks for POST /api/sync in tests/integration/sync-route.test.ts"
```

---

## Implementation Strategy

### MVP First (User Story 1 only)

1. Complete Phase 1: Setup
2. Complete Phase 2: Foundational, this is the critical path
3. Complete Phase 3: User Story 1
4. **STOP and VALIDATE**: run `make test` and confirm the verdict and the layer report
5. Continue with the remaining stories

### Incremental Delivery

1. Setup plus Foundational, the foundation is ready
2. User Story 1, one command runs everything, demonstrable
3. User Story 3, the suite can no longer touch a real account
4. User Story 2, the merge gate exists
5. User Story 4, the coverage map and the ratchet
6. User Story 5, the core journeys are verified end to end
7. User Story 6, local and merge-time parity
8. Polish, the breadth requirement FR-029

### Parallel Team Strategy

With multiple developers:

1. The team completes Setup and Foundational together
2. Developer A takes User Story 1 and 6, the command surface and the parity
3. Developer B takes User Story 3 and 5, the stand-in and the journeys
4. Developer C takes User Story 2 and 4, the CI gate and the coverage ratchet
5. The stories complete and integrate independently

---

## Notes

### Completion

All 65 tasks are done. The suite runs 639 checks across the three fast layers and 25 across the end-to-end layer.

The validation pass confirmed: ten consecutive runs of the fast layers give identical verdicts, three consecutive end-to-end runs agree, no `data/` directory is created, and the `gh` credential helper is never invoked. The coverage view names all 70 source files, 10 of which have no check yet.

A review of the finished suite, with mutations applied to the implementation to see which checks noticed, found five checks that passed without proving anything. All five are fixed and each fix is verified against the mutation that used to slip through. The one production defect it surfaced is parked as issue 35.

One requirement is only half met. FR-006 asks a failing automated run to block the merge. The workflow runs on every pull request and a failing run shows red, but `main` carries no required status checks, so GitHub still offers the merge button. The two check contexts that would close the gap are named in `research.md`, under "The coverage gate is advisory, not enforced".


- `[P]` tasks mean different files with no dependencies
- `[Story]` labels map a task to a user story for traceability
- Every user story should be independently completable and testable
- Verify the checks fail before implementing what they cover
- Commit after each task or logical group
- Stop at any checkpoint to validate a story independently
- The three spikes from `research.md` run first: happy-dom with React 19 under Vitest on Node, the `node:sqlite` proxy against the full schema, and coverage instrumentation of the `globalThis`-cached database client
