# Research: Queue Hardening

**Feature**: `specs/007-queue-hardening/spec.md`
**Date**: 2026-11-08

## Decision 1: Index strategy follows the existing dual-DDL pattern

- **Decision**: Add `writeback_queue(thread_id)` plus composite `writeback_queue(thread_id, action)` coverage in both `db/schema.ts` (Drizzle `index()`) and `db/ensure-schema.ts` (`CREATE INDEX IF NOT EXISTS`), matching how `notifications(repo_id)` and `notifications(is_done)` are already doubled.
- **Rationale**: Prod runs `bun:sqlite` through Drizzle while tests run `node:sqlite` through `ensureSchema` only (`tests/support/db-client.node.ts:48`). An index declared in only one file would make prod fast and tests slow, or vice versa, and hide regressions.
- **Alternatives considered**: Single-file index (rejected: diverges prod and test paths); covering index over `(thread_id, action, id)` (rejected: overkill for 1-2k row queue, plain two-column index plus PK covers drain order).

## Decision 2: Depth check uses `count(*)` via Drizzle

- **Decision**: Replace the select-all-ids `queueDepth` in `lib/queue.ts:110` with a `SELECT COUNT(*)` using Drizzle's `count()` helper, returning a number with the same signature.
- **Rationale**: Depth is called on every sync response (`app/api/sync/route.ts:73`). Count avoids materializing up to 1500 row objects per call.
- **Alternatives considered**: Cached in-memory counter (rejected: stale across restarts, extra invalidation surface); `SELECT id` + length (status quo, rejected: linear memory per sync).

## Decision 3: Retry counting uses SQL-side increment

- **Decision**: Replace `set({ attempts: row.attempts + 1 })` in `lib/queue.ts:160` and `lib/queue.ts:225` with `set({ attempts: sql`${writebackQueue.attempts} + 1` })` so concurrent drains cannot clobber each other.
- **Rationale**: Both drains snapshot rows up front. Two overlapping failures computed from the same snapshot write back the same value today. SQL-side increment makes the write commutative.
- **Alternatives considered**: Serialize all DB writes through one mutex only (rejected: still leaves stale-read logic fragile); `SELECT FOR UPDATE` / claim column (rejected: SQLite has no row-level lock primitive worth the migration for this scale).

## Decision 4: Terminal failures drop, retryable failures cap at 10

- **Decision**: Treat HTTP 404 and 410 from thread write calls as terminal: delete the queue row on receipt. All other failures increment attempts; rows with `attempts >= 10` stop being retried (kept with `lastError` for diagnosis, excluded from drain selection). Auth, rate-limited, and network stay retryable below the cap. Cap default 10 per spec assumption.
- **Rationale**: A deleted thread returns 404 on DELETE/PATCH and will never succeed; today `lib/github.ts:63` maps it to `unknown` and it retries forever, inflating every sync. Cap bounds the only unbounded growth path without losing the reason.
- **Alternatives considered**: Infinite retry for everything (status quo, rejected: poison rows); immediate drop on any 4xx (rejected: auth loss would lose intents); dead-letter table (rejected: heavier than needed; capped rows with `lastError` are inspectable enough at this scale).

## Decision 5: Dedupe reuses delete-then-insert, no unique index yet

- **Decision**: Make the small-path `enqueueWriteback` in `lib/queue.ts:23` do the same delete-then-insert replacement the bulk path does in `lib/queue.ts:44`, inside the caller's transaction where one exists. No new unique constraint in this pass.
- **Rationale**: Reuses the proven replacement pattern, preserves newest `lastError` with reset attempts, and avoids a migration that must first backfill-dedupe existing duplicate rows before a unique index can be created.
- **Alternatives considered**: Unique index on `(thread_id, action)` (rejected for this pass: requires duplicate backfill plus conflict-clause changes on every writer; revisit if duplicates recur); no-op when identical row exists (rejected: would keep stale error text).

## Decision 6: Overlap control is an in-process drain mutex

- **Decision**: Serialize `drainWritebacks` and `drainQueue` behind one module-level promise-chain mutex in `lib/queue.ts`. Second drain waits for the first, then re-reads the queue (so replacements and withdrawals are visible). Remote calls stay idempotent as the safety net.
- **Rationale**: Single local process per constitution and spec assumption, so cross-process coordination is unnecessary. A promise chain needs no schema change, no claim expiry, and no reaper for crashed claims.
- **Alternatives considered**: `claimed_at` column with lease expiry (rejected: migration plus reaper plus clock edge cases for a single-process app); leaving overlap as-is (rejected: the exact burst the queue smooths doubles GitHub traffic and rate-limit risk).

## Decision 7: Queue health is additive on the sync contract

- **Decision**: Keep `queueDepth` and add `queueOldestAgeMs` plus `queueReasonBreakdown` to the `/api/sync` JSON response. All fields additive, existing clients ignore unknowns.
- **Rationale**: Diagnosis needs age and reason shape, not just depth, to tell stuck from poisoned. Additive fields keep the contract backward compatible.
- **Alternatives considered**: Separate `/api/queue/health` endpoint (rejected: extra surface for data sync already computes); replacing `queueDepth` (rejected: breaks existing UI polling).
