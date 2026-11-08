# Tasks: Release Preview in Inbox Drawer

**Input**: Design documents from `specs/007-release-preview/`

**Prerequisites**: plan.md (required), spec.md (required for user stories), research.md, data-model.md, contracts/

**Tests**: Included per story. Constitution principle II mandates TDD: tests fail first, then implement. New behavior gets coverage at its layer (unit for pure rules, integration for route plus client plus stand-in, component for drawer DOM, e2e for the built-app journey). The suite never contacts real GitHub; the loopback guard fails any test that tries.

**Organization**: Grouped by user story. Each story is independently testable. US1 delivers the notes preview end to end; US2 adds version badges plus tag/commit line to the same component; US3 adds the assets list.

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Baseline confirmed before any story work

- [X] T001 Confirm baseline gates green via make check in Makefile (typecheck, lint, unit, integration, component)
- [X] T002 [P] Confirm spec artifacts present in specs/007-release-preview/ (spec.md, plan.md, research.md, data-model.md, contracts/thread-release.md, quickstart.md)

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Shared test infrastructure that MUST be complete before ANY user story can be implemented

**⚠️ CRITICAL**: No user story work can begin until this phase is complete

- [X] T003 Extend the local GitHub stand-in in tests/support/github-stand-in.ts to serve release subject paths (`/repos/{owner}/{repo}/releases/{id}` and `/repos/{owner}/{repo}/releases/tags/{tag}`) with a default payload plus `setSubject` override support, same pattern as the existing `pulls`/`issues` branch

**Checkpoint**: Foundation ready - user story implementation can now begin

---

## Phase 3: User Story 1 - Read release notes without leaving ghn (Priority: P1) 🎯 MVP

**Goal**: Selecting a release notification renders the release title, version/tag, publisher plus date, and notes body in the preview drawer; empty bodies show "No description."; failed loads show the unavailable state with the continue-on-GitHub link, never the legacy "No preview for releases" message.

**Independent Test**: Open a scripted pre-release row in `tests/component/components.test.tsx` and `tests/integration/thread-route.test.ts` fixtures and confirm title, tag, author/date, and rendered body appear without a browser; null body renders "No description."; 404 release renders the unavailable state with a working link.

### Tests for User Story 1 (TDD: write FIRST, confirm FAIL, then implement) ⚠️

- [X] T004 [P] [US1] Unit tests for release tag parsing (`.../releases/tag/{tag}` including nested tags) and release API URL derivation in tests/unit/github-release.test.ts
- [X] T005 [P] [US1] Integration tests for the Release branch of GET /api/thread in tests/integration/thread-route.test.ts: live thread URL wins, tag fallback works, 422 when neither resolves, 502 on fetch failure, loopback guard stays clean
- [X] T006 [P] [US1] Component tests for drawer release notes rendering in tests/component/components.test.tsx: title plus tag plus author/date plus body visible, "No description." on null body, unavailable state with "Open in new window" on fetch failure, triage buttons intact

### Implementation for User Story 1

- [X] T007 [US1] Implement `fetchRelease` plus release URL parsers in lib/github.ts (depends on T004)
- [X] T008 [US1] Add the Release branch to GET /api/thread in app/api/thread/route.ts per specs/007-release-preview/contracts/thread-release.md: resolution order live-thread-URL then tag fallback then 422, `comments: []`, `checks: null`, `runs: []`, `fetch_failed` maps to 502 (depends on T005, T007)
- [X] T009 [US1] Extend `ThreadDetailsResponse` with the `release` field in lib/queries.ts (depends on T008)
- [X] T010 [US1] Create the ReleasePreview presentational component in components/inbox/release-preview.tsx: title, tag plus target line, author plus published line, markdown body via the existing Markdown component with the "No description." empty state (depends on T006)
- [X] T011 [US1] Wire the `release` branch into the derived memo plus render path in components/inbox/item-drawer.tsx and update the fallback copy to "renders issues, pull requests, releases, and security alerts" (depends on T008, T009, T010)
- [X] T012 [US1] Update the legacy release expectation in tests/component/components.test.tsx ("No preview for releases" only ever applied to Release rows; releases now render or show the unavailable state)
- [X] T013 [US1] Run gates green via make check in Makefile: typecheck, lint, unit, integration, component

