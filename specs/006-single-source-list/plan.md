# Implementation Plan: Single-Source Inbox List

**Branch**: `t3/red-eye-006-single-source-list` | **Date**: 2026-10-27 | **Spec**: specs/006-single-source-list/spec.md

**Input**: Feature specification from `specs/006-single-source-list/spec.md`

## Summary

One shared inbox list drives every view. The local working copy and the blind serverList copy effect go away, optimistic updates with rollback stay, a pending-mutation guard stops pre-commit refetches from restoring triaged rows, all-view done marks in place, sync keeps the P2/P3 precedence, queued versus settled reads distinctly, mute beats rhythm, and pin groups the repos page. Regression tests from the backbone work stay green throughout.

## Technical Context

**Language/Version**: TypeScript 5, Bun runtime and package manager

**Primary Dependencies**: Next.js 15 App Router, React 19, TanStack Query plus Zustand (existing), Tailwind 4, Drizzle ORM

**Storage**: SQLite via Drizzle, local-first; one additive nullable-or-defaulted column for pin with ensure-schema migration

**Testing**: Vitest unit (pure rules), integration (routes plus DB plus GitHub stand-in), component (React in DOM), Playwright e2e (built app, separate gate)

**Target Platform**: Local web app, default port 21120

**Project Type**: Web application, single project

**Performance Goals**: Optimistic list change renders in the same frame as the action; no extra notifications fetch per user action versus today

**Constraints**: Offline-capable local-first; test suite never contacts real GitHub and never mutates a real account; no secret handling changes

**Scale/Scope**: One inbox page, one repos page, bulk plus sync flows; 6 stories phased 1-6

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

- I Local-First, No Secret Files: PASS. No credential changes. Pin column is local metadata. Stand-in only in tests.
- II Test-First With Offline Suite (NON-NEGOTIABLE): PASS. TDD required per story; new behavior gets coverage at its layer; existing revive and all-view regression tests stay green.
- III Simplicity Over Abstraction: PASS with one justified addition. Pin uses a repositories column plus the existing PATCH flow instead of a parallel localStorage store, because repo attributes already live, migrate, seed and sync in that table and a second store would need its own merge, ordering and cleanup rules. No new abstraction, no new backend route.
- IV Gates Before Merge: PASS. All five gates plus the coverage ratchet run before the PR; e2e stays separate.
- V Small Reviewable Changes: PASS. Stories land in phase order as small commits; plan re-checks after design.

## Project Structure

### Documentation (this feature)

```text
specs/006-single-source-list/
├── plan.md              # This file
├── research.md          # Phase 0 output
├── data-model.md        # Phase 1 output
├── quickstart.md        # Phase 1 output
├── contracts/           # Phase 1 output
├── tasks.md             # Phase 2 output (speckit-tasks)
└── red-eye-ledger.md    # Overnight run ledger
```

### Source Code (repository root)

```text
app/
├── page.tsx                    # inbox, list derives from shared cache
├── api/notifications/          # GET list, POST bulk triage
├── api/sync/route.ts           # precedence guard lives here
├── api/repositories/           # GET shape plus PATCH pin
└── repos/page.tsx               # pinned section grouping
components/inbox/                # list, drawer, sidebar, digest, bulk bar
components/repos/repo-row.tsx    # pin toggle
lib/
├── queries.ts                   # shared cache, optimistic mutations, gate
├── inbox-state.ts               # pure optimistic helpers
├── sync.ts                      # upsert plus remote-done precedence
├── digest.ts lib/snooze.ts      # placement math, unchanged semantics
db/schema.ts db/ensure-schema.ts # pin column plus migration
tests/unit/ tests/integration/ tests/component/ tests/e2e/
```

**Structure Decision**: Single-project web layout as it exists. No new directories except spec artifacts. Pin reuses the repositories PATCH flow.

## Complexity Tracking

| Violation | Why Needed | Simpler Alternative Rejected Because |
|-----------|------------|-------------------------------------|
| Schema addition (pin column) under Principle III | Repo grouping must persist with repo attributes across seed, sync and prune | localStorage side-store would need parallel merge, ordering and cleanup rules for the same rows |

## Post-design Constitution Re-check

- I: PASS, no credential or secret surface changes.
- II: PASS, per-story TDD mapping in quickstart; stand-in only.
- III: PASS, pin justification above stands; cache-direct removes code rather than adding abstraction.
- IV: PASS, gates unchanged.
- V: PASS, phase-ordered small commits.
