# Implementation Plan: Live GitHub Sync

**Branch**: `002-live-github-sync` | **Date**: 2026-10-16 | **Spec**: [specs/002-live-github-sync/spec.md](./spec.md)

**Input**: Feature specification from `/specs/002-live-github-sync/spec.md`

## Summary

Replace the prototype's mocked seed inbox with a live GitHub mirror that keeps every proven interaction: one list with bulk Done/Unread, per-repo digest rhythms with a dimmed collapsed section, and a round-trip-safe back path. Sync and write-back reuse the server's existing `gh` CLI session (`GET /notifications` with `all=true` pagination, conditional polling on the advertised 60s interval, Done via thread delete, read via thread patch, local-only unread), persist rhythms across a one-way seed-to-live migration, auto-discover new repos with quiet defaults, and stay readable offline with explicit stale/disconnected states.

## Technical Context

**Language/Version**: TypeScript 5.x, Bun 1.2+ as runtime and package manager

**Primary Dependencies**: Next.js 15 App Router + React 19, Tailwind CSS v4 with w5r tokens, shadcn/ui local primitives, drizzle-orm with bun:sqlite driver, lucide-react, `gh` CLI 2.x as the GitHub transport (same pattern as `lib/contributions.ts`)

**Storage**: Local SQLite file `data/quiet-notifications.db` via drizzle-orm. Existing `repositories` and `notifications` tables evolve per `data-model.md` (thread-id keys, raw GitHub reasons, `githubUpdatedAt`, `localUnread`, `subjectType`, repo `unreachable` flag) plus new `sync_state` and `writeback_queue` tables. No server DB, no multi-user sync.

**Testing**: `bun test` for reason mapping, sync merge/conflict rules, digest boundaries on live-discovered repos, and queue drain order; recorded-fixture contract tests for the sync adapter (no live calls in CI); Playwright fixture-mode smoke for inbox load, bulk Done with queued write-back, digest collapse/promote, and filter persistence; `bun run typecheck` and `bun run lint` as gates

**Target Platform**: Local single-user app on macOS, modern Chromium/Safari/Firefox, light/dark/system theme

**Project Type**: Web application, Next.js monolith (App Router pages + Route Handlers for local API and sync)

**Performance Goals**: First live screen fast on hundreds of threads (server-side grouping, paged GitHub fetch); bulk 20-item round-trip under 500ms excluding GitHub latency; manual refresh brings new GitHub items within 1 minute; done/read agreement with the GitHub website within 5 minutes; never poll faster than the advertised `X-Poll-Interval` (observed 60s)

**Constraints**: Single-user local only (spec Q3); reuse `gh` CLI session, no token UI or secret storage (spec Q1); GitHub Done semantics for Done (spec Q2) with unread as documented local-only (no remote endpoint); cached inbox stays readable with last-synced time, never stale-as-fresh; seed rows never mix with live rows; w5r-design token and primary-scarcity rules hold

**Scale/Scope**: 1 user, real notification volume (hundreds of threads), 2 pages (inbox, repositories), 1 collapsed digest section, sync + connection + evolved inbox/bulk/repositories handlers

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

Constitution at `.specify/memory/constitution.md` is an unratified placeholder template with no enforceable principles, so there are no gates to violate. Plan proceeds with project-level guards instead:

- [x] Single-user local scope holds, no auth UI or multi-tenant complexity added
- [x] Reused `gh` session verified live against `GET /notifications` before planning
- [x] Write-back limited to documented GitHub semantics, unread honestly local-only
- [x] Seed/live separation enforced by migration plus route gating, not convention
- [x] Digest math and triage path shared between seed and live, no second logic fork
- [x] w5r-design token and primary-scarcity rules adopted as UI gates (see 001 research R3, carried over)

Post-design re-check: PASS, no new violations introduced. No Complexity Tracking entries required.

## Project Structure

### Documentation (this feature)

