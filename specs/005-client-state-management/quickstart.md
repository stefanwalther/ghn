# Quickstart: Validate Client State Management

**Feature**: `specs/005-client-state-management/spec.md`
**Date**: 2026-10-22

## Prerequisites

- Bun and dependencies installed. Database seeded via existing seed flow.
- Dev server running via `./scripts/dev.sh` or `bun run dev`.
- Browser devtools open to the Network tab filtered to `/api/notifications` and `/api/repositories`.

## 1. Shared cache between inbox and palette

1. Load `/` and wait for the list.
2. Open the palette with Cmd+K, then close it.
3. Reopen the palette within 30s.
4. Confirm the second open issues no new `/api/notifications` or `/api/repositories` requests and results appear instantly from cache.
5. Change the inbox repo filter, then reopen the palette and confirm counts match the inbox.

Expected: at most one notifications fetch and one repositories fetch per freshness window per cache entry. No spinner flash on a cached palette open. The first palette open fetches its own `state=all` entry once; per-action request counts never exceed the previous direct-fetch behavior.

## 2. Filter change keeps prior list

1. On `/`, note the visible rows.
2. Change type filter from all to `pull_request` or similar.
3. Confirm the old rows stay visible with a refreshing indicator until new rows arrive.
4. Quickly toggle between two filters and confirm only the latest filter result ends up visible.

Expected: no full skeleton or empty flash. No out-of-order overwrite.

## 3. Optimistic triage with rollback

1. Select 3 rows and press `d`.
2. Confirm rows leave immediately and stay gone after background refetch.
3. Simulate failure by stopping the server or blocking `/api/notifications/bulk` in devtools, then triage 2 more rows.
4. Confirm the prior list restores with a non-blocking message and buttons re-enable without reload.

Expected: instant feedback on success. Full restore plus usable controls on failure.

## 4. Poll window and connection truth

1. Trigger Refresh and note last-synced time.
2. Confirm refresh disables with an accurate countdown during the poll window.
3. Block `/api/sync` to simulate offline and refresh again.
4. Confirm cached rows stay readable with stale indicator, last-synced time, and retry.

Expected: countdown, stale, and disconnected states never contradict each other.

## 5. Global actions from every trigger

1. Open the palette via button, Cmd+K, and slash.
2. Toggle the sidebar via button, Cmd+B, and palette command.
3. Open a thread from the palette while on `/` and while on `/repos`.
4. Confirm drawer opens directly on `/` and navigates to the owning repo filter elsewhere with scroll restoration.

Expected: identical outcomes from all triggers. No missed event names.

## 6. Repos rhythm change

1. Open `/repos` and change a rhythm.
2. Confirm the row updates in place.
3. Block the PATCH request and retry to confirm revert with error and no full-list flash.

Expected: in-place update on success, rollback on failure.

## 7. Keyboard and theme regression

1. On `/`, press `j` and `k` to move focus, `x` to select, `a` to select all.
2. Press `d`, `r`, `u` with and without selection and confirm the same outcomes as the buttons.
3. Open the drawer with `Enter`, step with `[` and `]`, close with `Escape`.
4. Toggle the theme and confirm the inbox, drawer, and palette keep visible focus and no color-only signaling.

Expected: identical triage outcomes from keyboard and pointer, visible focus everywhere, no shortcut regressions.

## Test commands

- `bun run test:unit` for pure helper contracts.
- `bun run test:component` for query plus store component behavior.
- `bun run test:all` plus `bun run typecheck` before handoff to `$speckit-tasks`.