**Checkpoint**: At this point, User Story 1 is fully functional and testable independently

---

## Phase 4: User Story 2 - Judge release relevance from version metadata (Priority: P2)

**Goal**: Pre-release, draft, and final releases are distinguishable at a glance via badges, with the tag plus target commit reference shown beside them.

**Independent Test**: Script one pre-release, one draft, and one final release through the fixtures in tests/integration/thread-route.test.ts and tests/component/components.test.tsx and confirm the `pre-release` badge, `draft` badge, and no-badge states plus the tag/target line each render correctly.

### Tests for User Story 2 (TDD: write FIRST, confirm FAIL, then implement) ⚠️

- [X] T014 [P] [US2] Unit tests for badge rules in tests/unit/github-release.test.ts: `draft=true` shows draft regardless of `prerelease`; `prerelease=true, draft=false` shows pre-release; both false shows neither
- [X] T015 [P] [US2] Integration tests for metadata projection in tests/integration/thread-route.test.ts: `draft`, `prerelease`, `targetRef` from `target_commitish`, `authorLogin`, `publishedAt` with `published_at` falling back to `created_at` and unparseable dates yielding `null`
- [X] T016 [P] [US2] Component tests for badges plus tag/target line in tests/component/components.test.tsx: pre-release badge, draft badge, final release shows neither

### Implementation for User Story 2

- [X] T017 [US2] Extend the ReleasePreview component in components/inbox/release-preview.tsx with `pre-release`/`draft` badges and the tag plus `targetRef` line; data-model.md constraint quoted verbatim: "`tagName`: Required; empty means the payload is invalid and the preview is unavailable" (depends on T014, T015, T016)
- [X] T018 [US2] Run gates green via make check in Makefile: typecheck, lint, unit, integration, component

**Checkpoint**: At this point, User Stories 1 AND 2 both work independently

---

## Phase 5: User Story 3 - Inspect release assets without opening GitHub (Priority: P3)

**Goal**: Releases with assets show an `Assets (N)` section with each file name, human-readable size, and working download link; releases without assets hide the section; long lists scroll inside the drawer without breaking triage.

**Independent Test**: Script a 2-asset release (one asset missing `size`), an empty-asset release, and a 30-asset release through the fixtures and confirm the count, names, sizes, links, hidden section, and scrollable drawer with usable triage buttons.

### Tests for User Story 3 (TDD: write FIRST, confirm FAIL, then implement) ⚠️

- [X] T019 [P] [US3] Unit tests for asset projection rules in tests/unit/github-release.test.ts; data-model.md constraints quoted verbatim: "non-array `assets` coerces to `[]`", "entries without a name are skipped", asset rows with absent `size`/`downloadUrl` show the name only
- [X] T020 [P] [US3] Integration tests for assets projection in tests/integration/thread-route.test.ts: populated list projects name plus size plus `browser_download_url`; `assets: []` passes through
- [X] T021 [P] [US3] Component tests for the Assets section in tests/component/components.test.tsx: `Assets (N)` heading with names, human-readable sizes, and download links; section hidden when empty; 30-asset list scrolls with triage buttons usable

### Implementation for User Story 3

- [X] T022 [US3] Extend the ReleasePreview component in components/inbox/release-preview.tsx with the Assets section: `Assets (N)` heading, one row per asset (name linked to `downloadUrl` with `target="_blank" rel="noopener noreferrer"`, human-readable size), section hidden when the list is empty (depends on T019, T020, T021)
- [X] T023 [US3] Run gates green via make check in Makefile: typecheck, lint, unit, integration, component

