# Tasks: Repository Multi-Select with Bulk Context Menu

**Input**: Design documents from `/specs/007-repo-multi-select/`

**Prerequisites**: plan.md (required), spec.md (required for user stories), research.md, data-model.md, contracts/

**Tests**: Included per constitution principle II (Test-First, NON-NEGOTIABLE): unit tests for pure helpers, component tests for sidebar/menu behavior, one e2e journey. TDD order applies: write each test task first, confirm it FAILS, then implement.

**Organization**: Tasks grouped by user story for independent implementation and testing.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (e.g., US1, US2, US3)
- Include exact file paths in descriptions

## Path Conventions

Single-project web app: `app/`, `components/`, `lib/`, `tests/` at repository root.

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Confirm starting point on the feature branch

- [X] T001 Verify clean working tree on branch `t3/multi-select-menu-actions` (worktree branch; spec assumed `007-repo-multi-select`) with design artifacts present in `specs/007-repo-multi-select/`

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Pure selection logic both user stories depend on (data-model.md entities, no storage)

**⚠️ CRITICAL**: No user story work can begin until this phase is complete

- [X] T002 Write failing unit tests for `rangeSelection` in `tests/unit/inbox-state.test.ts` (null anchor behaves as toggle; forward/backward ranges; target outside visible list leaves selection unchanged; hidden rows stay selected since "Members are repository ids, never display positions" and "Shift-range computation MUST use the currently visible order")
- [X] T003 Implement `rangeSelection(visibleIds, anchorId, targetId, selected)` in `lib/inbox-state.ts` (depends on T002; pure function next to `nextSelection`/`toggleAllSelection`)
- [X] T004 Write failing unit tests for `summarizeRepoSelection` in `tests/unit/inbox-state.test.ts` (combined pending/readable sums; rhythm agreement vs "mixed"; snooze none/all/mixed; entry disabled only when combined actionable count is zero)
- [X] T005 Implement `summarizeRepoSelection` in `lib/inbox-state.ts` (depends on T004; pure derivation of CombinedMenuTarget counts from repo facets)

**Checkpoint**: Foundation ready — `bun run test:unit -- inbox-state` green; user story implementation can now begin

---

## Phase 3: User Story 1 - Select multiple repositories in the left menu (Priority: P1) 🎯 MVP

**Goal**: Ctrl/Cmd-toggle and Shift-range selection with distinct selected visuals, plain click preserving filter behavior, Escape/empty-space clearing

**Independent Test**: Ctrl/Cmd-click three separate rows then Shift-click a fourth; selected set matches, inbox filter unchanged except for plain clicks; `aria-selected` exposed on rows

### Tests for User Story 1 (write FIRST, confirm FAIL)

- [X] T006 [P] [US1] Component tests for selection gestures in `tests/component/repo-list-filter.test.tsx` (toggle two non-adjacent rows; Shift-range from anchor; plain click clears and filters; Escape and empty-space click clear without changing filter; `aria-selected` on selected rows)

### Implementation for User Story 1

- [X] T007 [US1] Add selection state (`selected: Set<string>`, `anchorId: string | null`, "Empty set means no selection") to `components/inbox/filter-sidebar.tsx`
- [X] T008 [US1] Modifier click handling in `components/inbox/filter-sidebar.tsx` via `rangeSelection` (depends on T007; Ctrl/Cmd toggles and moves anchor, Shift extends visible range, plain click clears and filters as today)
- [X] T009 [US1] Selected-row visuals distinct from active-filter style with both visible on overlap, plus `aria-selected`, in `components/inbox/filter-sidebar.tsx` (depends on T007)
- [X] T010 [US1] Keyboard support in `components/inbox/filter-sidebar.tsx` (depends on T007; Ctrl/Cmd+Space/Enter toggle via click modifiers, Shift+Arrow extends range, Escape clears selection, menu key opens row menu)

**Checkpoint**: At this point, User Story 1 is fully functional and testable independently (selection with zero menu changes; right-clicks still open single-row menus)

---

## Phase 4: User Story 2 - One context menu for the whole selection (Priority: P1)

**Goal**: Right-click (or trigger) on a selected row opens one combined menu applying snooze, rhythm, open/copy to the whole selection with combined counts and Mixed states

**Independent Test**: Select three repositories, right-click one, choose a snooze preset; all three snooze, unselected repos untouched; menu title names the selection size

### Tests for User Story 2 (write FIRST, confirm FAIL)

- [X] T011 [P] [US2] Component tests for combined menu in `tests/component/repo-list-filter.test.tsx` (right-click selected row opens bulk menu with count title; right-click unselected row clears and targets single; Mixed rhythm/snooze shown; entry disabled with hint only when combined count is zero)

### Implementation for User Story 2

- [X] T012 [US2] Add `RepoBulkMenu` export in `components/inbox/repo-snooze-menu.tsx` reusing the existing menu shell, positioning, submenus, and keyboard handling (single-row `RepoSnoozeMenu` untouched; entries: snooze presets + unsnooze, rhythm submenu, mark done/read placeholders wired in US3, open-anchor-only, copy-all-joined-with-newlines)
- [X] T013 [US2] Bulk intent props (`onBulkSnooze`, `onBulkRhythm`, `onBulkDone`, `onBulkRead`) and right-click targeting rules in `components/inbox/filter-sidebar.tsx` (depends on T012; right-click inside selection opens bulk menu, outside clears then singles)
- [X] T014 [US2] Fan-out for snooze, rhythm, open, and copy-link in `app/page.tsx` (depends on T013; one existing `useUpdateRepository` call per selected repo in parallel, existing per-repo busy set, one summary notice, copy joins links with newlines)

