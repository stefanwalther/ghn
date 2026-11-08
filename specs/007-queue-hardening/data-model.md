# Data Model: Queue Hardening

**Feature**: `specs/007-queue-hardening/spec.md`
**Date**: 2026-11-08

No new tables. The change tightens the existing `writeback_queue` row lifecycle plus a derived health projection.

## Entity: Writeback item (existing table, tightened)

| Field | Meaning | Rule |
|---|---|---|
| `id` | Row identity, autoincrement | Unchanged, drain order stays `ORDER BY id ASC` |
| `thread_id` | GitHub thread the intent targets | Required, non-empty; indexed lookup by `(thread_id, action)` |
| `action` | Pending intent: `done`, `read`, `unsubscribe` | Required, one of the three; pair `(thread_id, action)` holds at most one row |
| `attempts` | Failed drain count | Starts 0, SQL-side `+1` only, never reset except by replacement re-enqueue |
| `last_error` | Newest failure reason | Overwritten on each failure; preserved when a row hits the cap |
| `created_at` | Enqueue time in ms | Unchanged; drives oldest-age health |

Relationships: none enforced by FK. `thread_id` references a notification id loosely; rows may outlive their notification (deleted threads are exactly the terminal-drop case).

## State transitions

- `queued` -> `draining`: drain selects the row.
- `draining` -> gone (`succeeded`): remote ok and row still present; delete by `id`.
- `draining` -> `queued` with `attempts + 1` (`failed retryable`): remote failed below cap; row stays selectable.
- `draining` -> gone (`terminal`): remote returned 404/410; delete by `id`.
- `draining` -> `capped`: remote failed and `attempts` reached 10; row stays stored with `lastError` but is excluded from future drain selection.
- `queued` -> gone (`withdrawn`): user marks unread; delete by `thread_id` before any remote call.
- `queued` -> `queued` fresh (`replaced`): re-enqueue of same `(thread_id, action)` deletes the old row and inserts a new one with `attempts 0` and newest `last_error`.
- `draining` -> skipped: row disappeared or was replaced mid-drain; in-flight result touches only the ids it selected.

## Entity: Queue health (derived, not stored)

- `queueDepth`: count of all stored rows via `COUNT(*)`; capped rows stay visible here so poison is diagnosable, drains skip them.
- `queueOldestAgeMs`: `now - MIN(created_at)` over stored rows, 0 when empty.
- `queueReasonBreakdown`: counts per `last_error` value over stored rows.

Validation: depth is a non-negative integer; age is 0 when depth is 0; breakdown sums to depth.
