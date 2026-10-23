# Tasks: Client State Management

**Input**: Design documents from `specs/005-client-state-management/`
**Prerequisites**: plan.md (required), spec.md (required for user stories), research.md, data-model.md, contracts/

**Tests**: Tests are not separately requested in the spec. Validation uses `quickstart.md` scenarios plus existing `bun run test:unit`, `test:component`, `typecheck`, and `lint`. New pure modules get unit coverage via existing vitest projects.

**Organization**: Tasks grouped by user story for independent implementation and testing.

**Decisions applied from analysis (one-by-one, all approved)**: zustand UI-only confirmed (H1), `useThreadDetails` added (H2), timeout policy task added (H3), keyboard regression task added (H4), same-file `[P]` markers removed (H5).

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (e.g., US1, US2)
- Include exact file paths in descriptions

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Add client cache dependencies and verify baseline

- [X] T001 Add `@tanstack/react-query` and `zustand` dependencies in `package.json`
- [X] T002 [P] Verify Next 15 plus React 19 compatible versions and lockfile in `bun.lock`
- [X] T003 [P] Verify query defaults and UI-store scope are recorded in `specs/005-client-state-management/research.md`

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Shared provider, key factory, and hook shells that all stories depend on

**⚠️ CRITICAL**: No user story work can begin until this phase is complete

- [X] T004 Create query key factory from URL filters in `lib/query-keys.ts`
- [X] T005 [P] Extend `QueryClientProvider` with stable client in `app/providers.tsx`
- [X] T006 [P] Create UI-only zustand store shell with typed actions in `lib/ui-store.ts`
- [X] T007 Create shared query hooks shell in `lib/queries.ts`
- [X] T008 Define timeout plus abort plus retry policy for queries and mutations in `lib/queries.ts`
- [X] T009 [P] Add `renderWithQuery` test helper in `tests/component/support/render-with-query.tsx`

**Checkpoint**: Foundation ready - user story implementation can now begin in parallel

---

## Phase 3: User Story 1 - Consistent data everywhere (Priority: P1) 🎯 MVP

**Goal**: Inbox and palette share one notifications and repositories cache with no duplicate fetches and no list flash on filter change

**Independent Test**: Load `/`, open palette via quickstart step 1, confirm zero new `/api/notifications` fetch within 30s and identical counts. Toggle filters and confirm prior list stays visible with refreshing indicator and only latest result wins.

### Implementation for User Story 1

- [X] T010 [P] [US1] Implement `useNotifications` with `keepPreviousData` in `lib/queries.ts`
- [X] T011 [US1] Implement `useRepositories` shared entry in `lib/queries.ts`
- [X] T012 [US1] Replace manual `load` plus `reqRef` with `useNotifications` in `app/page.tsx`
- [X] T013 [US1] Replace independent palette fetches with shared queries in `components/search/command-palette.tsx`
- [X] T014 [US1] Remove `loadedAt` 30s ad-hoc cache in favor of `staleTime` in `components/search/command-palette.tsx`
- [X] T015 [US1] Implement `useThreadDetails` query for drawer content in `lib/queries.ts`
- [X] T016 [US1] Replace direct `/api/thread` fetch with `useThreadDetails` in `components/inbox/item-drawer.tsx`

**Checkpoint**: At this point, User Story 1 should be fully functional and testable independently

---

## Phase 4: User Story 2 - Instant triage that never gets stuck (Priority: P1)

**Goal**: Optimistic bulk and per-thread actions with snapshot rollback and derived busy state

**Independent Test**: Triage 5 done plus 2 read plus 1 unread per quickstart step 3. Confirm instant row change, persistence after refetch, restore with message on blocked bulk request, and re-enabled controls.

### Implementation for User Story 2

- [X] T017 [US2] Implement `useBulkAction` optimistic mutation reusing `applyLocalAction` in `lib/queries.ts`
- [X] T018 [US2] Implement `useThreadSync` per-row mutation in `lib/queries.ts`
- [X] T019 [US2] Replace `busyCount` plus `fetchWithTimeout` plus manual rollback with mutation state in `app/page.tsx`
- [X] T020 [US2] Wire per-row `syncingIds` from mutation variables in `components/inbox/notification-list.tsx`

**Checkpoint**: At this point, User Stories 1 AND 2 should both work independently

---

## Phase 5: User Story 3 - Truthful refresh and connection (Priority: P2)

**Goal**: Centralized sync flow agreeing on last-synced time, countdown, stale, and disconnected states

**Independent Test**: Refresh per quickstart step 4, confirm disabled window with countdown, then blocked sync shows readable cache with stale plus retry and expired auth shows disconnected path.

### Implementation for User Story 3

- [X] T021 [P] [US3] Implement `useConnection` shared query in `lib/queries.ts`
- [X] T022 [US3] Implement `useSyncFlow` refresh plus poll countdown in `lib/queries.ts`
- [X] T023 [US3] Replace `nowMs` interval plus `pollWindow` atoms plus `conn` effect with `useSyncFlow` in `app/page.tsx`
- [X] T024 [US3] Derive brand-mark sync indicator from query fetching state in `components/brand-mark.tsx`

**Checkpoint**: Poll, stale, and connection states agree from one source

---

## Phase 6: User Story 4 - Typed global UI actions (Priority: P2)

**Goal**: Replace `ghn:*` CustomEvent bus with typed store actions behaving identically from keyboard, button, and palette

