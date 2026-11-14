# Data Model: Persist Filter Selection

**Feature**: `008-persist-filter-selection` | **Date**: 2026-11-14

## Entities

### RememberedFilterSet (client-only, localStorage `ghn:inbox-filters`)

| Field | Type | Validation | Default |
|-------|------|------------|---------|
| `version` | `1` (number) | Must equal `1`; otherwise payload rejected | `1` |
| `filters.repo` | `string` | Non-empty string; no facet check at restore | `"all"` |
| `filters.state` | `"unread" \| "all" \| "done"` | Allow-list; else `"unread"` | `"unread"` |
| `filters.type` | `string` | Non-empty string; else `"all"` | `"all"` |
| `filters.age` | `AgeFilter` | Must be in `["all","24h","48h","7d","14d","30d","year","older"]`; else `"all"` | `"all"` |

Payload example:

```json
{"version": 1, "filters": {"repo": "acme/web", "state": "unread", "type": "pull_request", "age": "7d"}}
```

Lifecycle:
- Written on every explicit filter navigation (any `setFilters` call, including menu `select-repo` path).
- Read once on bare entry (`searchParams` empty). Never read when query string non-empty.
- `null` (missing/corrupt/blocked) means defaults.

### InboxFilters (existing, `lib/view-state.ts`)

Unchanged shape. Only the *source of defaults* on bare entry changes: stored set instead of hardcoded defaults. URL serialization (`serializeInboxFilters`) unchanged, so stored sets round-trip through the same code as explicit URLs.

## Relationships

- `RememberedFilterSet.filters` is a subset snapshot of `InboxFilters`; no foreign keys, no server entity, no migration.
- No DB, API, or facet change. Sidebar facets still drive counts; restore does not validate `repo` against facets.

## Validation rules (shared)

- `state`: `raw === "all" || raw === "done" ? raw : "unread"`.
- `age`: `AGES.includes(raw) ? raw : "all"`.
- `repo`/`type`: `params.get(...) || stored || "all"`, trimmed, non-empty.
- Storage access wrapped in try/catch returning null/void on throw (private-mode parity with `loadFilterWidth`).
