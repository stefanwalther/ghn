# Contract: Version Check with Inline Notes

**Feature**: `specs/008-show-new-version/spec.md` · **Route**: `GET /api/version`

This contract extends the existing version route with three additive nullable fields. All existing fields, statuses, and failure behavior are unchanged.

## Success variant

Returned when the releases lookup succeeds and yields a parseable tag (whether or not an update is available).

```json
{
  "current": "0.11.0",
  "latest": "0.12.0",
  "updateAvailable": true,
  "releaseUrl": "https://github.com/stefanwalther/ghn/releases/tag/ghn-v0.12.0",
  "checkedAt": "2026-11-14T12:00:00.000Z",
  "releaseName": "ghn-v0.12.0",
  "releaseBody": "## Features\n\n* **inbox:** ...\n",
  "publishedAt": "2026-11-14T12:00:00Z"
}
```

### Field rules

- `current`: string, always present, no `v` prefix.
- `latest`: `string | null`. Normalized tag core (`normalizeVersionTag`); null when unknown.
- `updateAvailable`: boolean. `isNewerVersion(current, latest)`; false when `latest` is null.
- `releaseUrl`: string, always present. Payload `html_url` when a non-empty string, else `${GITHUB_REPO_URL}/releases`.
- `checkedAt`: string, ISO timestamp of the check.
- `releaseName`: `string | null`. Trimmed payload `name`; empty/whitespace/non-string coerces to null.
- `releaseBody`: `string | null`. Payload `body` verbatim when a non-empty string after trim; empty/whitespace/non-string coerces to null. Raw markdown, unrendered; sanitization happens in the client `Markdown` component.
- `publishedAt`: `string | null`. Payload `published_at` else `created_at` when a parseable date; otherwise null. ISO string passthrough, no reformatting server-side.

## Failure / disabled variant (unchanged shape, extended with nulls)

```json
{
  "current": "0.11.0",
  "latest": null,
  "updateAvailable": false,
  "releaseUrl": "https://github.com/stefanwalther/ghn/releases",
  "checkedAt": "2026-11-14T12:00:00.000Z",
  "releaseName": null,
  "releaseBody": null,
  "publishedAt": null
}
```

Returned when the releases endpoint is non-OK, throws, times out, yields no tag, or `GHN_DISABLE_UPDATE_CHECK` is set. HTTP status stays 200 with `Cache-Control: no-store`; the footer degrades to plain version.

## Client consumption

- `components/version-indicator.tsx`: `UpdateInfo` type gains the three nullable fields; passes `current/latest/releaseUrl/releaseName/releaseBody/publishedAt` into `UpdatePopover`. Badge gating stays on `updateAvailable === true && latest != null`.
- `components/update-popover.tsx`: props gain `releaseName: string | null`, `releaseBody: string | null`, `publishedAt: string | null`. Renders the "What's included" section via `components/inbox/markdown.tsx` (`repositoryUrl={GITHUB_REPO_URL}`); null body renders the empty state; dialog chrome, position, portal, focus, and command blocks unchanged.
- `lib/update-check.ts`: `UpdateInfo` interface extended; projection coerces as above; cache key/TTL (6h), 10s timeout, token reuse, and env overrides unchanged.