**Independent Test**: Trigger palette, sidebar, help, thread open, refresh, and scroll-top from all entry points per quickstart step 5. Confirm identical navigation and drawer behavior on `/` versus `/repos`.

### Implementation for User Story 4

- [X] T025 [P] [US4] Implement sidebar plus palette plus help plus drawer actions in `lib/ui-store.ts`
- [X] T026 [US4] Replace `ghn:toggle-sidebar` plus `ghn:show-help` listeners with store in `components/app-shell.tsx`
- [X] T027 [US4] Replace `ghn:open-palette` plus `ghn:open-thread` dispatch and listeners with store in `components/search/command-palette.tsx`
- [X] T028 [US4] Replace `ghn:open-thread` plus `ghn:refresh` plus `ghn:scroll-top` listeners with store in `app/page.tsx`

**Checkpoint**: Zero untyped event-string mismatches in review

---

## Phase 7: User Story 5 - Repos and settings share behavior (Priority: P3)

**Goal**: Repos, settings, and rate-limits reuse the same queries with in-place updates and consistent loading and error states

**Independent Test**: Change rhythm and snooze per quickstart step 6. Confirm in-place row update on success and revert with error on blocked PATCH without full-list flash.

### Implementation for User Story 5

- [X] T029 [P] [US5] Replace manual load with `useRepositories` plus optimistic rhythm patch in `app/repos/page.tsx`
- [X] T030 [P] [US5] Replace manual load with shared query pattern in `app/settings/page.tsx`
- [X] T031 [P] [US5] Replace manual load with shared query pattern in `app/rate-limits/page.tsx`

**Checkpoint**: All user stories should now be independently functional

---

## Phase 8: Polish & Cross-Cutting Concerns

**Purpose**: Cleanup, verification, and handoff readiness

- [X] T032 [P] Remove dead `CustomEvent` names plus `announceSync` plus `reqRef` plus `loadedRef` plus `busyCount` helpers across `app/`, `components/`, and `lib/`
- [X] T033 [P] Run `bun run typecheck` and `bun run lint` and fix client-state issues
- [X] T034 [P] Run `bun run test:unit` plus `bun run test:component` for query and store regressions
- [X] T035 Run keyboard plus focus plus theme regression pass over `app/page.tsx` and `components/inbox/`
- [X] T036 Run `specs/005-client-state-management/quickstart.md` validation end to end
- [X] T037 [P] Verify bundle impact of Query plus zustand via `bun run build`

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
- **User Story 2 (P1)**: Can start after Foundational (Phase 2) - Builds on US1 cache entries but independently testable via triage flow
- **User Story 3 (P2)**: Can start after Foundational (Phase 2) - May reuse US1 queries but independently testable via refresh flow
- **User Story 4 (P2)**: Can start after Foundational (Phase 2) - May integrate with US1 through US3 triggers but independently testable via action matrix
- **User Story 5 (P3)**: Can start after Foundational (Phase 2) - Reuses US1 query entries but independently testable via repos page

### Within Each User Story

- Queries before consumers within the same file chain
- Core implementation before integration
- Story complete before moving to next priority

### Parallel Opportunities

- All Setup tasks marked [P] can run in parallel
- All Foundational tasks marked [P] can run in parallel (within Phase 2)
- Once Foundational phase completes, all user stories can start in parallel (if team capacity allows)
- T029-T031 repos, settings, and rate-limits refactors can run in parallel
- Typecheck, unit tests, and bundle check (T033-T034, T037) can run in parallel

---

## Parallel Example: User Story 1

```bash
# Launch the first query for User Story 1:
Task: "Implement useNotifications with keepPreviousData in lib/queries.ts"

# After it lands, continue sequentially in the same file:
Task: "Implement useRepositories shared entry in lib/queries.ts"

# Inbox and palette refactors run after the hooks land:
Task: "Replace manual load plus reqRef with useNotifications in app/page.tsx"
Task: "Replace independent palette fetches with shared queries in components/search/command-palette.tsx"
```

---

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Complete Phase 1: Setup
2. Complete Phase 2: Foundational (CRITICAL - blocks all stories)
3. Complete Phase 3: User Story 1
4. **STOP and VALIDATE**: Test shared cache per quickstart step 1 plus step 2 independently
5. Deploy/demo if ready

### Incremental Delivery

1. Complete Setup + Foundational → Foundation ready
2. Add User Story 1 → Test independently → Deploy/Demo (MVP!)
3. Add User Story 2 → Test independently → Deploy/Demo (full triage loop)
4. Add User Story 3 → Test independently → Deploy/Demo
5. Add User Story 4 → Test independently → Deploy/Demo
6. Add User Story 5 → Test independently → Deploy/Demo
7. Each story adds value without breaking previous stories

### Parallel Team Strategy

With multiple developers:

1. Team completes Setup + Foundational together
2. Once Foundational is done:
   - Developer A: User Story 1 + User Story 2 (P1 cache plus triage)
   - Developer B: User Story 3 + User Story 4 (P2 sync plus UI actions)
   - Developer C: User Story 5 (P3 repos and settings)
3. Stories complete and integrate independently

---

## Notes

- [P] tasks = different files, no dependencies
- [Story] label maps task to specific user story for traceability
- Each user story should be independently completable and testable
- Commit after each task or logical group
- Stop at any checkpoint to validate story independently
- Avoid: vague tasks, same file conflicts, cross-story dependencies that break independence
