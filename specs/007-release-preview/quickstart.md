# Quickstart: Release Preview Validation

**Feature**: `specs/007-release-preview/spec.md` · **Date**: 2026-11-08

Validates the drawer release preview end to end. Details of shapes and rules live in [`contracts/thread-release.md`](contracts/thread-release.md) and [`data-model.md`](data-model.md); this guide only runs the scenarios.

## Prerequisites

- `bun install`, then `make dev` (default port `21120`) or `make start` for the production serve.
- Seeded local database (clone plus `make start` plus sync per `README`); no real-GitHub credential needed for the mocked scenarios.
- Tests: `make check` is the local fast gate (`typecheck`, `lint`, `test:unit`, `test:integration`, `test:component`). `vitest` projects never contact the real GitHub; the loopback guard fails any test that tries.

## Scenarios

### 1. Pre-release with notes and assets (P1 + P2 + P3)

1. Insert a notification row with `subjectType: "Release"` and `sourceUrl: https://github.com/{owner}/{repo}/releases/tag/v9.9.9-nightly.1`.
2. Script the stand-in release payload: `tag_name: v9.9.9-nightly.1`, `prerelease: true`, `draft: false`, a markdown `body`, `author.login: github-actions`, and two assets (one with `size`, one without).
3. Open the row in the inbox and select it.
4. Expected: drawer shows the release title, `pre-release` badge (no `draft` badge), tag plus target ref, author plus date, rendered markdown body, and a collapsed `Assets (2)` section; expanding it reveals both file names, the known size human-readable, and working download links.

### 2. Final release without assets (P2 edge)

1. Script a release with `prerelease: false`, `draft: false`, and `assets: []`.
2. Expected: no pre-release or draft badge, notes render, and no Assets section appears.

### 3. Draft release (P2)

1. Script a release with `draft: true`.
2. Expected: `draft` badge visible.

### 4. Empty notes body (P1 edge)

1. Script a release with `body: null`.
2. Expected: drawer shows the explicit "No description." empty state, not a blank panel.

### 5. Deleted / inaccessible release (FR-008, SC-005)

1. Script the release endpoint to return 404 (or drop the tag from the source URL so no tag parses).
2. Expected: drawer shows the unavailable state with a working "Open in new window" link; the legacy "No preview for releases" copy does not appear.

### 6. Many assets (P3 scale)

1. Script a release with 30 assets.
2. Expected: full list reachable by expanding the section and scrolling inside the drawer; triage buttons (Done / Mark as read / Unsubscribe) and prev/next/close stay usable.

### 7. Regression: other types untouched

1. Open an issue row, a pull request row, a security-alert row, and a check-suite row.
2. Expected: each renders exactly as before; the fallback copy for non-release types still reads correctly ("issues, pull requests, releases, and security alerts").

## Test layers (where each scenario is pinned)

- **Unit** (`tests/unit/`): tag parsing (`.../releases/tag/{tag}` incl. nested tags), `targetRef` display, human-readable sizes, unavailable-vs-failure mapping.
- **Integration** (`tests/integration/thread-route.test.ts` + `tests/support/github-stand-in.ts`): resolution order (live thread URL wins, tag fallback, 422 when neither), payload projection, 502 on fetch failure, loopback guard stays clean.
- **Component** (`tests/component/components.test.tsx`): drawer renders title/badges/body/assets per scenario 1–4, unavailable state per scenario 5, triage buttons intact.
- **E2E** (`tests/e2e/`, post-build): scenario 1 plus scenario 6 scroll/triage flow on the built app.

## Pass criteria

- `make check` green with no coverage drop (merge-base ratchet).
- Every scenario above shows its Expected outcome; no scenario requires opening a browser except via the explicit fallback link.
