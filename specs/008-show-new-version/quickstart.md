# Quickstart: Update Badge with Inline Notes Validation

**Feature**: `specs/008-show-new-version/spec.md` · **Date**: 2026-11-14

Validates the bottom-left update badge plus inline release notes. Shapes and rules live in [`contracts/version-with-notes.md`](contracts/version-with-notes.md) and [`data-model.md`](data-model.md); this guide only runs the scenarios.

## Prerequisites

- `bun install`, then `make dev` (default port `21120`) or `make start` for the production serve.
- Tests: `make check` is the local fast gate (`typecheck`, `lint`, `test:unit`, `test:integration`, `test:component`). `vitest` projects never contact real GitHub; the loopback guard fails any test that tries. The releases call goes to `GHN_RELEASES_API_BASE` (stand-in in tests).

## Scenarios

### 1. New version badge, no auto-open (US1)

1. Script `/repos/stefanwalther/ghn/releases/latest` (or stub `/api/version`) with `tag_name: v9.9.9`, `html_url` to the tag, and any body.
2. Load any page.
3. Expected: bottom-left footer shows `v<current>` plus `v9.9.9 available` with the attention indicator; no dialog opens on its own; the GitHub repo icon stays beside it.

### 2. Inline notes render (US2 P1)

1. Script the latest payload with `name: "ghn-v9.9.9"`, `published_at`, and a markdown `body` (headings, list, link, code).
2. Click the footer badge.
3. Expected: dialog shows "This install runs vX. v9.9.9 is out.", a "What's included" section with the release name/version, the published date, and the rendered markdown (readable headings/lists, distinguishable links, safe code); commands and Not now stay visible.

### 3. Empty notes body (US2 edge)

1. Script the payload with `body: null` (or `""`/whitespace).
2. Open the dialog.
3. Expected: explicit "No release notes for this version." empty state; version line, both command blocks, and the outbound link still render.

### 4. Notes unavailable but version known (FR-008)

1. Script a payload with a valid `tag_name` but missing/non-string `name`/`body`/`published_at` (or partial fields).
2. Open the dialog.
3. Expected: version line + commands + fallback link render; missing title/date omitted silently; null body shows the empty/unavailable hint; no spinner hang, no crash.

### 5. Long notes scroll (Edge)

1. Script a body with many sections (e.g. 0.5.0-scale changelog).
2. Open the dialog on a narrow viewport.
3. Expected: notes scroll inside a capped container; version line, commands, Not now/close stay reachable; dialog keeps `absolute bottom-16 left-4`, `max-w-md`, portal to `document.body`.

### 6. Update actions intact (US3)

1. Open the dialog.
2. Expected: source-checkout and Docker blocks render byte-identical commands with Copy→Copied feedback; "View release notes for v9.9.9" opens the tag URL in a new tab (`noopener noreferrer`).

### 7. Quiet failure (US1 edge, FR-009)

1. Script the releases endpoint 404/offline, or set `GHN_DISABLE_UPDATE_CHECK=1`.
2. Load any page.
3. Expected: footer shows only `v<current>`; no badge, no dialog, no toast; no footer layout shift.

### 8. Dismissal persistence (US1)

1. With an update available, open the dialog then close via Not now, X, Escape, and backdrop click (each path).
2. Expected: each path closes the dialog, returns focus to the badge, and leaves the badge visible for reopening.

## Test layers (where each scenario is pinned)

- **Unit** (`tests/unit/update-check.test.ts`): projection/coercion of `name`/`body`/`published_at`, empty-tag fallback with nulls, disabled-check short-circuit, cache/TTL reuse.
- **Integration** (`tests/integration/version-route.test.ts` + `tests/support/github-stand-in.ts`): route through the stand-in with extended payload, 404 → nulls variant, disabled check makes zero release requests.
- **Component** (`tests/component/version-indicator.test.tsx`): badge gating, no auto-open, dialog notes rendering/empty/long-body scroll container, commands + link intact, close paths + focus return, failure → plain version.
- **E2E** (`tests/e2e/theme.spec.ts`, post-build): footer version + repo-link structural invariants unchanged.

## Pass criteria

- `make check` green with no coverage drop (merge-base ratchet).
- Every scenario above shows its Expected outcome; no scenario requires opening a browser except via the explicit fallback link.
