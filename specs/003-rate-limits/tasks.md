# Tasks: Rate Limits View

**Input**: Design documents from `/specs/003-rate-limits/`
**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/rate-limits-api.md, quickstart.md

**Scope**: 1 page (`app/rate-limits/page.tsx`), 1 route handler (`app/api/rate-limits/route.ts`), 1 library module (`lib/rate-limits.ts`), 1 nav entry (`components/app-shell.tsx`), 1 unit-test file (`tests/unit/rate-limits.test.ts`). No DB changes, no inbox/sync/digest changes.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (e.g., US1, US2, US3)
- Include exact file paths in descriptions

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Confirm existing patterns and tooling before new code

- [ ] T001 [P] Review repositories page split (`app/repos/page.tsx`, existing `app/api/*` route handler) as the reuse pattern for page + handler + nav entry
- [ ] T002 [P] Confirm `gh` CLI session helper `getStoredToken()` in `lib/github.ts` and `GH_HOST` / `GHN_API_BASE` handling for Enterprise hosts

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Server-side quota probing that all stories depend on

**⚠️ CRITICAL**: No user story work can begin until this phase is complete

- [ ] T010 Implement header parsing + three-bucket probe collection in `lib/rate-limits.ts` (`parseRateLimitHeaders`, `probesFor` for `GET /user` / GraphQL viewer query / `GET /search/repositories?per_page=1`, `fetchRateLimits` with injected `fetchFn`/`nowMs`, `getRateLimits` via `getStoredToken()`; 401 aborts as `auth`, per-bucket transport/missing-header as warnings, 403/429 with remaining kept plus warning, zero usable buckets as `unreachable`, `fetchedAt` per refresh)
- [ ] T011 [P] Unit tests with recorded-fixture style (injected `fetch`, no live calls) in `tests/unit/rate-limits.test.ts` (header parse ok, zero-remaining maps to `rate-limited`, missing headers return null, three-bucket collection from fixtures, 401 maps to `auth`)
- [ ] T012 `GET` handler in `app/api/rate-limits/route.ts` wiring `getRateLimits()` to contract shapes (200 with `provider`/`fetchedAt`/`usage`/`warnings`, 401 for `auth`, 502 otherwise, `Cache-Control: no-store`, no token in response)

**Checkpoint**: Foundation ready - `bun test tests/unit/rate-limits.test.ts` passes, handler returns fixture-backed buckets

---

## Phase 3: User Story 1 - Check GitHub rate limits without leaving ghn (Priority: P1) 🎯 MVP

**Goal**: "Rate limits" nav entry opens a dedicated view showing current used/remaining/percent per bucket with manual refresh and honest disconnected/unreachable states

**Independent Test**: Open Rate limits on a connected account, see current figures per bucket with refresh; revoke auth and see disconnected state with reconnect path, never stale figures as fresh (quickstart §2, §3, §5)

### Implementation for User Story 1

- [ ] T020 [US1] Add "Rate limits" nav entry with `Gauge` icon and route subtitle in `components/app-shell.tsx` (active-state via `pathname.startsWith`, matching existing Inbox/Repositories pattern)
- [ ] T021 [US1] Build client page shell in `app/rate-limits/page.tsx` (fetch `/api/rate-limits` with `cache: no-store`, loading state via `LoadingInbox`, error state via `ErrorInbox` + retry, `Refresh` button with `RefreshCw` disabled while in flight, `fetchedAt` display; disconnected 401 shows distinct message with `gh auth login` reconnect path and no figures, unreachable 502 keeps prior figures readable marked not-fresh)
- [ ] T022 [US1] Render one card per bucket (`core`, `graphql`, `search`) in `app/rate-limits/page.tsx` showing used/limit, remaining, percent with meter (`role="progressbar"`), per-bucket notice when bucket absent so other cards still render (FR-008)
- [ ] T023 [US1] Run unit gate `bun test tests/unit/rate-limits.test.ts` plus `bunx tsc --noEmit` and fix failures

**Checkpoint**: At this point, User Story 1 should be fully functional and testable independently (quickstart §2, §3, §5 pass)

---

## Phase 4: User Story 2 - Know when quota recovers (Priority: P2)

**Goal**: Each bucket card shows when it resets, and exhausted buckets are visibly flagged without relying on color alone

**Independent Test**: Each card shows reset time or countdown; a zero-remaining bucket is flagged rate-limited with the reset figure prominent while other cards render normally (quickstart §4)

### Implementation for User Story 2

