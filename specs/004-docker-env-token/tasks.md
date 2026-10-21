# Tasks: Docker Env Token Support

**Input**: Design documents from `/specs/004-docker-env-token/`
**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/, quickstart.md

**Organization**: Tasks grouped by user story. US1 and US2 are both P1. US3 and US4 are P2.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (US1-US4)
- Include exact file paths in descriptions

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Confirm ignored-env contract and toolchain before any code

- [X] T001 [P] Confirm `.env` stays ignored and `.env.example` stays tracked in `.gitignore`
- [X] T002 Verify Docker 29, compose v2, Bun 1.x, and gh 2.x versions per `specs/004-docker-env-token/research.md`

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Env-first token helper every story depends on

**⚠️ CRITICAL**: No user story work can begin until this phase is complete

- [X] T003 Implement env-first `readToken()` (`GH_TOKEN` then `GITHUB_TOKEN`, trim, empty as unset, fallback `gh auth token`) in `lib/github.ts`
- [X] T004 [P] Add unit tests for token precedence and empty-trim behavior in `tests/unit/github-env-token.test.ts`
- [X] T005 Update disconnected hints to mention `GH_TOKEN` alongside host login in `app/api/connection/route.ts` and `lib/rate-limits.ts`

**Checkpoint**: `bun test tests/unit/github-env-token.test.ts` passes with and without env set

---

## Phase 3: User Story 1 - Run app in container with env token (Priority: P1) 🎯 MVP

**Goal**: Container authenticates via env token with no `gh` install

**Independent Test**: `cp .env.example .env` with valid `GH_TOKEN`, `make up`, `GET /api/connection` reports `connected: true` and inbox sync loads live data

### Implementation for User Story 1

- [X] T006 [US1] Add token-parameter `fetch` path with `gh api` fallback in `lib/contributions.ts`
- [X] T007 [US1] Wire stored token through to contributions helpers in `app/api/contributions/route.ts`
- [X] T008 [P] [US1] Add unit tests for contributions token path in `tests/unit/contributions.test.ts`
- [X] T009 [P] [US1] Create container build in `Dockerfile` (`oven/bun:1`, install, build, `next start -p 21120`)
- [X] T010 [P] [US1] Create service definition with `env_file`, port `${PORT:-21120}:21120`, and `ghn-data:/app/data` volume in `compose.yaml`
- [X] T011 [P] [US1] Create placeholder-only token template in `.env.example`
- [X] T012 [US1] Smoke-test container auth and missing-token disconnected state per `specs/004-docker-env-token/quickstart.md`

**Checkpoint**: US1 works independently in a `gh`-free container

---

## Phase 4: User Story 2 - Keep local gh flow unchanged (Priority: P1)

**Goal**: No regression when env token is unset

**Independent Test**: Unset `GH_TOKEN`/`GITHUB_TOKEN`, run app locally with host session, sync and contributions succeed

- [X] T013 [US2] Verify host-session fallback with env unset via `bun test tests/unit` and local sync smoke in repo root
- [X] T014 [US2] Verify same-account env token and host session agree via `GET /api/connection` in repo root

**Checkpoint**: US1 and US2 both pass, env set and unset

---

## Phase 5: User Story 3 - Start and stop with Makefile (Priority: P2)

**Goal**: Repeatable `up`/`down` interface with log follow

**Independent Test**: `make up` serves the app, `make down` stops it, data survives restart

- [X] T015 [US3] Add `up`, `down`, and `logs` targets honoring `PORT ?= 21120` in `Makefile`
- [X] T016 [US3] Validate up/down/logs cycle plus `PORT` override and volume persistence per `specs/004-docker-env-token/quickstart.md`

**Checkpoint**: US3 works without manual `docker compose` commands

---

## Phase 6: User Story 4 - Follow README to configure (Priority: P2)

**Goal**: README-only setup with safe token handling

**Independent Test**: Fresh checkout follows README Docker section to a running app or a clear auth error

- [X] T017 [US4] Document token setup, `make up`/`make down`, port, data volume, and auth-vs-down troubleshooting in `README.md`
- [X] T018 [US4] Follow README Docker section verbatim on a clean checkout per `specs/004-docker-env-token/quickstart.md`

**Checkpoint**: All four stories independently functional

---

## Phase 7: Polish & Cross-Cutting Concerns

**Purpose**: Gates before handoff

- [X] T019 Run `bun run typecheck` and `bun run lint` in repo root and fix findings
- [X] T020 Run full `specs/004-docker-env-token/quickstart.md` validation including failure drills in repo root
- [X] T021 [P] Confirm no token committed via `git status --short` and `git diff --check` in repo root

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies, start immediately
- **Foundational (Phase 2)**: Depends on Setup, BLOCKS all user stories
- **User Stories (Phases 3-6)**: Depend on Foundational, run sequentially P1 to P2 or in parallel if staffed
- **Polish (Phase 7)**: Depends on all desired stories

### User Story Dependencies

- **US1 (P1)**: Starts after Foundational, no other story dependency
- **US2 (P1)**: Starts after Foundational, verifies US1 did not regress local flow
- **US3 (P2)**: Starts after Foundational, uses US1 container files
- **US4 (P2)**: Starts after US3 targets exist, documents them

### Within Each User Story

- Token helper before contributions wiring before container smoke
- Container files (`Dockerfile`, `compose.yaml`, `.env.example`) are independent of each other
- Story complete and smoke-tested before next priority

### Parallel Opportunities

- T001 and T004-T005 touch different files and can run in parallel once T003 interface is agreed
- T008, T009, T010, T011 touch different files and can run in parallel
- T021 can run alongside T019-T020

---

## Parallel Example: User Story 1

```bash
# Launch independent US1 file tasks together:
Task: "Add unit tests for contributions token path in tests/unit/contributions.test.ts"
Task: "Create container build in Dockerfile"
Task: "Create service definition in compose.yaml"
Task: "Create placeholder-only token template in .env.example"
```

---

## Implementation Strategy

### MVP First (US1 Only)

1. Complete Phase 1 Setup
2. Complete Phase 2 Foundational
3. Complete Phase 3 US1
4. STOP and VALIDATE per US1 independent test
5. Demo if ready

### Incremental Delivery

1. Setup plus Foundational, foundation ready
2. Add US1, test independently, demo (MVP)
3. Add US2 regression check, demo
4. Add US3 Makefile targets, demo
5. Add US4 README docs, demo

---

## Notes

- [P] tasks touch different files with no dependencies
- [Story] label maps each story-phase task to its user story
- Stop at any checkpoint to validate the story independently
- Never commit `.env`, never log token values
