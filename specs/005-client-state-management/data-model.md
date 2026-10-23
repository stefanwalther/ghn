# Data Model: Client State Management

**Feature**: `specs/005-client-state-management/spec.md`
**Date**: 2026-10-22

No storage or API schema change. All entities below are client-side views over existing API shapes and URL state.

## Server Cache Entry

Shared fresh copy of remote data managed by TanStack Query. Replaces per-component `useState` plus `fetch`.

- Key: hierarchical primitives from `lib/query-keys.ts`, e.g. notifications key includes repo, state, type, age.
- Fields: data payload as returned by existing routes, freshness timestamp, `isLoading` true only with no cache, `isFetching` true during background refetch, error if last fetch failed.
- Relationships: one entry per filter combination for notifications. One entry each for repositories list, connection status, rate limits, and per-thread details.
- Validation: key params come from normalized `parseInboxFilters` output. Unknown repo, state, type, or age falls back to defaults before key construction.
- Transitions: empty to loading to ready. Ready to fetching to ready on background refetch. Fetch failure keeps prior data with error set, never clears the list.

## Inbox Filter

URL-backed selection that keys the list query.

- Fields: repo string, state `unread` or `all` or `done`, type string, age in `lib/filters.ts` set.
- Relationships: serializes via `serializeInboxFilters` into query key and fetch params. Survives reload, share, back and forward.
- Validation: repo defaults to `all`, state to `unread`, type to `all`, age to `all` on missing or malformed input.
- Transitions: filter change creates or reuses a cache entry. Prior entry data stays visible via placeholder data until the new entry resolves.

## Optimistic Mutation

Immediate list change for a triage action with retained rollback snapshot.

- Fields: action `done` or `read` or `unread` or `unsubscribe`, target ids, previous list snapshot, per-row syncing ids.
- Relationships: applies `applyLocalAction` from `lib/inbox-state.ts` to the notifications cache entry. On settle invalidates that entry plus repositories facets when counts change.
- Validation: empty target list is a no-op. Unknown ids are ignored per `nextSelection` semantics.
- Transitions: pending with optimistic list visible, then settled to confirmed via refetch, or failed to restored prior list with non-blocking message and re-enabled controls.

## Global UI State

Ephemeral cross-page state. Optional zustand store. Never holds records.

- Fields: sidebar open boolean, palette open boolean, help open boolean, drawer thread id or null, selected ids set, focused index or null.
- Relationships: drawer id references a record id in the current notifications cache entry but does not duplicate the record. Selected ids reference visible row ids only.
- Validation: drawer id clears when its record leaves the list via done action. Selected ids clear on filter change and scroll-top. Focused index clamps via `nextFocusIndex`.
- Transitions: typed actions only. No string event names. Storage-backed fields sync to `ghn:sidebar`, `ghn:drawer-width`, and `ghn:last-opened` with silent fallback when storage is unavailable.

## Sync Status

Header truth derived from cache and sync mutation state.

- Fields: last sync time or null, poll interval seconds, disabled-window countdown seconds, stale boolean, connected boolean plus reason, syncing boolean, refreshing boolean.
- Relationships: last sync and poll interval come from sync and connection queries. Countdown derives from wall clock during the poll window only. Banner selects disconnected over stale over fresh.
- Validation: null last sync means never synced, never in poll window. Countdown clamps at zero.
- Transitions: sync start sets syncing, sync end clears it and invalidates notifications plus repositories plus connection. Poll window expiry re-enables refresh without a fetch.
