# Implementation Plan: Queue Hardening

**Branch**: `007-queue-hardening` | **Date**: 2026-11-08 | **Spec**: [spec.md](spec.md)

**Input**: Feature specification from `/specs/007-queue-hardening/spec.md`

## Summary

The SQLite `writeback_queue` is now the triage backbone. This plan hardens it without new services: indexed lookups plus `COUNT(*)` depth, SQL-side attempt increments, terminal-drop for deleted threads with a 10-attempt cap, small-path dedupe via the existing delete-then-insert pattern, an in-process drain mutex, and additive queue-health fields on the sync response. Approach follows `research.md` Decisions 1-7.

## Technical Context

**Language/Version**: TypeScript 5.7 on Bun, Next.js 15.1.6, React 19

**Primary Dependencies**: Drizzle ORM 0.45 (`bun:sqlite` prod, `sqlite-proxy` over `node:sqlite` in tests), Next.js App Router, Vitest 5

**Storage**: SQLite local file (prod) and `:memory:` (tests); single `writeback_queue` table, dual DDL in `db/schema.ts` plus `db/ensure-schema.ts`

**Testing**: Vitest projects unit, integration, component; Playwright e2e out of the fast gate; offline GitHub stand-in via `tests/support/http-stub.ts`

**Target Platform**: Local server plus Docker on port 21120, single process

**Project Type**: Web application (Next.js full-stack, local-first)

**Performance Goals**: 1000-item bulk responds in under 2s with background write-back; depth and pending checks under 500ms at 1500 queued rows

**Constraints**: Single process, no new services or brokers, offline-capable, additive sync API only, no live GitHub in tests

**Scale/Scope**: Single-user inbox; queue bursts of 1-2k rows from repo-wide bulk actions

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

- **I. Local-First, No Secret Files**: PASS. No new services, tokens, or bindings. SQLite only, existing `gh` auth path untouched.
- **II. Test-First With Offline Suite**: PASS. Plan requires unit coverage for counting/dedupe/cap/terminal-drop plus integration coverage for sync health and drain overlap, all against the local stand-in. No live GitHub.
- **III. Simplicity Over Abstraction**: PASS. Reuses delete-then-insert and idempotent remotes; mutex is one promise chain, not a lock service; unique index and dead-letter table explicitly deferred (see research). No new abstraction layers.
- **IV. Gates Before Merge**: PASS. `typecheck`, `lint`, `test:unit`, `test:integration`, `test:component` stay green; coverage ratchet must not drop.
- **V. Small Reviewable Changes**: PASS with note. Five quick items ship as one backbone feature because they share one table and one lifecycle; tasks slice them per story so each lands reviewably. No unrelated scope.

Post-design re-check: PASS, unchanged. Design added no new services, no auth changes, no client-state changes.

## Project Structure

### Documentation (this feature)

```text
specs/007-queue-hardening/
├── plan.md              # This file (/speckit-plan command output)
├── research.md          # Phase 0 output (/speckit-plan command)
├── data-model.md        # Phase 1 output (/speckit-plan command)
├── quickstart.md        # Phase 1 output (/speckit-plan command)
├── contracts/           # Phase 1 output (/speckit-plan command)
│   ├── queue-table.md
│   └── queue-health-api.md
└── tasks.md             # Phase 2 output (/speckit-tasks command - NOT created by /speckit-plan)
```

### Source Code (repository root)

```text
app/
├── api/
│   ├── notifications/bulk/route.ts   # small-path dedupe, scheduleBackground callers
│   └── sync/route.ts                 # drain entry, queue health response
db/
├── schema.ts                         # Drizzle table plus new indexes
├── ensure-schema.ts                  # raw DDL mirror plus new indexes
└── client.ts                         # unchanged single-handle entry
lib/
├── queue.ts                          # count depth, atomic increments, cap, terminal drop, mutex
├── github.ts                         # 404/410 terminal classification surface
└── sync.ts                           # mapWithLimit reuse, reapplyPendingReads unchanged
tests/
├── unit/
│   ├── queue.test.ts                 # index/dedupe/count/cap/terminal cases
│   ├── queue-retry.test.ts           # atomic increment and cap cases
│   ├── writeback.test.ts             # drain lifecycle cases
│   └── bulk-writeback.test.ts        # small-path dedupe cases
├── integration/
│   └── notifications-route.test.ts   # sync health fields, overlap behavior
└── support/
    ├── db-client.node.ts             # ensureSchema-backed test DB
    └── http-stub.ts                  # offline GitHub stand-in
```

**Structure Decision**: Single Next.js project with colocated `lib/` queue module and `db/` dual-DDL schema. No new top-level packages. Contracts document the table DDL and the additive sync fields; behavior stays in `lib/queue.ts` with route thin callers.

## Complexity Tracking

No constitution violations. Table left intentionally empty.
