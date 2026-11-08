# Data Model: Release Preview in Inbox Drawer

**Feature**: `specs/007-release-preview/spec.md` · **Date**: 2026-11-08

No database migration. Release data is fetched at view time through the existing GitHub credential and projected for display. The only persisted inputs are the already-stored notification row fields (`subjectType`, `sourceUrl`).

## Entities

### Release (view-time projection, not a table)

| Field | Type | Source | Rules |
|---|---|---|---|
| `name` | string \| null | release payload `name` | Display title; falls back to tag when null/empty. |
| `tagName` | string | release payload `tag_name` | Required; empty means the payload is invalid and the preview is unavailable. |
| `body` | string \| null | release payload `body` | Null/empty renders the "No description." empty state. Rendered as markdown. |
| `draft` | boolean | release payload `draft` | `true` shows a `draft` badge. |
| `prerelease` | boolean | release payload `prerelease` | `true` shows a `pre-release` badge; never shown together with final-state copy. |
| `authorLogin` | string \| null | release payload `author.login` | Shown when present; omitted silently when absent. |
| `publishedAt` | number (epoch ms) \| null | `published_at` else `created_at` | Shown as locale date/time; omitted when unparseable. |
| `htmlUrl` | string | release payload `html_url` | Canonical continue-on-GitHub link. |
| `targetRef` | string \| null | release payload `target_commitish` | Shown beside the tag when present. |
| `assets` | ReleaseAsset[] | release payload `assets` | Empty array hides the Assets section. |

**State transitions (display only)**: `draft=true` → draft badge regardless of `prerelease`; `prerelease=true, draft=false` → pre-release badge; both false → no badge. No transitions are written back anywhere.

**Validation**: payload without a non-empty `tag_name` or `html_url` is treated as fetch failure → route returns `fetch_failed`/`preview_unavailable`, drawer shows the unavailable state.

### ReleaseAsset (view-time projection, not a table)

| Field | Type | Source | Rules |
|---|---|---|---|
| `name` | string | asset `name` | Required; entries without a name are skipped. |
| `size` | number \| null | asset `size` (bytes) | Rendered human-readable (Bytes/KB/MB); row shows name only when absent. |
| `downloadUrl` | string \| null | asset `browser_download_url` | Anchor `href` when present; plain text name when absent. |

**Validation**: non-array `assets` coerces to `[]`. Asset entries that are not objects are skipped.

## Relationships

- One `Release` → zero-to-many `ReleaseAsset` (same payload, no joins, no IDs shared with other entities).
- `Release` is addressed by the notification row: `notifications.subjectType === "Release"` plus either the live thread `subject.url` (`/repos/{owner}/{repo}/releases/{id}`) or the tag parsed from `notifications.sourceUrl` (`/.../releases/tag/{tag}`).
- No relationship to `SubjectContent`, `ThreadComment`, `CheckSummary`, or `DependabotAlertDetails`: a release payload carries none of those, and the route returns `comments: []`, `checks: null` for releases.

## What does NOT change

- `db/schema.ts` (`notifications` table): no new columns.
- Sync path (`lib/sync.ts`, `lib/seed-data.ts`): no new subject types, no seed changes.
- `SubjectContent` / `ThreadDetails` shapes: release fields live on a separate `release` field, not merged into the issue/PR shape.
