# Tasks: Persist Filter Selection

**Input**: Design documents from `/specs/008-persist-filter-selection/`
**Prerequisites**: plan.md (required), spec.md (required), research.md, data-model.md, contracts/filter-memory.md, quickstart.md

**Tests**: Unit tests for pure storage helpers are required by constitution II; e2e for the restore journey is required (browser localStorage cannot be covered in jsdom).

## Format: `[ID] [P?] [Story?] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (e.g., US1, US2, US3)

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Confirm baseline before changes

- [ ] T001 Verify clean baseline: `git status --short`, `bun run typecheck`, existing `tests/unit/view-state*.test.ts` pass
- [ ] T002 [P] Read `lib/view-state.ts`, `app/page.tsx` filter wiring, and `tests/e2e/inbox.spec.ts` filter selectors to lock integration points

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Storage helpers all stories depend on; MUST complete before page wiring

**⚠️ CRITICAL**: No user story work can begin until this phase is complete

- [ ] T010 Add `INBOX_FILTERS_KEY`, `loadInboxFilters`, `saveInboxFilters` to `lib/view-state.ts` with versioned JSON envelope, same allow-lists as `parseInboxFilters`, try/catch fail-open
- [ ] T011 [P] [US3] Unit tests in `tests/unit/view-state-storage.test.ts` (or `view-state.test.ts`): round-trip save/load, corrupt JSON returns null, wrong version returns null, unknown age/state fall back, throwing storage returns null / does not throw on save
- [ ] T012 Run `bun run test:unit -- tests/unit/view-state*.test.ts` and `bun run typecheck`; fix until green

**Checkpoint**: Foundation ready - user story implementation can now begin in parallel

## Phase 3: User Story 1 - Reopen with last filters (Priority: P1) 🎯 MVP

**Goal**: Bare `/` entry restores last filters with no click

**Independent Test**: Set non-default filters, reload `/` bare, assert URL + sidebar + selects match stored set

### Implementation for User Story 1

- [ ] T020 [US1] Persist on change in `app/page.tsx`: save parsed `filters` to storage whenever the explicit query string is non-empty (effect watching `searchParams`/`filters`)
- [ ] T021 [US1] Restore on bare entry in `app/page.tsx`: mount effect, if `searchParams.toString() === ""` and stored set is non-default, `router.replace("/" + serializeInboxFilters(stored), {scroll:false})`
- [ ] T022 [US1] Verify hydration safety: server render stays defaults, no conditional hooks, restore runs client-only after mount

**Checkpoint**: US1 fully functional and testable independently (manual quickstart steps 2-4 pass)

## Phase 4: User Story 2 - Explicit URL wins (Priority: P1)

**Goal**: Deep links and in-app changes render verbatim and become the new memory

**Independent Test**: With different set stored, open explicit URL, verify render, then open `/` bare and verify explicit set is now remembered

### Implementation for User Story 2

- [ ] T030 [US2] Ensure every filter mutation path (`setFilters`, `selectType`, `selectRepo`, `menuAction select-repo`, mark-done navigation) flows through the persisting effect so explicit choices overwrite storage
- [ ] T031 [US2] Guard restore so it never fires on non-empty query or on in-session back/forward (bare-entry check only, single-shot ref to avoid loops)

**Checkpoint**: US1 AND US2 both work (quickstart step 5 passes, no hijack)

## Phase 5: User Story 3 - Corrupt/stale memory never breaks (Priority: P2)

**Goal**: Fail open to defaults, stay triage-capable

**Independent Test**: Seed garbage/unknown/stale-repo storage, open `/` bare, verify defaults/empty-state and recovery

### Implementation for User Story 3

- [ ] T040 [US3] Per-field fallback in `loadInboxFilters` already covers this; add e2e case in new spec seeding corrupt + unknown-age + unknown-repo payloads and asserting defaults render
- [ ] T041 [US3] Verify private-mode parity: throwing `localStorage` keeps inbox URL-only with no error screen (unit covers helpers; e2e optionally stubs throw)

**Checkpoint**: All user stories independently functional

## Phase 6: E2E + Regression

**Purpose**: Browser coverage for the journey constitution II requires

- [ ] T050 Create `tests/e2e/inbox-filter-persistence.spec.ts`: (a) set filter, reload bare, assert restore; (b) explicit URL wins then becomes memory; (c) corrupt storage falls back to defaults
- [ ] T051 Run new e2e plus existing filter suites (`inbox.spec.ts`, `views.spec.ts`, `triage.spec.ts`, `palette-scopes.spec.ts`, `repo-multi-select.spec.ts`); fix until green

## Phase N: Polish & Cross-Cutting Concerns

**Purpose**: Gates and docs

- [ ] T060 Run full local gate: `bun run typecheck`, `bun run lint`, `bun run test:unit`, `bun run test:integration`, `bun run test:component`
- [ ] T061 Update `app/help/page.tsx` filtering tip if it names filter defaults (only if stale; otherwise no doc change)

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies - can start immediately
- **Foundational (Phase 2)**: Depends on Setup completion - BLOCKS all user stories
- **User Stories (Phase 3+)**: All depend on Foundational phase completion
  - US1 then US2 sequentially (same file, same effects)
  - US3 robustness mostly covered by foundational validation + e2e cases
- **E2E + Polish**: Depend on all desired user stories being complete

### Within Each User Story

- Unit tests for helpers (T011) written FIRST, fail before T010 implementation
- Helpers before page wiring
- Page wiring before e2e
- Story complete before next priority

### Parallel Opportunities

- T002 reads can run in parallel with T001 baseline
- T011 test additions can be drafted alongside T010 (different sections, same files - coordinate to avoid conflict; prefer sequential)
- E2E cases within T050 can run in parallel once wiring lands

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Complete Setup + Foundational (T001, T002, T010, T011, T012)
2. Complete US1 wiring (T020, T021, T022)
3. **STOP and VALIDATE**: manual quickstart steps 2-4 + unit suite green
4. Deploy/demo if ready

### Incremental Delivery

1. Setup + Foundational -> foundation ready
2. Add US1 -> test independently (bare restore works)
3. Add US2 -> test independently (explicit wins, memory updates)
4. Add US3 cases -> test independently (corrupt fallback)
5. E2E + gates -> ready for `/speckit.ext.finalize` -> PR

## Notes

- Exact files: `lib/view-state.ts`, `app/page.tsx`, `tests/unit/view-state-storage.test.ts`, `tests/e2e/inbox-filter-persistence.spec.ts`
- Commit after each phase; stop at any checkpoint to validate story independently
- No URL/API/DB change; keep diff small and reviewable