**Checkpoint**: At this point, User Stories 1 AND 2 work: multi-select plus bulk snooze/rhythm/copy/open end to end

---

## Phase 5: User Story 3 - Safe bulk triage with confirmations and feedback (Priority: P2)

**Goal**: Bulk mark-done/read across the selection reusing the destructive threshold, per-repo busy indication, one summary notice, rollback on failure

**Independent Test**: Select repos with combined pending above threshold, choose Mark all done, confirmation names item total + repo count before anything changes; per-repo busy shows; failure restores and reports once

### Tests for User Story 3 (write FIRST, confirm FAIL)

- [X] T015 [P] [US3] E2E multi-select journey in `tests/e2e/repo-multi-select.spec.ts` (select three repos via modifiers; bulk snooze applies to all; combined done above `BULK_CONFIRM_THRESHOLD` shows confirmation naming totals; cancel leaves state unchanged)

### Implementation for User Story 3

- [X] T016 [US3] Generalize inbox confirm dialogs from one repository id to an id list in `app/page.tsx` (combined pending/unread totals gate `BULK_CONFIRM_THRESHOLD = 25`; dialog names total items and repository count)
- [X] T017 [US3] Done/read fan-out with per-repo busy and single summary notice in `app/page.tsx` (depends on T016; one existing `useMarkRepoDone`/`useMarkRepoRead` call per actionable repo in parallel, "Entries stay enabled when at least one member is actionable", failures restore affected repos and report once)

**Checkpoint**: All user stories independently functional; destructive bulk path confirmed safe

---

## Phase 6: Polish & Cross-Cutting Concerns

**Purpose**: Validation and gates across all stories

- [X] T018 Run `specs/007-repo-multi-select/quickstart.md` manual validation (5-minute gesture, menu, threshold, and Escape scenarios)
- [X] T019 Run full local gates `make check` (typecheck, lint, unit, integration, component) plus the e2e spec, fix regressions
- [X] T020 Review touch fallback (per-row trigger applies bulk actions to current selection) and shortcuts help text for multi-select hints in `components/inbox/shortcuts-help.tsx` if warranted

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies — start immediately
- **Foundational (Phase 2)**: Depends on Setup — BLOCKS all user stories
- **User Stories (Phase 3+)**: Depend on Foundational; US2 builds on US1 selection UI, US3 builds on US2 menu wiring — implement sequentially in priority order
- **Polish (Phase 6)**: Depends on all user stories complete

### User Story Dependencies

- **User Story 1 (P1)**: After Foundational — no other story dependencies; MVP increment
- **User Story 2 (P1)**: After Foundational + US1 (needs selection state and gestures); independently testable via its snooze-all scenario
- **User Story 3 (P2)**: After Foundational + US2 (needs bulk menu wiring); independently testable via its confirmation scenario

### Within Each User Story

- Tests written FIRST and confirmed FAIL before implementation
- Helpers before components; components before page wiring
- Story checkpoint validated before next story begins

### Parallel Opportunities

- T006 (US1 component tests) and T011 (US2 component tests) touch the same test file — run sequentially, not parallel despite the [P] on T011 relative to implementation files
- T011 and T015 are in different new/existing test files from implementation work and can be drafted in parallel with early implementation tasks in their phases
- True parallelization point: after Foundational, US1 must still precede US2/US3 (shared files `filter-sidebar.tsx`, `page.tsx`), so this feature is sequential by file ownership, not parallelizable across developers

---

## Parallel Example: User Story 2

```bash
# Draft the menu contract test while the menu shell is fresh in mind
Task: "Component tests for combined menu in tests/component/repo-list-filter.test.tsx"
# Then implement against the failing tests, in file order:
Task: "Add RepoBulkMenu export in components/inbox/repo-snooze-menu.tsx"
Task: "Bulk intent props and right-click targeting in components/inbox/filter-sidebar.tsx"
Task: "Fan-out for snooze, rhythm, open, copy-link in app/page.tsx"
```

---

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Complete Phase 1: Setup
2. Complete Phase 2: Foundational (range + summary helpers, unit-tested)
3. Complete Phase 3: User Story 1 (selection gestures + visuals + keyboard)
4. **STOP and VALIDATE**: run US1 independent test; selection works with existing single-row menus untouched
5. Demo selection behavior before building the bulk menu

### Incremental Delivery

1. Setup + Foundational → pure logic tested, no UI change
2. Add US1 → selection visible, old menus unchanged → validate
3. Add US2 → combined menu with snooze/rhythm/copy/open → validate snooze-all
4. Add US3 → destructive done/read with confirmations → validate threshold path
5. Each increment adds value without breaking the previous one

---

## Notes

- [P] tasks = different files, no dependencies (T011/T015 test files vs implementation files)
- Same-file tasks (T002+T004 test file; T007–T010, T016–T017) are sequential — same-file edits never parallelize
- Data-model constraints quoted verbatim in T002, T004, T007, T017 — not left to implementation discretion
- No new server endpoint, store, route, or schema in any task — fan-out only
- Commit after each task; stop at any checkpoint to validate the story independently