```text
specs/002-live-github-sync/
├── plan.md              # This file (/speckit-plan command output)
├── research.md          # Phase 0 output (/speckit-plan command)
├── data-model.md        # Phase 1 output (/speckit-plan command)
├── quickstart.md        # Phase 1 output (/speckit-plan command)
├── contracts/           # Phase 1 output (/speckit-plan command)
│   └── sync-api.md      # sync, connection, and live deltas vs 001 contracts
└── tasks.md             # Phase 2 output (/speckit-tasks command - NOT created by /speckit-plan)
```

Prior feature contracts reused as-is: `specs/001-quiet-notifications/contracts/inbox-api.md`, `digest-api.md`, `contributions-api.md`. Live deltas are documented in `sync-api.md` only.

### Source Code (repository root)

```text
app/
├── layout.tsx                         # unchanged w5r shell
├── page.tsx                            # inbox + last-synced header, stale/disconnected banners, live facets
├── repos/page.tsx                       # carries rhythms, shows discovered defaults + unreachable badges
└── api/
    ├── notifications/route.ts          # GET adds lastSyncAt/stale + raw-reason facets
    ├── notifications/bulk/route.ts     # POST adds per-thread GitHub write-back + queue fallback
    ├── notifications/seed/route.ts     # POST refuses when live rows exist (409 unless forced dev)
    ├── repositories/route.ts           # GET adds unreachable flag, discovered defaults
    ├── repositories/[id]/route.ts      # PATCH unchanged rhythm/snooze contract
    ├── contributions/route.ts          # unchanged, shares gh session probe
    ├── sync/route.ts                   # NEW POST full/incremental sync + migration + queue drain
    └── connection/route.ts             # NEW GET gh session presence + viewer login

components/
├── inbox/                              # notification-list, bulk-bar, digest-section, inbox-filters, empty-states (stale/disconnected additions)
├── repos/                              # repo-row (default-rhythm helper, unreachable badge)
└── ui/                                 # shadcn primitives (unchanged)

lib/
├── digest.ts                           # unchanged math, applied to live rows
├── snooze.ts                           # unchanged
├── filters.ts                          # TYPE_FILTERS extended to live reason union
├── view-state.ts                       # unchanged (URL + sessionStorage)
├── bulk.ts                             # unchanged validation, callers handle remote summary
├── seed.ts                             # unchanged generator, gated by route + UI
├── contributions.ts                    # unchanged, session pattern reused
├── github.ts                           # NEW gh CLI transport (paged GET, conditional headers, thread patch/delete, subscription ignore)
├── sync.ts                             # NEW merge rules (upsert, remote-done, localUnread preserve, discovery defaults)
└── queue.ts                            # NEW write-back queue helpers (enqueue, drain FIFO)

db/
├── schema.ts                           # notifications + repositories evolution, sync_state + writeback_queue
└── client.ts                           # unchanged bun:sqlite connection

data/
└── quiet-notifications.db              # local sqlite file (gitignored), migrated in place

tests/
├── unit/sync.test.ts                   # NEW mapping, merge, conflict, discovery defaults, queue order
├── unit/digest.test.ts                  # extended with live-discovered repo cases
├── unit/bulk.test.ts                    # extended with remote partial/queued summary
└── e2e/inbox.spec.ts                    # extended fixture mode: live-shaped rows, stale banner, digest promote
```

**Structure Decision**: Single Next.js App Router monolith at the repo root, same as `001-quiet-notifications`. Route Handlers own SQLite plus the `gh` CLI transport; pages stay server-first with small client islands for selection, collapsed state, and sync status. New code lives in `lib/github.ts`, `lib/sync.ts`, `lib/queue.ts`, and two new routes, keeping digest, filter, and view-state modules untouched.

## Complexity Tracking

> No violations to justify. Single project, no extra patterns.

| Violation | Why Needed | Simpler Alternative Rejected Because |
|-----------|------------|-------------------------------------|
| — | — | — |
