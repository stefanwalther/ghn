# Research: Sidebar Update Badge with Inline Release Notes

**Feature**: `specs/008-show-new-version/spec.md`
**Date**: 2026-11-14

## Context

The footer badge (`components/version-indicator.tsx`) plus dialog (`components/update-popover.tsx`) already satisfy spec US1/US3: bottom-left version, attention dot, click-to-open dialog with source/Docker commands and an outbound "View release notes" link. The server check (`lib/update-check.ts`, `app/api/version/route.ts`) calls `GET .../repos/stefanwalther/ghn/releases/latest` but projects only `tag_name` + `html_url`. The request asks for T3 Code parity: show what is included without leaving ghn. The missing piece is projecting and rendering the release-notes payload the endpoint already returns.

## Findings

### 1. `releases/latest` payload already carries the notes

- **Decision**: Project `name`, `body`, `published_at` (fallback `created_at`) from the same `releases/latest` response; no second endpoint, no new auth scope, no background poller.
- **Rationale**: Documented Releases API object includes `tag_name`, `name`, `body` (markdown, nullable), `html_url`, `published_at`/`created_at`, `draft`, `prerelease`. The current code discards everything except tag + URL. Reading three more fields on the same fetch satisfies FR-004/FR-005 with zero extra round trips and keeps the 10s timeout and 6h cache unchanged.
- **Alternatives considered**:
  - Separate client fetch for notes on dialog open: rejected, doubles rate-limit cost and adds a loading race the spec forbids (FR-008 wants notes with the version check, plus a quiet hint on failure).
  - Local `CHANGELOG.md` parse at build time: rejected, stale the moment the user is behind and blind to unpublished hotfix notes; the API is the source of truth.
  - `releases/tags/{tag}` follow-up or compare-view fetch: rejected, `latest` already is the resolved release.

### 2. Body rendering reuses the inbox Markdown pipeline

- **Decision**: Render `releaseBody` with the existing `Markdown` component (`components/inbox/markdown.tsx`, `react-markdown` + `remark-gfm`/`remark-emoji` + `rehype-raw`/`rehype-sanitize`), passing `repositoryUrl={GITHUB_REPO_URL}` so `#123`/SHA autolinks resolve; empty/null body renders an explicit "No release notes for this version." state.
- **Rationale**: Release notes are the same content class as issue/PR/release-drawer bodies already hardened in 007-release-preview. Reuse gives identical sanitization, link safety (`target _blank noopener`), and readable headings/lists/code with no new dependency and no `dangerouslySetInnerHTML`.
- **Alternatives considered**: Plain `<pre>` text block or a second markdown pipeline: rejected, duplicates sanitization and loses formatting the spec requires (FR-006).

### 3. Dialog layout keeps position and adds a scrolling notes region

- **Decision**: Insert a "What's included in vY" section between the version line and the command blocks: release name/version line, optional published date, then a `max-h-64 overflow-y-auto` bordered notes container. Keep `absolute bottom-16 left-4`, `max-w-md`, portal to `document.body`, `role dialog`/`aria-modal`/`update-backdrop` testid, and the commands + Not now/footer untouched.
- **Rationale**: Smallest diff preserving FR-003/FR-010 contracts and the 007-era stacking fix. A capped scroll region handles very long changelogs (e.g. 0.5.0 with 20 entries) without pushing commands or close actions off-screen on narrow viewports.
- **Alternatives considered**: Growing the dialog unbounded or opening a second modal/drawer: rejected, breaks the anchored popover and the focus-return contract.

### 4. Failure and cache behavior stays quiet

- **Decision**: Extend `fallbackInfo` and the `!res.ok`/`catch`/empty-tag paths to return `releaseName: null, releaseBody: null, publishedAt: null` alongside `latest: null`. When the version check succeeds but notes fields are missing, pass through `null`/omitted values and let the dialog show the empty/unavailable hint; never throw, toast, or spin forever.
- **Rationale**: Matches FR-008/FR-009 and the existing quiet-failure precedent (offline, 404, disabled check all degrade to plain version). The footer fetch (`cache: no-store` client, 6h in-memory server) is untouched.
- **Alternatives considered**: Distinct error shapes for notes-vs-version failures: rejected, callers only branch on `updateAvailable`; extra shapes ripple through component tests for no user benefit.

### 5. Test doubles already serve this endpoint

- **Decision**: Extend the local GitHub stand-in scenarios and unit stubs to include `name`/`body`/`published_at` on `/repos/stefanwalther/ghn/releases/latest`; component tests stub `/api/version` with the extended `UpdateInfo`. No seed or schema change.
- **Rationale**: `tests/support/github-stand-in.ts` already matches `releases/*` and returns a release-shaped default; version-route and update-check suites script this path per test. Adding fields to fixtures pins FR-004–FR-008 at the correct layers (unit: projection/coercion, integration: route through stand-in, component: dialog rendering).
- **Alternatives considered**: New e2e-only coverage or seed-dataset release rows: rejected, slow and high-churn; the footer badge journey is already covered structurally in `tests/e2e/theme.spec.ts`.

## Open items

None. No `NEEDS CLARIFICATION`; all spec unknowns resolved with defaults recorded in Assumptions.
