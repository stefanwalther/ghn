# Data Model: Repository Multi-Select with Bulk Context Menu

**Feature**: [spec.md](spec.md) | **Date**: 2026-11-08

All entities are ephemeral client state. No storage, schema, or migration is involved.

## Entity 1: RepositorySelection

The working set of repositories chosen in the filter sidebar. Independent of the single active inbox filter.

| Field | Type | Rules |
|---|---|---|
| `ids` | `Set<string>` (repository identities) | Members are repository ids, never display positions. Survives filtering, searching, and section collapse. Empty set means no selection. |
| `anchorId` | `string \| null` | The base row for Shift-range extension. Set by the last toggle or click; `null` when nothing was ever toggled. A Shift-click with `null` anchor behaves as a plain toggle of the target row. |

**State transitions**:
- Ctrl/Cmd-click member → remove from `ids`, anchor moves to that row.
- Ctrl/Cmd-click non-member → add to `ids`, anchor moves to that row.
- Shift-click target → `ids` becomes previous `ids` ∪ visible range between anchor and target (anchor set first if `null`); if target equals anchor, no change.
- Plain click row → `ids` clears, anchor clears, active filter moves to that row (existing behavior).
- Escape / empty-space click → `ids` clears, anchor clears, active filter unchanged.
- Right-click unselected row → selection clears first, then single-row menu (transition to no-selection + menu open).

## Entity 2: CombinedMenuTarget

The resolved target of an opened context menu.

| Field | Type | Rules |
|---|---|---|
| `kind` | `"single" \| "multi"` | `"multi"` only when the right-clicked row is a member of a non-empty selection; otherwise `"single"`. |
| `repoIds` | `string[]` | One id for single, all selection ids for multi. Order follows sidebar display order for deterministic notices. |
| `anchorRowId` | `string` | The row under the cursor. Used only for "Open repo" in multi mode. |
| `combinedPending` | `number` | Sum of actionable pending counts across `repoIds`. Drives the done entry label and the destructive-threshold comparison. |
| `combinedReadable` | `number` | Sum of actionable unread counts across `repoIds`. Drives the read entry label. |
| `rhythmState` | `string \| "mixed"` | Common rhythm when all members agree, else `"mixed"`. |
| `snoozeState` | `"none" \| "all" \| "mixed"` | Whether none, all, or some members are snoozed. |

**Derivation rules**:
- An entry (done/read) is disabled only when its combined count is zero across the set.
- Per spec, entries stay enabled when at least one member is actionable; confirmations name the affected subset (repos with count > 0), not just the raw totals.
- "Copy link" joins member links with newlines in display order; "Open repo" uses `anchorRowId` only.

## Entity 3: BulkFanOut (transient operation, not stored)

One bulk menu action mapped to per-repository mutation calls.

| Field | Type | Rules |
|---|---|---|
| `action` | snooze / rhythm / done / read | Reuses the existing single-repo mutation for that action. |
| `targets` | `string[]` | Selection ids with actionable counts > 0 for done/read; all ids for snooze/rhythm. |
| `confirmed` | `boolean` | Required before executing when `combinedPending` (done) exceeds `BULK_CONFIRM_THRESHOLD`. Confirmation names total items + repository count. |
| `busyIds` | `Set<string>` | Existing `pendingRepos` set extended to all in-flight targets; untouched repos stay interactive. |

**Completion rule**: one summary notice (success with visible-plus-quiet split, or failure with restore message), matching the existing single-repo notice wording generalized to N repositories.
