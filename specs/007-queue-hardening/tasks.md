# Tasks: Queue Hardening

**Input**: Design documents from `/specs/007-queue-hardening/`

**Prerequisites**: plan.md (required), spec.md (required for user stories), research.md, data-model.md, contracts/

**Tests**: Constitution mandates test-first with the offline suite. Test tasks are included per story. Write them first and confirm they FAIL before implementation.

**Organization**: Tasks grouped by user story. Each story is an independently testable increment.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (e.g., US1, US2, US3)
- Include exact file paths in descriptions

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Baseline before touching the backbone

- [X] T001 [P] Record green baseline by running queue suites in `tests/unit/queue.test.ts`, `tests/unit/queue-retry.test.ts`, `tests/unit/writeback.test.ts`, `tests/unit/bulk-writeback.test.ts`
- [X] T002 [P] Confirm dual-DDL ownership in `db/schema.ts` and `db/ensure-schema.ts` so every later DDL task changes both files together

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Shared mechanical changes every drain path needs

**⚠️ CRITICAL**: No user story work can begin until this phase is complete

- [X] T003 [P] Add `(thread_id, action)` index declaration in `db/schema.ts` using Drizzle `index()`
- [X] T004 [P] Mirror the index in `db/ensure-schema.ts` with `CREATE INDEX IF NOT EXISTS`
- [X] T005 Replace full-row depth scan with `COUNT(*)` in `lib/queue.ts` keeping the `queueDepth(db)` signature
- [X] T006 Narrow pending-id reads to required columns only in `lib/queue.ts` (`getQueuedThreadIds` and drain lookups)

**Checkpoint**: Foundation ready - user story implementation can now begin in parallel

---

## Phase 3: User Story 1 - Retries stop clogging the queue (Priority: P1) 🎯 MVP

**Goal**: Deleted threads drop after one drain; retryable failures cap at 10 attempts with reason preserved

**Independent Test**: Seed one 404 thread plus one good thread, run sync, confirm the good thread drains while the bad thread is dropped and never reappears; seed a 500-failing row ten times and confirm it stops being retried with `lastError` intact

### Tests for User Story 1

> **NOTE: Write these tests FIRST, ensure they FAIL before implementation**

- [X] T007 [P] [US1] Terminal-drop test in `tests/unit/writeback.test.ts` (404/410 row deleted, absent on next drain)
- [X] T008 [P] [US1] Attempt-cap test in `tests/unit/queue-retry.test.ts` (10 failures excludes row from selection, preserves `lastError`)

### Implementation for User Story 1

- [X] T009 [US1] Delete rows on terminal 404/410 in both drain paths in `lib/queue.ts` (depends on T007)
- [X] T010 [US1] Enforce 10-attempt cap and exclude capped rows from drain selection in `lib/queue.ts` (depends on T008)
- [X] T011 [US1] Cover mixed good plus poison drain in `tests/integration/sync-route.test.ts`

**Checkpoint**: At this point, User Story 1 should be fully functional and testable independently

---

## Phase 4: User Story 2 - Queue stays fast at 1000+ items (Priority: P2)

**Goal**: Depth and pending checks stay under 500ms at 1500 rows; per-thread drain lookups use the new index

**Independent Test**: Seed 1500 queued rows and confirm depth plus pending-id checks complete within budget without loading full rows

### Tests for User Story 2

- [X] T012 [P] [US2] Perf regression test in `tests/unit/queue.test.ts` (1500 rows, depth plus lookup budget)

### Implementation for User Story 2

- [X] T013 [US2] Verify per-thread drain lookup in `lib/queue.ts` selects `id` and `attempts` only over the indexed path (depends on T012)
- [X] T014 [US2] Keep sync pending checks on narrowed queries in `app/api/sync/route.ts`

**Checkpoint**: At this point, User Stories 1 AND 2 should both work independently

---

## Phase 5: User Story 3 - Retry counts stay accurate under overlap (Priority: P2)

**Goal**: Overlapping drains never lose attempt increments

**Independent Test**: Simulate two overlapping failing drains on one row and confirm the count rises by two, not one

### Tests for User Story 3

- [X] T015 [P] [US3] Concurrent-failure count test in `tests/unit/queue-retry.test.ts` (two overlapping failures add two)

### Implementation for User Story 3

- [X] T016 [US3] Switch both failure writes to SQL-side `attempts + 1` in `lib/queue.ts` (depends on T015)

**Checkpoint**: Retry counting is commutative under overlap

---

## Phase 6: User Story 4 - Same thread never queues twice (Priority: P2)

**Goal**: Small-path re-enqueue replaces instead of duplicating, matching the bulk path

**Independent Test**: Enqueue the same thread and action twice through the small path and confirm one row with newest reason and `attempts 0`

### Tests for User Story 4

- [X] T017 [P] [US4] Small-path duplicate test in `tests/unit/bulk-writeback.test.ts` (double enqueue yields one row)