**Checkpoint**: All user stories are now independently functional

---

## Phase 6: Polish & Cross-Cutting Concerns

**Purpose**: End-to-end proof plus final gate

- [X] T024 [P] Add the release triage journey to tests/e2e/release-preview.spec.ts (new file): open a scripted pre-release with assets on the built app, assert badges plus body plus assets render, triage via Done without opening a browser
- [X] T025 Run the full validation in specs/007-release-preview/quickstart.md scenarios 1-7 against the local app and record the outcome
- [X] T026 Final gate via make check in Makefile plus scripts/coverage-ratchet.sh with no coverage drop

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies - starts immediately
- **Foundational (Phase 2)**: Depends on Setup - BLOCKS all user stories (stand-in release paths are required by every integration test)
- **User Stories (Phase 3+)**: All depend on Foundational completion
  - US1 → US2 → US3 sequentially: US2 and US3 extend `components/inbox/release-preview.tsx`, which US1 creates
  - Within a story: tests FAIL first, then implementation, then gates
- **Polish (Phase 6)**: Depends on all three user stories being complete

### User Story Dependencies

- **User Story 1 (P1)**: Starts after Foundational - no dependencies on other stories; delivers the MVP
- **User Story 2 (P2)**: Starts after US1 - extends the US1 component with badges plus tag/target line; independently testable per its badge matrix
- **User Story 3 (P3)**: Starts after US1 (needs the component and route branch) - extends the component with the Assets section; independently testable per its asset matrix

### Within Each User Story

- Unit, integration, and component tests are written and confirmed FAIL before implementation
- `lib/github.ts` helper before `app/api/thread/route.ts` branch before `lib/queries.ts` type before component before `item-drawer.tsx` wiring
- Gates run green before the checkpoint

### Parallel Opportunities

- T002 runs in parallel with T001 (artifact check vs gate run, different concerns)
- T004, T005, T006 run in parallel (three different test files: `tests/unit/github-release.test.ts`, `tests/integration/thread-route.test.ts`, `tests/component/components.test.tsx`)
- T014, T015, T016 run in parallel (same three files, US2 additions, no overlap with each other)
- T019, T020, T021 run in parallel (same three files, US3 additions)
- T024 runs in parallel with T025 (new e2e file vs manual quickstart validation)

---

## Parallel Example: User Story 1

```bash
# Launch all tests for User Story 1 together (different files, no dependencies):
Task: "Unit tests for release tag parsing in tests/unit/github-release.test.ts"
Task: "Integration tests for the Release branch in tests/integration/thread-route.test.ts"
Task: "Component tests for drawer release notes in tests/component/components.test.tsx"
```

---

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Complete Phase 1: Setup (T001-T002)
2. Complete Phase 2: Foundational (T003 - stand-in release paths)
3. Complete Phase 3: User Story 1 (T004-T013)
4. **STOP and VALIDATE**: Release title, tag, author/date, and notes render in the drawer; empty and failed states behave; `make check` green
5. Deploy/demo if ready

### Incremental Delivery

1. Setup + Foundational → test doubles ready
2. Add US1 → notes preview works → validate (MVP!)
3. Add US2 → badges plus tag/commit line → validate badge matrix
4. Add US3 → assets list → validate asset matrix plus scroll
5. Polish → e2e journey plus quickstart scenarios 1-7 plus coverage ratchet

---

## Notes

- [P] tasks touch different files with no unmet dependencies; same-file tasks are always sequential
- [US1]/[US2]/[US3] labels map each story-phase task to its user story for traceability
- `components/inbox/release-preview.tsx` is created in US1 (T010) and extended in US2 (T017) and US3 (T022): cross-phase, never parallel
- Verify each story's tests fail before implementing that story
- Commit after each task or logical group using conventional commits; release-please owns the changelog
- Data-model.md field constraints are quoted verbatim in T017 and T019 so validation is not left to implementation-time discretion
