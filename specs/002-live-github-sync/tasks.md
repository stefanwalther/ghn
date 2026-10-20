# Tasks: Live GitHub Sync

**Input**: Design documents from `/specs/002-live-github-sync/`
**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/sync-api.md (plus 001 contracts inbox-api.md, digest-api.md)

**Tests**: Focused unit tests plus fixture-mode smoke are included because quickstart.md defines `bun test` plus Playwright smoke as gates, and plan.md requires recorded-fixture contract tests with no live calls in CI. No full TDD suite.

**Organization**: Tasks grouped by user story. US1 delivers read-only live inbox with local triage; US2 adds write-back; both are P1 and ship in that order.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (US1, US2, US3, US4)
- Include exact file paths in descriptions

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Baseline the working prototype and prove the transport prerequisite before touching code

- [X] T001 [P] Record green baseline on the prototype in repo root per quickstart.md gates (`bun run typecheck`, `bun run lint`, `bun test`)
- [X] T002 [P] Prove read-only GitHub transport with the spec Q1 session (`gh auth status` active plus `gh api --method GET /notifications -f per_page=1` returning 200, no mutations)

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Schema evolution, transport, merge rules, and queue that every user story builds on

**⚠️ CRITICAL**: No user story work can begin until this phase is complete

- [X] T003 Evolve drizzle schema in db/schema.ts per data-model.md: widen notifications.reason to raw GitHub strings, add notifications.subjectType, notifications.githubUpdatedAt, notifications.localUnread (default 0), repositories.unreachable (default 0), new sync_state and writeback_queue tables, keeping constraints "`subject` non-empty, max 200 chars", "`sourceUrl` must be a valid https URL", "`rhythm` must be `immediate`, `weekly`, `biweekly`, or `monthly`", "`nextDueAt` required unless rhythm is immediate"
- [X] T004 [P] Implement `gh` CLI transport in lib/github.ts per research.md R1/R2/R4: paged `GET /notifications` with `all=true` and `per_page=50`, `Link` following, `If-Modified-Since` conditional reads, `X-Poll-Interval` return, `PATCH` thread read, `DELETE` thread done, `PUT` subscription ignore, subject `html_url` resolution with concurrency 5 and per-URL cache plus derived fallback
- [X] T005 [P] Implement sync merge rules in lib/sync.ts per research.md R4/R5 and data-model.md migration: first-sync deletion of `n_*` seed rows with rhythm snapshot preserved, thread upsert map, remote-done by absence on full passes only, `localUnread` preservation, owned-to-viewer means immediate while watched means weekly defaults, renamed/deleted/access-lost repos flagged unreachable
- [X] T006 [P] Implement write-back queue helpers in lib/queue.ts per data-model.md writeback_queue table: enqueue per failed thread with action/attempts/lastError, FIFO drain, row deletion on success
- [X] T007 [P] Extend reason facets in lib/filters.ts to the live GitHub reason union (subscribed, state_change, mention, review_requested, ci_activity, assign, author, comment, manual, team_mention, plus prototype labels where they overlap)
- [X] T008 Push evolved schema with `bun run db:push` from package.json scripts and confirm existing prototype unit tests still pass

**Checkpoint**: Foundation ready - user story implementation can now begin in parallel

---

## Phase 3: User Story 1 - See live GitHub notifications in the same inbox (Priority: P1) 🎯 MVP

**Goal**: Live threads replace seed rows in the unchanged inbox UI with the same filters, bulk bar, and keyboard triage operating locally.

**Independent Test**: Connect an account with 20+ real notifications across 3+ repos, load the inbox, confirm repository/subject/reason/age columns plus repo/type/age/state filters behave as in the prototype, trigger manual refresh and confirm new items arrive without losing filter or scroll position, triage 20 items locally in under 5 minutes per quickstart.md scenario 1.

### Tests for User Story 1

> **NOTE: Write these tests FIRST, ensure they FAIL before implementation**

- [X] T009 [P] [US1] Unit test for thread-to-row mapping in tests/unit/sync.test.ts using recorded fixtures: raw reason stored verbatim, unread inverted to isRead, updated_at as sort key, subjectType captured, sourceUrl resolved with fallback
- [X] T010 [P] [US1] Unit test for first-sync migration in tests/unit/sync.test.ts: `n_*` seed rows deleted, numeric thread rows kept, rhythm/snooze/due snapshot preserved, discovered repos defaulted

### Implementation for User Story 1

- [X] T011 [US1] Implement POST /api/sync in app/api/sync/route.ts per contracts/sync-api.md: full vs incremental (`since=<lastSyncAt>`), in-window cached reply with `notModified: true`, first-run migration before upsert, response with now/lastSyncAt/fresh/upserted/markedDone/discoveredRepos/queueDepth
- [X] T012 [P] [US1] Implement GET /api/connection in app/api/connection/route.ts per contracts/sync-api.md: `gh` session probe, viewerLogin, connected flag with missing_auth/revoked/rate_limited/network reason plus `gh auth login` hint
- [X] T013 [US1] Update GET /api/notifications in app/api/notifications/route.ts for live rows: raw-reason facets, lastSyncAt/stale passthrough on every response, unchanged mainFlow vs collapsedSection grouping via lib/digest.ts
- [X] T014 [US1] Update inbox header and refresh in app/page.tsx per contracts/sync-api.md UI deltas: Last synced time on every load, poll-window refresh countdown, Reseed button hidden whenever lastSyncAt is set
- [X] T015 [P] [US1] Gate dev reseed in app/api/notifications/seed/route.ts per contracts/sync-api.md: keep the production 403, add 409 when any numeric-thread live row exists unless forced in development

