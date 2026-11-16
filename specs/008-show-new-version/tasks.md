# Tasks: Sidebar Update Badge with Inline Release Notes

**Input**: Design documents from `specs/008-show-new-version/`

**Prerequisites**: plan.md (required), spec.md (required for user stories), research.md, data-model.md, contracts/version-with-notes.md

**Tests**: Included per story. Constitution principle II mandates TDD: tests fail first, then implement. New behavior gets coverage at its layer (unit for pure projection rules, integration for route plus stand-in, component for badge plus dialog DOM). The suite never contacts real GitHub; the loopback guard fails any test that tries.

**Organization**: Grouped by user story. US1 preserves the bottom-left badge awareness (already implemented, now regression-pinned against the extended shape). US2 adds the inline notes projection plus dialog section (the new value). US3 preserves the update actions. US1 alone is the MVP (awareness without notes); US1+US2 is the full request.

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Baseline confirmed before any story work

- [X] T001 Confirm baseline gates green via make check in Makefile (typecheck, lint, unit, integration, component)
- [X] T002 [P] Confirm spec artifacts present in specs/008-show-new-version/ (spec.md, plan.md, research.md, data-model.md, contracts/version-with-notes.md, quickstart.md)

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Shared test double confirmed before ANY user story can be implemented

**⚠️ CRITICAL**: No user story work can begin until this phase is complete

- [X] T003 Verify the local GitHub stand-in in tests/support/github-stand-in.ts serves `/repos/stefanwalther/ghn/releases/latest` with a release-shaped payload including `name`/`body`/`published_at` (defaultRelease branch already matches `releases/*`); extend only if verification shows a gap, same pattern as the existing `pulls`/`issues` branch

**Checkpoint**: Foundation ready - user story implementation can now begin

---

## Phase 3: User Story 1 - Notice a new version at the bottom left (Priority: P1) 🎯 MVP

**Goal**: Bottom-left footer shows running version always, plus latest version with attention indicator when an update exists; dialog opens only on badge click and closes via Not now/X/Escape/backdrop with focus returned and badge persisting; failures stay on plain version with no dialog.

**Independent Test**: Stub `/api/version` with newer `latest` and confirm badge plus no auto-open plus click-to-open; stub failure/disabled and confirm plain version only. Delivers awareness value even before notes render.

### Tests for User Story 1 (TDD: write FIRST, confirm FAIL, then implement) ⚠️

- [X] T004 [P] [US1] Unit tests for extended-shape backward compat in tests/unit/update-check.test.ts: `latest: null` forces `updateAvailable: false`; fallback/disabled/404/timeout returns `{ latest: null, releaseName: null, releaseBody: null, publishedAt: null }` with usable `releaseUrl`
- [X] T005 [P] [US1] Integration tests for GET /api/version backward compat in tests/integration/version-route.test.ts: success keeps `current`/`latest`/`updateAvailable`/`releaseUrl`/`checkedAt`; 404 keeps `{ updateAvailable: false, latest: null }` plus null notes fields; disabled check makes zero release requests
- [X] T006 [P] [US1] Component tests for badge contracts in tests/component/version-indicator.test.tsx: plain version on no-update, badge with `v9.9.9 available` plus indicator and no auto-open dialog on update, all four close paths return focus and keep badge, failure stays on plain version

### Implementation for User Story 1

- [X] T007 [US1] Extend the `UpdateInfo` interface in lib/update-check.ts with `releaseName: string | null`, `releaseBody: string | null`, `publishedAt: string | null`; extend `fallbackInfo` plus the `!res.ok`/`catch`/empty-tag paths to return all three as null (depends on T004)
- [X] T008 [US1] Forward the extended fields through components/version-indicator.tsx into `UpdatePopover` without changing badge gating (`updateAvailable === true && latest != null`), fetch contract (`GET /api/version`, `cache: no-store`), dialog chrome/position/portal/focus, or command blocks (depends on T006, T007)
- [X] T009 [US1] Run gates green via make check in Makefile: typecheck, lint, unit, integration, component

**Checkpoint**: At this point, User Story 1 is fully functional and testable independently

---

## Phase 4: User Story 2 - Read what is included without opening GitHub (Priority: P1)

