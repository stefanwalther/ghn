# Quickstart: Queue Hardening validation

Proves the hardening end to end against the offline stand-in. No live GitHub contact.

## Prerequisites

- Bun dependencies installed (`bun install`).
- Offline mode: tests set `GHN_TOKEN` empty or point `GHN_API_BASE` at the local stand-in (see `tests/support/http-stub.ts`).

## Run the queue suites

```bash
bun x vitest run --project unit tests/unit/queue.test.ts tests/unit/queue-retry.test.ts
bun x vitest run --project unit tests/unit/writeback.test.ts tests/unit/bulk-writeback.test.ts
bun x vitest run --project integration tests/integration/notifications-route.test.ts
```

Expected: all green. These suites own withdrawal, mid-flight replacement, retry counting, and `queueDepth` in the sync response.

## Validate each story manually

1. **Poison drop**: seed one row whose thread returns 404 plus one good row; run the drain; good row drains, 404 row is gone, next sync does not retry it.
2. **Cap**: seed a row failing with 500 ten times; after the tenth failure it is excluded from drain selection with `lastError` intact.
3. **Speed**: seed 1500 rows; `queueDepth` and pending-id checks return in under 500 ms without loading full rows.
4. **Dedupe**: enqueue the same `(thread_id, action)` twice via the small path; exactly one row remains with the newest reason and `attempts 0`.
5. **Single-flight**: gate the remote call, start a background drain and a sync drain over the same 100 ids; count at most 100 remote writes.
6. **Health**: with mixed `network` and `rate_limited` rows, `/api/sync` returns `queueDepth`, `queueOldestAgeMs`, and a `queueReasonBreakdown` that sums to depth.

## Full gates before merge

```bash
bun run typecheck && bun run lint
bun x vitest run --project unit
bun x vitest run --project integration
bun x vitest run --project component
```
