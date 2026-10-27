# Tasks: Single-Source Inbox List

**Input**: Design documents from `specs/006-single-source-list/`

**Prerequisites**: plan.md (required), spec.md, research.md, data-model.md, contracts/, quickstart.md

**Tests**: Included per story. Constitution principle II mandates TDD: tests fail first, then implement. New behavior gets coverage at its layer. Regression anchors from the backbone work stay green.

**Organization**: Grouped by user story. Each story is independently testable. Day-session anchors already committed: revive-survives-sync unit test, all-view mark-in-place unit plus component tests.

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Baseline confirmed before any story work

- [X] T001 Confirm baseline gates green: typecheck, lint, unit, integration, component
- [X] T002 [P] Confirm spec artifacts present in specs/006-single-source-list (spec, plan, research, data-model, contracts, quickstart)

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Shared understanding that MUST complete before ANY user story work

**CRITICAL**: No user story work can begin until this phase is complete

- [X] T003 Audit existing anchors against stories: revive unit test in tests/unit/sync.test.ts, all-view tests in tests/unit/inbox-state.test.ts plus tests/component/inbox-page.test.tsx, P2 guard in lib/sync.ts
- [X] T004 [P] Record parallel file map in specs/006-single-source-list/red-eye-ledger.md so parallel tasks never share files

**Checkpoint**: Foundation ready - user story implementation can now begin

---

## Phase 3: User Story 1 - Triage without flicker (Priority: P1) MVP backbone

**Goal**: One shared list. Removed rows never return through any refresh path.

**Independent Test**: 20 items done on throttled connection with mid-triage manual refresh, zero returns across 3 runs.

### Tests for User Story 1 (TDD: write FIRST, confirm FAIL, then implement)

- [X] T005 [P] [US1] Component test in tests/component/inbox-page.test.tsx: pre-commit refetch resolving while bulk is pending keeps removed rows absent
- [X] T006 [P] [US1] Component test in tests/component/inbox-page.test.tsx: mid-triage manual refresh with pre-commit response keeps removed rows absent

### Implementation for User Story 1

- [X] T007 [US1] Remove local items working copy in app/page.tsx, derive list, selection, focus, drawer and rollback from the shared cache (depends on T005, T006)
- [X] T008 [US1] Hold previous cache data while a bulk mutation is pending in lib/queries.ts so pre-commit responses cannot overwrite optimistic rows (depends on T005, T006)
- [X] T009 [US1] Remove the extra refetch after repo-wide done in app/page.tsx, keep onSettled invalidate as the single confirm path
- [X] T010 [US1] Run gates green: typecheck, lint, unit, integration, component

**Checkpoint**: US1 fully functional and independently testable

---

## Phase 4: User Story 2 - All-view done stays visible (Priority: P1)

**Goal**: All-view done marks rows in place, never flashes out and back.

**Independent Test**: 2 items done in all view with gated response, rows visible throughout and after.

### Tests for User Story 2 (anchors exist, verify plus extend)

- [X] T011 [P] [US2] Verify all-view mark-in-place tests green in tests/unit/inbox-state.test.ts plus tests/component/inbox-page.test.tsx
- [X] T012 [P] [US2] Component test in tests/component/inbox-page.test.tsx: all-view done rows show done state while bulk is pending

### Implementation for User Story 2

- [X] T013 [US2] Confirm optimistic helper covers unsubscribe in all view in lib/inbox-state.ts, run gates green

**Checkpoint**: US1 AND US2 both work independently

---

## Phase 5: User Story 3 - Offline triage and revive survive sync (Priority: P2)

**Goal**: Unpushed intent and revives survive every sync cycle; clean rows converge to remote.

**Independent Test**: Offline done plus one revive plus full sync, hidden stays hidden, revived stays revived.

### Tests for User Story 3

- [X] T014 [P] [US3] Verify revive-survives-full-sync unit test green in tests/unit/sync.test.ts
- [X] T015 [P] [US3] Integration test in tests/integration/: offline done with queued drain keeps rows hidden across sync
- [X] T016 [P] [US3] Integration test in tests/integration/: missing thread on full sync becomes done, clean read follows remote

### Implementation for User Story 3

- [X] T017 [US3] Confirm precedence paths in lib/sync.ts plus app/api/sync/route.ts honor queued ids and localUnread, run gates green (depends on T015, T016)

**Checkpoint**: US1, US2 AND US3 all work independently

---

## Phase 6: User Story 4 - Queued versus settled reads distinctly (Priority: P2)

**Goal**: Queued and busy never share wording; queued labels clear exactly on confirmation.

**Independent Test**: Offline triage shows queued labels on every unpushed hidden row, clearing only on confirm.

### Tests for User Story 4 (TDD)

- [X] T018 [P] [US4] Component test: queued indication present on unpushed hidden rows in tests/component/
- [X] T019 [P] [US4] Component test: busy wording distinct from queued wording in tests/component/

