# Contract: writeback_queue table

Applies to `db/schema.ts` and `db/ensure-schema.ts` (both must change together).

## DDL

```sql
CREATE TABLE IF NOT EXISTS writeback_queue (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  thread_id TEXT NOT NULL,
  action TEXT NOT NULL,
  attempts INTEGER NOT NULL DEFAULT 0,
  last_error TEXT,
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS writeback_queue_thread_action_idx
  ON writeback_queue (thread_id, action);
```

## Rules

- At most one selectable row per `(thread_id, action)`. Writers enforce this with delete-then-insert; no unique constraint in this pass.
- Drain selection excludes rows with `attempts >= 10` (capped poison rows stay stored with `last_error`, remain visible in depth and health, but are never retried).
- Terminal 404/410 failures delete the row immediately.
- Drain order is `ORDER BY id ASC`.
- Both DDL sites stay in sync: Drizzle `index()` in `db/schema.ts`, raw `CREATE INDEX IF NOT EXISTS` in `db/ensure-schema.ts` (tests run through `ensureSchema` only).
