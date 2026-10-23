# Contracts: Client Query and UI Hooks

**Feature**: `specs/005-client-state-management/spec.md`
**Date**: 2026-10-22

No API route change. These are client hook contracts for the planned `lib/queries.ts`, `lib/query-keys.ts`, and optional `lib/ui-store.ts`.

## `useNotifications(filters)`

- Input: normalized `InboxFilters` from `parseInboxFilters`.
- Output: `items`, `collapsed`, `facets`, `lastSyncAt`, `stale`, `isLoading` true only with no cache, `isFetching` true during background refetch, `error`, `refetch`.
- Rules: key is `query-keys.notifications(filters)`. Keeps previous data visible on filter change. Only the latest filter result is shown.

## `useRepositories()`

- Input: none.
- Output: `repos`, `isLoading`, `isFetching`, `error`, `refetch`.
- Rules: single shared entry. Palette and inbox consume the same data. No per-mount refetch within freshness window.

## `useConnection()`

- Input: none.
- Output: `connected`, `reason`, `isFetching`, `refetch`.
- Rules: polled sparingly. Refresh flow refetches after sync settles.

## `useBulkAction(filters)`

- Input: active filters for cache targeting.
- Output: `apply(action, ids)`, `isPending`, `syncingIds`, `error`, `notice`.
- Rules: optimistic via `applyLocalAction`. Snapshot previous list on mutate, restore on error, invalidate notifications and repositories on settle. Empty ids is a no-op. Controls derive disabled state from `isPending`.

## `useThreadDetails(id)`

- Input: thread id string.
- Output: `content`, `contentState` loading or ready or unavailable, `runs`, `alert`, `isFetching`, `error`, `refetch`.
- Rules: key is `['thread', id]`. Replaces the direct `/api/thread` fetch in the drawer. Detail panel keeps prior thread content visible while refetching a newly selected thread.

## `useThreadSync(filters)`

- Input: active filters for cache targeting.
- Output: `syncOne(id)`, `syncingIds`, `isPending`.
- Rules: per-row syncing indicator only. Gone thread removes the row with a done message. Item update merges into cached row and open drawer copy.

## `useSyncFlow(filters)`

- Input: active filters for cache targeting.
- Output: `refresh()`, `syncing`, `refreshing`, `pollSecs`, `countdownSecs`, `inPollWindow`, `lastSyncAt`, `stale`, `syncError`.
- Rules: refresh runs sync mutation then invalidates notifications, repositories, and connection. Poll window disables refresh with countdown. Cached rows stay visible on failure with stale plus retry.

## `useUI()` (optional zustand, UI only)

- State: `sidebarOpen`, `paletteOpen`, `helpOpen`, `drawerId`, `selectedIds`, `focusIndex`.
- Actions: `toggleSidebar`, `setSidebar`, `openPalette`, `closePalette`, `openHelp`, `closeHelp`, `openThread(id)`, `closeDrawer`, `toggleSelected(id)`, `clearSelection`, `setFocus(index)`.
- Rules: typed actions replace `ghn:*` events. One selector per component. Records never stored here. Sidebar and drawer width persist via existing `view-state.ts` keys. `last-opened` uses `sessionStorage` only.
