# Tasks: Quiet Notifications Prototype

**Input**: Design documents from `/specs/001-quiet-notifications/`
**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/, quickstart.md

**Tests**: Minimal unit and smoke tests included because quickstart.md defines `bun test` plus Playwright smoke as merge gates. No full TDD suite for this prototype.

**Organization**: Tasks grouped by user story. US1 is the MVP slice.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (US1, US2, US3)
- Include exact file paths in descriptions

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Project initialization and basic structure

- [X] T001 Initialize Next.js 15 App Router + React 19 + TypeScript 5 project with Bun in repo root creating package.json, tsconfig.json, and next.config.ts per plan.md
- [X] T002 Configure Tailwind CSS v4 with w5r tokens mirrored verbatim into app/globals.css
- [X] T003 [P] Install and wire shadcn/ui local primitives in components/ui/ (button, checkbox, badge, card, collapsible, select, separator)
- [X] T004 [P] Install drizzle-orm with bun:sqlite driver and lucide-react in package.json
- [X] T005 [P] Configure typecheck, lint, and test scripts in package.json (bun run typecheck, bun run lint, bun test)
- [X] T006 Gitignore local SQLite file at data/quiet-notifications.db in .gitignore
- [X] T007 Create project directory skeleton per plan.md (app/, components/inbox/, components/repos/, lib/, db/, data/, tests/unit/, tests/e2e/)

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Core infrastructure that MUST be complete before ANY user story can be implemented

**⚠️ CRITICAL**: No user story work can begin until this phase is complete

- [X] T008 Setup drizzle SQLite schema in db/schema.ts for repositories and notifications tables with indexes
- [X] T009 Create bun:sqlite connection client in db/client.ts pointing at data/quiet-notifications.db
- [X] T010 [P] Implement digest due-date math in lib/digest.ts (weekly +7 days, biweekly +14 days, monthly +1 calendar month, isDue, grouping)
- [X] T011 [P] Implement mock seed generator in lib/seed.ts for 10 repositories and 200 notifications with stable fake source URLs
- [X] T012 [P] Implement inbox view-state helpers in lib/view-state.ts (URL search params for repo and state filters, sessionStorage lastOpenedId)
- [X] T013 Create w5r app shell in app/layout.tsx with sidebar, header, theme provider, and globals.css tokens
- [X] T014 Create shared empty, loading, and error states in components/inbox/empty-states.tsx per w5r patterns

**Checkpoint**: Foundation ready - user story implementation can now begin in parallel

---

## Phase 3: User Story 1 - Triage notifications with fewer clicks (Priority: P1) 🎯 MVP

**Goal**: Unified inbox list with repo and state filters plus one-click bulk Done/Unread without opening each thread.

**Independent Test**: Load 200 seeded items across 10 repos, filter to unread, select 20 items, press Done once, confirm all 20 leave the main flow in one round-trip under 5 minutes per quickstart.md scenario 1.

### Implementation for User Story 1

- [X] T015 [US1] Implement GET /api/notifications route in app/api/notifications/route.ts returning mainFlow and collapsedSection per contracts/inbox-api.md
- [X] T016 [US1] Implement POST /api/notifications/bulk route in app/api/notifications/bulk/route.ts with actions done, unread, read and 400 on empty ids plus 422 on unknown ids with no partial writes
- [X] T017 [P] [US1] Implement POST reseed handler in app/api/notifications/seed/route.ts returning {repositories: 10, notifications: 200}, dev only
- [X] T018 [P] [US1] Create notification list component in components/inbox/notification-list.tsx with repository name, subject, reason badge, age, and source link
- [X] T019 [US1] Create bulk action bar in components/inbox/bulk-bar.tsx with single Done and Unread actions clearing selection after apply
- [X] T020 [P] [US1] Create inbox filters in components/inbox/inbox-filters.tsx bound to URL ?repo=<id|all> and ?state=<unread|all|done>
- [X] T021 [US1] Create inbox page in app/page.tsx composing list, filters, bulk bar, and collapsed digest placeholder
- [X] T022 [US1] Add bulk transition unit tests in tests/unit/bulk.test.ts covering unread to done, done to unread re-entry, and empty-ids rejection

**Checkpoint**: At this point, User Story 1 should be fully functional and testable independently

---

## Phase 4: User Story 2 - Quiet down noisy repos with digest schedule (Priority: P2)

**Goal**: Per-repo immediate, weekly, biweekly, monthly rhythms with non-due items in a dimmed collapsed section and promotion on due date.

**Independent Test**: Set one repo weekly and one monthly in /repos, reload inbox, confirm both sit collapsed with pending counts and next due dates, flip one to immediate, confirm promotion with due indicator per quickstart.md scenario 2.

### Implementation for User Story 2

- [X] T023 [P] [US2] Implement GET /api/repositories route in app/api/repositories/route.ts returning rhythm, lastPromotedAt, nextDueAt, pendingCount, isDue per contracts/digest-api.md
- [X] T024 [US2] Implement PATCH /api/repositories/[id]/route.ts with constraint "`rhythm` must be `immediate`, `weekly`, `biweekly`, or `monthly`" and recompute of nextDueAt via lib/digest.ts, 404 on unknown id
- [X] T025 [P] [US2] Create digest collapsed section in components/inbox/digest-section.tsx rendering one dimmed collapsed group per non-due repo with count and next due date
- [X] T026 [P] [US2] Create repositories settings page in app/repos/page.tsx with ownership label, rhythm select, next due date, and pending count
- [X] T027 [P] [US2] Create repo row with rhythm select in components/repos/repo-row.tsx including helper text on hide-until-due consequence
- [X] T028 [US2] Enforce notification constraints in db/schema.ts and seed in lib/seed.ts with constraints "`subject` non-empty, max 200 chars" and "`sourceUrl` must be a valid https URL"
- [X] T029 [US2] Wire digest promotion into GET /api/notifications in app/api/notifications/route.ts so due groups appear in mainFlow with due indicator
- [X] T030 [US2] Add digest boundary unit tests in tests/unit/digest.test.ts covering weekly, biweekly, monthly including Jan-31 edge, rhythm switch to immediate, and non-due exclusion from main flow

