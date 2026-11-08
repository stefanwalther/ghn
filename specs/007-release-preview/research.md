# Research: Release Preview in Inbox Drawer

**Feature**: `specs/007-release-preview/spec.md`
**Date**: 2026-11-08

## Context

The preview drawer (`components/inbox/item-drawer.tsx`) renders issues, pull requests (via `fetchSubjectContent`), security alerts (via `fetchDependabotAlert`), and check suites (via `fetchWorkflowRuns`). Release threads (`subjectType === "Release"`) fall through to the `preview_unavailable` branch in `app/api/thread/route.ts` because `subjectApiUrlFromHtml()` only recognises `pull`/`issues` and dependabot URLs, so the drawer shows "No preview for releases". The spec asks for an inline release preview (title/tag, badges, notes body, assets) without leaving ghn.

## Findings

### 1. How a Release thread is addressed

- **Decision**: Resolve the release through two paths, in order: (a) live thread `subjectApiUrl` when the row's `subjectType` is `Release`, (b) tag parsed from the stored HTML `sourceUrl` as fallback.
- **Rationale**: The DB row's `sourceUrl` is the HTML URL produced at sync time by `resolveSubjectHtmlUrl()` (e.g. `https://github.com/{owner}/{repo}/releases/tag/{tag}`). The live Notification Thread API returns `subject.url` shaped like `{apiBase}/repos/{owner}/{repo}/releases/{id}`. Path (a) is exact and survives tag renames; path (b) keeps the preview working when the DB row predates release support or the live thread fetch fails.
- **Alternatives considered**:
  - HTML→API tag mapping only (`GET .../releases/tags/{tag}`): rejected as sole path because the "all releases" page URL (`/.../releases`) carries no tag and because tag renames would silently point at the wrong release.
  - Persisting the release API URL in a new DB column: rejected, a schema change for data already recoverable at view time (constitution III, simplicity).

### 2. GitHub Releases API response shape

- **Decision**: Fetch one release object (`GET` by id or by tag) and project only the fields the spec needs: `name`, `tag_name`, `body`, `draft`, `prerelease`, `author.login`, `published_at`/`created_at`, `html_url`, `target_commitish`, and per asset `name`, `size`, `browser_download_url`.
- **Rationale**: This is the documented Releases API surface; everything the spec's FR-002–FR-006 needs is on the single object, so one view-time fetch suffices. No comments, checks, or contributor endpoints are needed (contributors explicitly supplementary in the spec).
- **Alternatives considered**: GraphQL `release { ... }` node: rejected, the REST shape already covers the need and matches the existing `fetch*` helper style in `lib/github.ts`.

### 3. Target commit display

- **Decision**: Show the tag plus the `target_commitish` ref as plain text (e.g. `v0.1.8-nightly... · 4cb6945` when the ref is a short SHA, otherwise the branch/tag ref). No commit-verification badge and no extra commit-resolution fetch in v1.
- **Rationale**: The reference screenshot's verified-SHA chip comes from resolving the tag to a commit, which costs an extra request per preview. The spec's FR-004 only requires the commit reference alongside the tag; the green check is supplementary chrome, like checksums and per-asset timestamps, and is deferred in Assumptions.
- **Alternatives considered**: Resolving `target_commitish` via the git-refs/commits API for an exact short SHA plus status: rejected for v1 as a second round trip for decorative fidelity.

### 4. Release body rendering

- **Decision**: Reuse the existing `Markdown` component (`components/inbox/markdown`) with `repositoryUrl`, and the existing "No description." empty state when the body is null/empty.
- **Rationale**: Release notes are markdown authored on GitHub, the same content class as issue/PR bodies. Reuse keeps rendering, sanitisation, and link behaviour identical and adds no new dependency.
- **Alternatives considered**: Raw text block or a new markdown pipeline: rejected, duplicates hardened behaviour.

### 5. Assets section

- **Decision**: Render `Assets (N)` heading with one row per asset: file name (link to `browser_download_url`, `target="_blank" rel="noopener noreferrer"`), human-readable size, and nothing else. Hide the section when the asset list is empty. Rows live in the drawer's existing scroll container.
- **Rationale**: Matches FR-006/FR-007 exactly and the "30 files" scale concern in the spec: no pagination, no virtual list, the drawer already scrolls. Checksums, download counts, and per-asset timestamps stay omitted per Assumptions.
- **Alternatives considered**: Collapsible `<details>` per asset or client-side pagination: rejected, premature for a vertical link list.

### 6. Unavailable / error handling

- **Decision**: Keep the existing route error contract untouched: deleted/inaccessible release or failed fetch returns `{ error: "preview_unavailable" }` (422) or `{ error: "fetch_failed" }` (502); the drawer shows the established unavailable pattern with the "Open in new window" link. For `Release` rows the legacy "No preview for releases" copy and the `previewFallbackKind("Release") → "releases"` branch disappear from the UI path (the helper can remain for other types).
- **Rationale**: Users get the same truthful failure treatment as issues/PRs instead of a misleading "not supported" message, with zero new error shapes for callers to handle.
- **Alternatives considered**: A release-specific error message: rejected, the generic unavailable-plus-link state already satisfies FR-008 and SC-005.

### 7. Drawer branching pattern

- **Decision**: Follow the `SecurityAlertPreview` precedent: new `ReleasePreview` presentational component fed by a `release` field on the thread payload; `item-drawer.tsx` gains a `release` branch in its existing `derived` memo alongside `alert`, leaving the issue/PR `content` path untouched.
- **Rationale**: Smallest diff that mirrors an accepted pattern (alert branch), keeps `content`/`runs`/`alert` semantics stable, and confines release markup to one new file.
- **Alternatives considered**: Folding release fields into `ThreadDetails/SubjectContent`: rejected, release fields (tag, prerelease, assets) do not belong on the issue/PR shape and would blur the contract.

### 8. Test doubles (stand-in, seeds)

- **Decision**: Extend the local GitHub stand-in with a `releases/*` subject path (default payload plus `setSubject` override support, same as `pulls`/`issues`), and cover releases through targeted integration/component fixtures rather than changing the shared 200-row seed dataset.
- **Rationale**: The stand-in's `subjectMatch` regex currently only matches `pulls|issues`, so release fetches would 404 without this. The frozen seed dataset is load-bearing for counts across many suites; adding release rows would ripple through facet/age assertions for no product benefit. Targeted rows inserted per test keep the blast radius minimal.
- **Alternatives considered**: Adding `subjectType: "Release"` rows to `buildSeedNotifications`: rejected, high churn across unrelated suites.

## Open items

None. All spec unknowns resolved with reasonable defaults recorded in Assumptions; no `NEEDS CLARIFICATION` remains.