### Implementation for User Story 4

- [X] T020 [US4] Implement queued indication plus copy in components/inbox/ (depends on T018, T019)
- [X] T021 [US4] Wire bulk response queued and remote fields into row syncing UI in lib/queries.ts plus components/inbox/ (depends on T018, T019)
- [X] T022 [US4] Run gates green

**Checkpoint**: US1 through US4 all work independently

---

## Phase 7: User Story 5 - Mute and rhythm place rows predictably (Priority: P3)

**Goal**: Mute beats rhythm, placement moves rows only, repo-wide done states its quiet clearing.

**Independent Test**: Mute plus rhythm plus promote moves place rows correctly with no done flips.

### Tests for User Story 5 (TDD)

- [X] T023 [P] [US5] Integration test: mute beats rhythm, rhythm and snooze never flip done state
- [X] T024 [P] [US5] Component test: repo-wide done on quiet repo states hidden-pending clearing

### Implementation for User Story 5

- [X] T025 [US5] Implement placement precedence plus repo-wide done copy in app/page.tsx, components/inbox/ and app/api/notifications/route.ts (depends on T023, T024)
- [X] T026 [US5] Run gates green

**Checkpoint**: US1 through US5 all work independently

---

## Phase 8: User Story 6 - Pin repos on the repos page (Priority: P3)

**Goal**: Pinned section above Repositories, everything else identical.

**Independent Test**: Pin and unpin with search, counts and inbox verified unchanged.

### Tests for User Story 6 (TDD)

- [ ] T027 [P] [US6] Integration test: pin column migration, PATCH pin validation, GET shape in tests/integration/
- [ ] T028 [P] [US6] Component test: pinned section above, search filters both, empty hidden, counts unchanged

### Implementation for User Story 6

- [ ] T029 [US6] Implement pin column in db/schema.ts plus db/ensure-schema.ts migration (depends on T027)
- [ ] T030 [US6] Implement GET shape plus PATCH pin in app/api/repositories/route.ts plus app/api/repositories/[id]/route.ts (depends on T027)
- [ ] T031 [US6] Implement toggle in components/repos/repo-row.tsx, grouping in app/repos/page.tsx, patch shape in lib/queries.ts (depends on T028)
- [ ] T032 [US6] Run gates green

**Checkpoint**: All user stories independently functional

---

## Phase 9: Polish & Cross-Cutting Concerns

**Purpose**: Lock the backbone and leave the tree releasable

- [ ] T033 Run quickstart.md validation end to end per specs/006-single-source-list/quickstart.md
- [ ] T034 [P] Drift check docs/item-lifecycle.md against implementation, update guarantees on any deviation
- [ ] T035 Full gates plus coverage ratchet check, update red-eye ledger with verdicts

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies - can start immediately
- **Foundational (Phase 2)**: Depends on Setup - BLOCKS all user stories
- **User Stories (Phases 3-8)**: Depend on Foundational, run sequentially P1 to P3 for this single-threaded run
- **Polish (Phase 9)**: Depends on all desired stories complete

### User Story Dependencies

- **US1 (P1)**: After Foundational. No story dependencies. Backbone core.
- **US2 (P1)**: After Foundational. Anchors already committed; verify plus extend.
- **US3 (P2)**: After Foundational. Guard anchor already committed; add integration coverage.
- **US4 (P2)**: After US3. Surfacing only, no state changes.
- **US5 (P3)**: After US3. Placement only, no state changes.
- **US6 (P3)**: After Foundational. Additive schema plus UI, disjoint files from US1-US5.

### Parallel Opportunities

- T002 plus T004 run in parallel (different files, no dependencies).
- Within a story, test tasks marked [P] run in parallel (different files).
- US6 implementation tasks T029, T030, T031 touch disjoint files and can parallelize once its tests exist.
- Single-threaded overnight run executes sequentially in priority order regardless.

---

## Implementation Strategy

### MVP First (Backbone: US1 plus US2)

1. Complete Phase 1: Setup
2. Complete Phase 2: Foundational
3. Complete Phase 3: US1 (single source plus gate)
4. Complete Phase 4: US2 (all-view lock)
5. **STOP and VALIDATE**: throttled triage plus all-view flash checks independently

### Incremental Delivery

1. Setup plus Foundational, then US1 plus US2 as the backbone MVP
2. Add US3 survival coverage, then US4 surfacing
3. Add US5 placement, then US6 pin
4. Each story adds value without breaking previous stories

---

## Notes

- [P] tasks touch disjoint files with no dependency on incomplete tasks.
- [Story] labels map each task to its spec user story.
- Tests fail first per constitution principle II, then implement.
- Commit after each task or logical group with conventional messages.
- Existing anchors (T011, T013, T014 equivalents) are verified, not rebuilt.