**Checkpoint**: At this point, User Story 1 should be fully functional and testable independently (live read, local triage, refresh)

---

## Phase 4: User Story 2 - Triage writes back so GitHub stays in agreement (Priority: P1)

**Goal**: Done/read propagate to GitHub Done/read state with queued retry; unread stays an explicit local-only overlay because GitHub offers no mark-unread endpoint.

**Independent Test**: Mark 5 live items done, 2 unread, 1 read; confirm the GitHub website agrees on done/read within minutes and re-sync never resurrects done items; attempt Done offline and confirm prior state stays visible with a retry notice plus queue depth per quickstart.md scenario 2.

### Tests for User Story 2

- [X] T016 [P] [US2] Unit tests for write-back mapping and queue in tests/unit/writeback.test.ts: done issues thread delete, read issues thread patch, unsubscribe marks done plus muted-subject plus subscription ignore, unread performs no remote call and sets localUnread, failures enqueue with attempts/lastError and drain FIFO

### Implementation for User Story 2

- [X] T017 [US2] Implement remote write-back in app/api/notifications/bulk/route.ts per contracts/sync-api.md: per-thread calls through lib/github.ts, same 400 on empty ids and 422 on unknown ids with no partial writes, 200 partial summary with remote/queued counts, failures appended via lib/queue.ts with prior state kept visible
- [X] T018 [US2] Wire queue drain into POST /api/sync in app/api/sync/route.ts per contracts/sync-api.md: drain FIFO via lib/queue.ts before fetching, report queueDepth in every response
- [X] T019 [US2] Add local-only hint for unread rows in components/inbox/notification-list.tsx (or the page notice slot in app/page.tsx) documenting that unread has no remote endpoint until the next read/done action

**Checkpoint**: At this point, User Stories 1 AND 2 should both work independently (single-triage confidence)

---

## Phase 5: User Story 3 - Noisy repos stay quiet on live data (Priority: P2)

**Goal**: Carried-over rhythms plus quiet defaults for discovered repos keep non-due live items collapsed until due with promotion and due indicators.

**Independent Test**: Confirm carried-over rhythms unchanged in /repos, newly discovered watched repos default weekly, non-due groups sit dimmed and collapsed with pending counts and next due dates, flipping one repo to immediate promotes its group with a due indicator per quickstart.md scenario 3.

### Tests for User Story 3

- [X] T020 [P] [US3] Unit tests for digest on live rows in tests/unit/digest.test.ts: new watched repo defaults weekly, new owned repo defaults immediate, existing rhythm never overwritten by discovery, due group promotes with indicator, monthly edge and rhythm-to-immediate cases

### Implementation for User Story 3

- [X] T021 [US3] Show discovered defaults and unreachable badges in app/repos/page.tsx and components/repos/repo-row.tsx per contracts/sync-api.md: quiet default preselected and changeable, helper text on hide-until-due consequence, renamed/deleted/access-lost repos badged without blocking
- [X] T022 [US3] Harden digest section on live rows in components/inbox/digest-section.tsx: collapsed groups with pendingCount/rhythm/nextDueLabel from live facets, due promotion with visible indicator, never silent

**Checkpoint**: At this point, User Stories 1, 2 AND 3 should all work independently (calm inbox on real volume)

---

## Phase 6: User Story 4 - Stay oriented and resilient when GitHub is slow or unreachable (Priority: P3)

**Goal**: Cached inbox stays readable with explicit stale/disconnected/rate-limited states, last-synced time, and retry or reconnect paths, preserving filter and position across round-trips.

**Independent Test**: Revoke access, throttle the network, and simulate rate limiting; confirm each case shows its distinct message with reconnect or retry while cached rows stay interactive, then reconnect and confirm fresh data plus queue drain per quickstart.md scenario 4.

### Tests for User Story 4

- [X] T023 [P] [US4] Unit tests for stale and retry paths in tests/unit/sync.test.ts: conditional 304 returns notModified without touching rows, rate-limited/network responses return fresh false with retryable true, queued write-backs drain on next successful sync
- [X] T024 [P] [US4] Playwright fixture-mode smoke in tests/e2e/inbox.spec.ts

### Implementation for User Story 4

- [X] T025 [US4] Render stale/disconnected/rate-limited/partial states in app/page.tsx and components/inbox/empty-states.tsx per contracts/sync-api.md UI deltas: cached rows stay interactive, last-synced time always shown, silent stale-as-fresh never rendered
- [X] T026 [US4] Gate refresh on the advertised poll interval in app/page.tsx: disable with countdown inside the window, fire POST /api/sync on demand otherwise, keep scroll position and selection across refresh

