# Data Model: Sidebar Update Badge with Inline Release Notes

**Feature**: `specs/008-show-new-version/spec.md` · **Date**: 2026-11-14

No database migration. Update data is fetched at view time through the existing GitHub credential and projected for display. The only persisted inputs are none; the footer reads `/api/version` on mount and holds nothing beyond React state.

## Entities

### UpdateInfo (view-time projection, extended)

Sourced from `GET .../repos/stefanwalther/ghn/releases/latest`, cached 6h in memory in `lib/update-check.ts`.

| Field | Type | Source | Rules |
|---|---|---|---|
| `current` | string | `APP_VERSION` (package.json) | Always present; displayed as `v<current>`. |
| `latest` | string \| null | payload `tag_name` via `normalizeVersionTag` | Null when missing/empty/unparseable; null forces `updateAvailable: false`. |
| `updateAvailable` | boolean | `isNewerVersion(current, latest)` | False when `latest` is null or not newer. |
| `releaseUrl` | string | payload `html_url` else `${GITHUB_REPO_URL}/releases` | Always a usable outbound link. |
| `checkedAt` | string (ISO) | check time `now` | Diagnostic only. |
| `releaseName` | string \| null | payload `name` trimmed | Null/empty coerces to null; dialog falls back to tag line. |
| `releaseBody` | string \| null | payload `body` | Null/undefined/whitespace-only coerces to null; null renders the empty state, never raw markup. |
| `publishedAt` | string \| null | payload `published_at` else `created_at` | ISO string passthrough when parseable, else null; dialog omits the date line when null. |

**Validation**: payload without a non-empty `tag_name` after normalization is treated as lookup failure → fallback info (`latest: null`, notes all null). Non-object payloads, non-OK status, timeout, or exception → same fallback. `releaseName`/`releaseBody`/`publishedAt` never cause failure on their own; missing notes degrade to empty/unavailable hint with version line + commands + link intact.

**State transitions (display only)**: `updateAvailable=false` → footer shows plain `v<current>`, no badge, no dialog. `updateAvailable=true` → footer badge persists; dialog opens only on click and closes via Not now/X/Escape/backdrop with focus returned to the badge.

### ReleaseNotes (display slice of UpdateInfo, not a separate fetch)

| Field | Type | Display rule |
|---|---|---|
| `title` | derived from `releaseName` else `v<latest>` | Dialog section heading context, e.g. release name plus `vY`. |
| `date` | derived from `publishedAt` | Shown as locale date when present (e.g. "Published Nov 14, 2026"); omitted when null. |
| `body` | derived from `releaseBody` | Rendered via shared `Markdown`; null renders "No release notes for this version." |
| `url` | derived from `releaseUrl` | Existing "View release notes for vY" fallback link, unchanged. |

## Relationships

- One `UpdateInfo` → zero-or-one `ReleaseNotes` slice (same payload, no joins).
- `VersionIndicator` consumes `UpdateInfo` and passes `current/latest/releaseUrl/releaseName/releaseBody/publishedAt` into `UpdatePopover`; no other consumer.
- No relationship to `notifications`, `SubjectContent`, `ThreadDetails`, or inbox `Release` preview: same upstream Releases API, disjoint UI surfaces and types.

## What does NOT change

- `db/schema.ts`: no new tables or columns; nothing persisted.
- Sync/seed path (`lib/sync.ts`, `lib/seed-data.ts`): no new subject types, no seed changes.
- `VersionIndicator` fetch contract: still single `GET /api/version` on mount with `cache: no-store`; no polling, no store.
- Command blocks (`SOURCE_UPDATE_COMMANDS`, `DOCKER_UPDATE_COMMANDS`) and copy behavior: byte-identical.