**Goal**: Update dialog shows an inline "What's included" section with release title/version, publish date when available, and sanitized Markdown notes body; empty body shows an explicit empty state; partial/missing notes degrade quietly; long bodies scroll inside a capped container without hiding commands or close actions.

**Independent Test**: Stub `/api/version` with markdown body and confirm title/date/rendered body appear; stub null/empty body and confirm empty state; stub long body and confirm scroll container keeps commands reachable. Delivers informed-decision value without a browser.

### Tests for User Story 2 (TDD: write FIRST, confirm FAIL, then implement) ⚠️

- [X] T010 [P] [US2] Unit tests for notes projection in tests/unit/update-check.test.ts; data-model.md constraints quoted verbatim: "`releaseName`: Null/empty coerces to null; dialog falls back to tag line", "`releaseBody`: Null/undefined/whitespace-only coerces to null; null renders the empty state, never raw markup", "`publishedAt`: ISO string passthrough when parseable, else null"; plus `published_at` falls back to `created_at`, unparseable/missing yields null, and notes fields never force `updateAvailable` false on their own
- [X] T011 [P] [US2] Integration tests for the success variant in tests/integration/version-route.test.ts per specs/008-show-new-version/contracts/version-with-notes.md: scripted `name`/`body`/`published_at` projects verbatim (trimmed name, verbatim body), empty/whitespace/non-string coerces to null, `published_at` else `created_at`
- [X] T012 [P] [US2] Component tests for the notes section in tests/component/version-indicator.test.tsx: "What's included" heading with release name/version plus published date plus rendered Markdown (headings, list, link, code), "No release notes for this version." on null/empty body, missing title/date omitted silently, long body inside a capped scroll container (`max-h-64 overflow-y-auto`), unsafe HTML stripped, version line plus commands plus fallback link always present

### Implementation for User Story 2

- [X] T013 [US2] Implement the notes projection in lib/update-check.ts: read `name`/`body`/`published_at` (fallback `created_at`) from the same `releases/latest` response, apply the T010 coercion rules, keep 6h cache, 10s timeout, token reuse, and env overrides unchanged (depends on T010, T011)
- [X] T014 [US2] Add the "What's included in vY" section to components/update-popover.tsx between the version line and the command blocks: title/date line plus bordered scroll container rendering `releaseBody` via components/inbox/markdown.tsx with `repositoryUrl={GITHUB_REPO_URL}`, empty-state copy on null, quiet hint on partial data; keep `role dialog`, `aria-modal`, `aria-label "Update available"`, `data-testid "update-backdrop"`, `absolute bottom-16 left-4`, `max-w-md`, portal to `document.body`, focus handling, and command blocks byte-identical (depends on T012, T013)
- [X] T015 [US2] Wire the section props through components/version-indicator.tsx (`releaseName`/`releaseBody`/`publishedAt` from `UpdateInfo` into `UpdatePopover`) with no change to badge gating or fetch timing (depends on T013, T014)
- [X] T016 [US2] Run gates green via make check in Makefile: typecheck, lint, unit, integration, component

**Checkpoint**: At this point, User Stories 1 AND 2 both work independently

---

## Phase 5: User Story 3 - Act on the update from inside the dialog (Priority: P2)

**Goal**: Dialog action area stays intact alongside the new notes section: source-checkout and Docker command blocks with Copy/Copied feedback plus the outbound release link opening the tag URL in a new tab.

**Independent Test**: Open the dialog with notes present and confirm both command blocks plus the tag link behave exactly as before, with notes not pushing actions off-screen.

### Tests for User Story 3 (TDD: write FIRST, confirm FAIL, then implement) ⚠️

- [X] T017 [P] [US3] Component tests for the action area with notes present in tests/component/version-indicator.test.tsx: `SOURCE_UPDATE_COMMANDS` plus `DOCKER_UPDATE_COMMANDS` blocks render with Copy→Copied feedback, "View release notes for v9.9.9" has the tag `href` with `target _blank` plus `noopener noreferrer`, Not now plus X plus Escape plus backdrop all close

### Implementation for User Story 3

