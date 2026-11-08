# Contract: Thread Release Payload

**Feature**: `specs/007-release-preview/spec.md` · **Route**: `GET /api/thread?id={id}`

This contract extends the existing thread route with one additive variant. All existing variants (issue/PR payload, `{ content: null, runs }`, `{ alert }`) and all existing error shapes are unchanged.

## Release variant

Returned when the notification row has `subjectType === "Release"` and the release fetch succeeds.

```json
{
  "content": null,
  "comments": [],
  "checks": null,
  "runs": [],
  "release": {
    "name": "T3 Code Nightly 0.1.8-nightly.20261107.4301",
    "tagName": "v0.1.8-nightly.20261107.4301",
    "body": "v0.1.8-nightly.20261107.4301 · 14 changes ...",
    "draft": false,
    "prerelease": true,
    "authorLogin": "github-actions",
    "publishedAt": 1792450000000,
    "htmlUrl": "https://github.com/pingdotgg/t3code/releases/tag/v0.1.8-nightly.20261107.4301",
    "targetRef": "4cb6945dc60e",
    "assets": [
      {
        "name": "nightly-mac.yml",
        "size": 786,
        "downloadUrl": "https://github.com/pingdotgg/t3code/releases/download/v0.1.8-nightly.20261107.4301/nightly-mac.yml"
      }
    ]
  }
}
```

### Field rules

- `release` is `null`-free on success: all keys present, nullable ones explicitly `null` when unknown.
- `body`: `string | null`. Empty string coerces to `null`.
- `publishedAt`: epoch milliseconds, `number | null`. Sourced from `published_at`, falling back to `created_at`; unparseable or missing yields `null`.
- `assets`: array, possibly empty. Empty array means the drawer hides the Assets section.
- `assets[].size`: bytes, `number | null`. `assets[].downloadUrl`: `string | null`.
- `comments` is always `[]` and `checks` always `null` for releases (releases have neither).

## Resolution order (server)

1. If the live Notification Thread fetch for the row id succeeds and yields a `subject.url` containing `/releases/`, fetch that URL as the release API URL.
2. Otherwise parse `{owner}/{repo}/{tag}` from the row's HTML `sourceUrl` matching `^https://github.com/{owner}/{repo}/releases/tag/{tag}` and fetch `{apiBase}/repos/{owner}/{repo}/releases/tags/{tag}`.
3. Otherwise return `{ error: "preview_unavailable" }` with status 422 (existing shape).

## Errors (existing shapes, no change)

| Condition | Status | Body |
|---|---|---|
| Missing `id` | 400 | `{ "error": "missing id" }` |
| Unknown notification | 404 | `{ "error": "not found" }` |
| No credential | 503 | `{ "error": "auth" }` |
| Release not addressable (no id, no tag) | 422 | `{ "error": "preview_unavailable" }` |
| Release fetch failed (deleted, forbidden, network) | 502 | `{ "error": "fetch_failed" }` |

## Library helper

`fetchRelease(token, apiUrl): Promise<ReleaseDetails | null>` in `lib/github.ts`, co-located with `fetchSubjectContent` / `fetchDependabotAlert`. Returns `null` on any non-OK status, malformed payload, or exception; callers map `null` to the error shapes above. Pure projection, no caching beyond the request, no logging of credentials.

```ts
interface ReleaseAsset { name: string; size: number | null; downloadUrl: string | null; }
interface ReleaseDetails {
  name: string | null; tagName: string; body: string | null;
  draft: boolean; prerelease: boolean; authorLogin: string | null;
  publishedAt: number | null; htmlUrl: string; targetRef: string | null;
  assets: ReleaseAsset[];
}
```

## Client consumption

- `lib/queries.ts`: `ThreadDetailsResponse` gains `release?: ReleaseDetails | null`.
- `components/inbox/item-drawer.tsx`: `derived` memo gains a `release` branch (same position as `alert`); `content` stays `null` for releases so the issue/PR path is untouched.
- New `components/inbox/release-preview.tsx`: `(release: ReleaseDetails, repositoryUrl: string)` → badges (`pre-release`, `draft`), author/published line, tag/target line, markdown body with "No description." fallback, `Assets (N)` list. No triage, navigation, or width logic (stays in the drawer).