### Implementation for User Story 4

- [X] T018 [US4] Give `enqueueWriteback` in `lib/queue.ts` delete-then-insert replacement semantics (depends on T017)
- [X] T019 [US4] Keep small bulk and unsubscribe writers on the deduped path in `app/api/notifications/bulk/route.ts`

**Checkpoint**: Repeated offline retries never multiply rows

---

## Phase 7: User Story 5 - Overlapping drains do not double-call GitHub (Priority: P3)

**Goal**: Background plus sync drains over the same set send at most one remote write per thread per cycle; sync response exposes health

**Independent Test**: Gate the remote call, start background and sync drains over 100 ids, count at most 100 remote writes; sync JSON carries depth, oldest age, and reason breakdown that sums to depth

### Tests for User Story 5

- [X] T020 [P] [US5] Overlap single-call test in `tests/unit/queue.test.ts` (gated remote, 100 ids, at most 100 writes; placed at lib level where both drains run directly)

### Implementation for User Story 5

- [X] T021 [US5] Serialize `drainWritebacks` and `drainQueue` behind a module-level promise-chain mutex with re-read in `lib/queue.ts` (depends on T020)
- [X] T022 [US5] Add `queueOldestAgeMs` and `queueReasonBreakdown` alongside `queueDepth` in `app/api/sync/route.ts` per `specs/007-queue-hardening/contracts/queue-health-api.md`

**Checkpoint**: All user stories should now be independently functional

---

## Phase 8: Polish & Cross-Cutting Concerns

**Purpose**: Validation and gates across all stories

- [X] T023 Run `specs/007-queue-hardening/quickstart.md` validation scenarios end to end
- [X] T024 [P] Run full gates: `bun run typecheck`, `bun run lint`, unit, integration, and component suites per `package.json`
- [X] T025 [P] Update queue lifecycle wording in `docs/item-lifecycle.md` only if behavior described there changed

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies - can start immediately
- **Foundational (Phase 2)**: Depends on Setup completion - BLOCKS all user stories
- **User Stories (Phase 3+)**: All depend on Foundational phase completion
  - User stories can then proceed in parallel (if staffed)
  - Or sequentially in priority order (P1 → P2 → P3)
- **Polish (Final Phase)**: Depends on all desired user stories being complete

### User Story Dependencies

- **User Story 1 (P1)**: Can start after Foundational (Phase 2) - No dependencies on other stories
- **User Story 2 (P2)**: Can start after Foundational (Phase 2) - Builds on the index plus count foundation, independently testable via its perf test
- **User Story 3 (P2)**: Can start after Foundational (Phase 2) - Touches the same failure writes as US1, so run its test against latest `lib/queue.ts`
- **User Story 4 (P2)**: Can start after Foundational (Phase 2) - Independent writer change, verify against US1 cap behavior
- **User Story 5 (P3)**: Can start after Foundational (Phase 2) - Mutex wraps all drain paths, so validate last when other drain changes are in

### Within Each User Story

- Tests MUST be written and FAIL before implementation
- Index and count before drain logic that depends on them
- Core `lib/queue.ts` change before route wiring
- Story complete before moving to next priority

### Parallel Opportunities

- T001 and T002 run in parallel (baseline run versus doc check)
- T003 and T004 run in parallel (different files: `db/schema.ts` versus `db/ensure-schema.ts`)
- T007 and T008 run in parallel (different test files)
- T012 test work runs in parallel with US1 implementation once Foundational is done
- T015, T017, T020 test tasks run in parallel (three different test files)
- T024 gate run and T025 doc touch-up run in parallel

---

## Parallel Example: User Story 1

```bash
# Launch both US1 tests together (different files):
Task: "Terminal-drop test in tests/unit/writeback.test.ts"
Task: "Attempt-cap test in tests/unit/queue-retry.test.ts"
```

---

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Complete Phase 1: Setup
2. Complete Phase 2: Foundational (CRITICAL - blocks all stories)
3. Complete Phase 3: User Story 1
4. **STOP and VALIDATE**: Seed good plus 404 rows, confirm drop plus cap behavior
5. Deploy/demo if ready

### Incremental Delivery

1. Complete Setup + Foundational → Foundation ready
2. Add User Story 1 → Test independently → Deploy/Demo (MVP!)
3. Add User Story 2 → Perf test → Deploy/Demo
4. Add User Story 3 → Concurrency test → Deploy/Demo
5. Add User Story 4 → Dedupe test → Deploy/Demo
6. Add User Story 5 → Overlap plus health → Deploy/Demo
7. Each story adds value without breaking previous stories

---

## Notes

- [P] tasks = different files, no dependencies
- [Story] label maps task to specific user story for traceability
- Each user story is independently completable and testable
- Verify tests fail before implementing
- Commit after each task or logical group
- Stop at any checkpoint to validate story independently