- [X] T018 [US3] Preserve the action area in components/update-popover.tsx: no command-copy change unless T017 fails; ensure the notes scroll container keeps both command blocks plus Not now reachable on narrow viewports (depends on T017)
- [X] T019 [US3] Run gates green via make check in Makefile: typecheck, lint, unit, integration, component

**Checkpoint**: All user stories are now independently functional

---

## Phase 6: Polish & Cross-Cutting Concerns

**Purpose**: Manual proof plus final gate

- [X] T020 [P] Run the full validation in specs/008-show-new-version/quickstart.md scenarios 1-8 against the local app and record the outcome
- [X] T021 Final gate via make check in Makefile plus scripts/coverage-ratchet.sh with no coverage drop

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies - starts immediately
- **Foundational (Phase 2)**: Depends on Setup - BLOCKS all user stories (stand-in `releases/latest` shape is required by every integration test)
- **User Stories (Phase 3+)**: All depend on Foundational completion
  - US1 → US2 → US3 sequentially: US2 extends the `UpdateInfo` shape US1 introduces and the `UpdatePopover` US1 forwards; US3 verifies the action area US2 reflows
  - Within a story: tests FAIL first, then implementation, then gates
- **Polish (Phase 6)**: Depends on all three user stories being complete

### User Story Dependencies

- **User Story 1 (P1)**: Starts after Foundational - no dependencies on other stories; delivers the MVP
- **User Story 2 (P1)**: Starts after US1 - needs the extended `UpdateInfo` type plus badge forwarding; independently testable per its notes matrix
- **User Story 3 (P2)**: Starts after US2 - needs the notes section layout to verify actions stay reachable; independently testable per its action matrix

### Within Each User Story

- Unit, integration, and component tests are written and confirmed FAIL before implementation
- `lib/update-check.ts` projection before `components/version-indicator.tsx` forwarding before `components/update-popover.tsx` section
- Gates run green before the checkpoint

### Parallel Opportunities

- T002 runs in parallel with T001 (artifact check vs gate run, different concerns)
- T004, T005, T006 run in parallel (three different test files: `tests/unit/update-check.test.ts`, `tests/integration/version-route.test.ts`, `tests/component/version-indicator.test.tsx`)
- T010, T011, T012 run in parallel (same three files, US2 additions, no overlap with each other)
- T020 runs in parallel with T021 preparation (manual quickstart validation vs gate run, different concerns)

---

## Parallel Example: User Story 2

```bash
# Launch all tests for User Story 2 together (different files, no dependencies):
Task: "Unit tests for notes projection in tests/unit/update-check.test.ts"
Task: "Integration tests for the success variant in tests/integration/version-route.test.ts"
Task: "Component tests for the notes section in tests/component/version-indicator.test.tsx"
```

---

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Complete Phase 1: Setup (T001-T002)
2. Complete Phase 2: Foundational (T003 - stand-in `releases/latest` shape)
3. Complete Phase 3: User Story 1 (T004-T009)
4. **STOP and VALIDATE**: Footer shows plain version vs badge correctly; dialog opens only on click and closes on all four paths with focus return; `make check` green
5. Deploy/demo if ready

### Incremental Delivery

1. Setup + Foundational → test doubles ready
2. Add US1 → badge awareness preserved against extended shape → validate (MVP!)
3. Add US2 → notes projection plus "What's included" section → validate notes/empty/scroll/sanitization matrix
4. Add US3 → action area intact alongside notes → validate commands plus link
5. Polish → quickstart scenarios 1-8 plus coverage ratchet

---

## Notes

- [P] tasks touch different files with no unmet dependencies; same-file tasks are always sequential
- [US1]/[US2]/[US3] labels map each story-phase task to its user story for traceability
- `lib/update-check.ts` is extended in US1 (T007 nulls fallback) and completed in US2 (T013 notes projection): cross-phase, never parallel
- `components/update-popover.tsx` gains its notes section in US2 (T014) and is verified for action preservation in US3 (T018): cross-phase, never parallel
- Verify each story's tests fail before implementing that story
- Commit after each task or logical group using conventional commits; release-please owns the changelog
- Data-model.md field constraints are quoted verbatim in T010 so validation is not left to implementation-time discretion