- [ ] T030 [US2] Show reset per bucket in `app/rate-limits/page.tsx` (`resetsAt` as clock time via `formatReset`, fallback to `resetsInSecs` countdown, `unknown` when absent; reset line uses `font-mono` consistent with existing figures)
- [ ] T031 [US2] Flag zero-remaining buckets as rate-limited in `app/rate-limits/page.tsx` (text `rate-limited` alongside reset, `barClass` styling never color-only, `aria-label` percent preserved, reset figure prominent on the exhausted card)

**Checkpoint**: At this point, User Stories 1 AND 2 should both work independently (quickstart §4 passes alongside §2/§3/§5)

---

## Phase 5: User Story 3 - Trust the reference numbers (Priority: P3)

**Goal**: Documented-limits reference maps each live bucket to its allowance and window with an authoritative docs link plus refresh-cost disclosure

**Independent Test**: Reference section shows three allowances with windows and docs link; refresh-cost note is visible; no demo or seed figures ever appear as live data (quickstart §2)

### Implementation for User Story 3

- [ ] T040 [P] [US3] Ship static `RATE_LIMIT_DOCS` in `lib/rate-limits.ts` (core `5,000/hr` requests per hour per account, graphql `5,000/hr` points per hour per account, search `30/min` requests per minute) and render the documented-limits card in `app/rate-limits/page.tsx` with per-bucket allowance joined by bucket id plus the authoritative GitHub rate-limit docs link (`https://docs.github.com/en/rest/using-the-rest-api/rate-limits-for-the-rest-api`, `target="_blank" rel="noopener noreferrer"`)
- [ ] T041 [P] [US3] Disclose refresh cost and provenance in `app/rate-limits/page.tsx` (header subtitle "Each refresh spends one request per bucket", footer "source: api.github.com X-RateLimit headers, token from `gh auth login`", never render demo/seed numbers per FR-011)

**Checkpoint**: All user stories should now be independently functional

---

## Phase 6: Polish & Cross-Cutting Concerns

**Purpose**: Gates and end-to-end validation from quickstart.md

- [ ] T050 [P] Accessibility check on `app/rate-limits/page.tsx` (full keyboard operability, visible focus via existing Button/Card primitives, rate-limited flag text not color-only, progressbar ARIA attributes intact)
- [ ] T051 Run gates: `bun test tests/unit/rate-limits.test.ts`, `bunx tsc --noEmit`, eslint on touched files; fix until green
- [ ] T052 Run quickstart.md validation end to end (§2 page load, §3 refresh disables/re-enables with new fetch time, §4 exhausted bucket prominent reset, §5 revoked-auth disconnected with reconnect path then re-auth, §6 partial failure per-bucket notice)

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
- **User Story 2 (P2)**: Can start after Foundational (Phase 2) - Extends US1 cards with reset/flag, independently testable per quickstart §4
- **User Story 3 (P3)**: Can start after Foundational (Phase 2) - Static reference alongside live cards, independently testable

### Within Each User Story

- Library (`lib/rate-limits.ts`) before handler (`app/api/rate-limits/route.ts`) before page (`app/rate-limits/page.tsx`)
- Story complete before moving to next priority
- Commit after each task or logical group

### Parallel Opportunities

- T001 and T002 can run in parallel (read-only review of different files)
- T011 can run in parallel with T012 once T010 interfaces are fixed (different files)
- T040 and T041 can run in parallel (static docs vs. cost/provenance copy in distinct regions)
- T050 can run in parallel with T051 (manual a11y pass vs. automated gates)

---

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Complete Phase 1: Setup
2. Complete Phase 2: Foundational (CRITICAL - blocks all stories)
3. Complete Phase 3: User Story 1
4. **STOP and VALIDATE**: Test User Story 1 independently (quickstart §2, §3, §5)
5. Deploy/demo if ready

### Incremental Delivery

1. Complete Setup + Foundational → Foundation ready
2. Add User Story 1 → Test independently → Deploy/Demo (MVP!)
3. Add User Story 2 → Test independently → Deploy/Demo
4. Add User Story 3 → Test independently → Deploy/Demo
5. Each story adds value without breaking previous stories

---

## Notes

- [P] tasks = different files, no dependencies
- [Story] label maps task to specific user story for traceability (FR-001–FR-011, SC-001–SC-005)
- Each user story is independently completable and testable per its Independent Test
- Commit after each task or logical group
- Stop at any checkpoint to validate story independently
- Avoid: vague tasks, same file conflicts, cross-story dependencies that break independence
- No persistence: freshness is `fetchedAt` per response, never a stored row (research R5)
- Token never leaves the server process; browser receives numbers only (research R3)