**Checkpoint**: All user stories should now be independently functional

---

## Phase 7: Polish & Cross-Cutting Concerns

**Purpose**: Design, accessibility, performance, and validation across all stories

- [X] T027 [P] Run w5r-design pass on new and changed UI
- [X] T028 [P] Verify light and dark mode plus keyboard/a11y sweep for sync header, banners, badges, and unread hints including visible focus and no color-only signaling
- [X] T029 Performance check with hundreds of live-shaped threads for first-screen speed and bulk 20-item round-trip behavior excluding GitHub latency
- [X] T030 Run quickstart.md validation covering `bun run typecheck`, `bun run lint`, `bun test`, fixture-mode smoke, and all four validation scenarios

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies - can start immediately
- **Foundational (Phase 2)**: Depends on Setup completion - BLOCKS all user stories
- **User Stories (Phase 3+)**: All depend on Foundational phase completion
  - User stories can then proceed in parallel (if staffed)
  - Or sequentially in priority order (P1 read → P1 write-back → P2 → P3)
- **Polish (Final Phase)**: Depends on all desired user stories being complete

### User Story Dependencies

- **User Story 1 (P1)**: Can start after Foundational (Phase 2) - No dependencies on other stories; delivers the read-only live MVP
- **User Story 2 (P1)**: Can start after Foundational (Phase 2) - Extends the T011 sync route (T018) and T013 bulk behavior (T017); independently testable per scenario 2
- **User Story 3 (P2)**: Can start after Foundational (Phase 2) - Builds on live rows and facets from US1; digest math shared, independently testable per scenario 3
- **User Story 4 (P3)**: Can start after Foundational (Phase 2) - Builds on sync/connection contracts; testable with fixtures per scenario 4

### Within Each User Story

- Tests (included per quickstart gates) MUST be written and FAIL before implementation
- Transport/merge helpers before routes (foundational order: schema → libs → push)
- Routes before UI components
- Core implementation before integration wiring (queue drain after bulk write-back shape exists)
- Story complete before moving to next priority

### Parallel Opportunities

- All Setup tasks marked [P] can run in parallel (T001, T002: baselines vs transport probe)
- All Foundational tasks marked [P] can run in parallel after T003 (T004, T005, T006, T007: different files, shared data-model.md contract)
- Once Foundational phase completes, all user stories can start in parallel (if team capacity allows)
- All tests for a user story marked [P] can run in parallel (T009 + T010)
- Different user stories can be worked on in parallel by different team members
- T012 and T015 can run in parallel with T011 (independent route files)

---

## Parallel Example: User Story 1

```bash
# Launch mapping and migration tests together (different cases, same new file):
Task: "Unit test for thread-to-row mapping in tests/unit/sync.test.ts"
Task: "Unit test for first-sync migration in tests/unit/sync.test.ts"

# Launch independent routes together (different files):
Task: "Implement POST /api/sync in app/api/sync/route.ts"
Task: "Implement GET /api/connection in app/api/connection/route.ts"
Task: "Gate dev reseed in app/api/notifications/seed/route.ts"
```

---

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Complete Phase 1: Setup (baseline + transport probe)
2. Complete Phase 2: Foundational (CRITICAL - blocks all stories)
3. Complete Phase 3: User Story 1 (live read, local triage, refresh)
4. **STOP and VALIDATE**: Test User Story 1 independently per quickstart scenario 1
5. Deploy/demo if ready (read-only live inbox)

### Incremental Delivery

1. Complete Setup + Foundational → Foundation ready
2. Add User Story 1 → Test independently → Deploy/Demo (live MVP!)
3. Add User Story 2 → Test independently → Deploy/Demo (single-triage confidence)
4. Add User Story 3 → Test independently → Deploy/Demo (calm inbox on real volume)
5. Add User Story 4 → Test independently → Deploy/Demo (resilient daily driver)
6. Each story adds value without breaking previous stories

### Parallel Team Strategy

With multiple developers:

1. Team completes Setup + Foundational together
2. Once Foundational is done:
   - Developer A: User Story 1 (sync + connection + inbox read)
   - Developer B: User Story 2 (write-back + queue drain)
   - Developer C: User Story 3 (repos UI + digest hardening)
   - Developer D: User Story 4 (resilience states + smoke)
3. Stories complete and integrate independently

---

## Notes

- [P] tasks = different files, no dependencies
- [Story] label maps task to specific user story for traceability
- T018 modifies the T011 sync route file, so it is intentionally not [P] against US1 route work
- T024 modifies the T014 page file, so US4 UI work follows US1 header work when done by one person (parallel-safe across a team behind the sync-api.md contract)
- Each user story is independently completable and testable per its quickstart scenario
- Tests use recorded fixtures only; no live `gh`/GitHub calls in CI per plan.md
- Commit after each task or logical group
- Stop at any checkpoint to validate story independently
- Sync merge keeps GitHub as system of record; local wins are limited to explicit unread overlays and queued write-backs