**Checkpoint**: At this point, User Stories 1 AND 2 should both work independently

---

## Phase 5: User Story 3 - Stay oriented between prototype and GitHub (Priority: P3)

**Goal**: Source links open without losing inbox filter, collapsed state, or scroll position, with a clear back path.

**Independent Test**: Apply a repo filter, open a source link in a new tab, return, confirm same filter, collapsed state, and position across three round-trips per quickstart.md scenario 3.

### Implementation for User Story 3

- [X] T031 [P] [US3] Set source links to new-tab behavior in components/inbox/notification-list.tsx with target=_blank rel=noopener preserving prototype tab state
- [X] T032 [US3] Persist filters to URL and restore scroll in app/page.tsx via lib/view-state.ts with history.scrollRestoration and lastOpenedId anchor
- [X] T033 [US3] Add back-to-inbox affordance in app/page.tsx restoring prior filter and position with one action per FR-011
- [X] T034 [US3] Add Playwright smoke spec in tests/e2e/inbox.spec.ts covering inbox load, bulk Done, digest collapse, and filter persistence

**Checkpoint**: All user stories should now be independently functional

---

## Phase 6: Polish & Cross-Cutting Concerns

**Purpose**: Improvements that affect multiple user stories

- [X] T035 [P] Run w5r-design validate pass on app/, components/inbox/, components/repos/ for cursor-pointer, hover, focus-visible rings, and primary-scarcity with at most one solid primary per region
- [X] T036 [P] Verify light and dark mode in app/globals.css including hover and focus visibility plus muted count badges
- [X] T037 Accessibility sweep for keyboard-operable triage, visible focus, aria-labels on icon buttons, and no color-only read/unread signaling in app/page.tsx, app/repos/page.tsx, components/inbox/, and components/repos/
- [X] T038 Performance check in app/page.tsx with 200 seeded items from data/quiet-notifications.db for inbox first paint under 1s and bulk 20-item round-trip under 500ms
- [X] T039 [P] Add one-paragraph design pointer doc in docs/design/README.md referencing /w5r:design, no duplicated tokens
- [X] T040 Run quickstart.md validation covering typecheck, lint, bun test, and all four validation scenarios

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
- **User Story 2 (P2)**: Can start after Foundational (Phase 2) - Integrates with US1 inbox list via digest-section but independently testable via /repos and collapsed counts
- **User Story 3 (P3)**: Can start after Foundational (Phase 2) - Builds on US1 list and US2 sections for state restore but testable on filters alone

### Within Each User Story

- Models and libs before routes
- Routes before UI components
- Core implementation before integration wiring
- Story complete before moving to next priority

### Parallel Opportunities

- All Setup tasks marked [P] can run in parallel
- All Foundational tasks marked [P] can run in parallel (within Phase 2)
- Once Foundational phase completes, all user stories can start in parallel (if team capacity allows)
- All UI components within a story marked [P] can run in parallel
- Different user stories can be worked on in parallel by different team members

---

## Parallel Example: User Story 1

```bash
# Launch notification list, filters, and seed handler together (different files):
Task: "Create notification list component in components/inbox/notification-list.tsx"
Task: "Create inbox filters in components/inbox/inbox-filters.tsx"
Task: "Implement POST reseed handler in app/api/notifications/seed/route.ts"

# Launch User Story 2 digest UI together:
Task: "Create digest collapsed section in components/inbox/digest-section.tsx"
Task: "Create repositories settings page in app/repos/page.tsx"
Task: "Create repo row with rhythm select in components/repos/repo-row.tsx"
```

---

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Complete Phase 1: Setup
2. Complete Phase 2: Foundational (CRITICAL - blocks all stories)
3. Complete Phase 3: User Story 1
4. **STOP and VALIDATE**: Test User Story 1 independently per quickstart scenario 1
5. Deploy/demo if ready

### Incremental Delivery

1. Complete Setup + Foundational → Foundation ready
2. Add User Story 1 → Test independently → Deploy/Demo (MVP!)
3. Add User Story 2 → Test independently → Deploy/Demo
4. Add User Story 3 → Test independently → Deploy/Demo
5. Each story adds value without breaking previous stories

### Parallel Team Strategy

With multiple developers:

1. Team completes Setup + Foundational together
2. Once Foundational is done:
   - Developer A: User Story 1
   - Developer B: User Story 2
   - Developer C: User Story 3
3. Stories complete and integrate independently

---

## Notes

- [P] tasks = different files, no dependencies
- [Story] label maps task to specific user story for traceability
- Each user story should be independently completable and testable
- Commit after each task or logical group
- Stop at any checkpoint to validate story independently
- Digest Setting lives as columns on repositories per data-model.md, not a separate table
- Inbox View State stays transient in URL plus client memory, never in SQLite
