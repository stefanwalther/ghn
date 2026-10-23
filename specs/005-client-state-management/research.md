# Research: Client State Management

**Feature**: `specs/005-client-state-management/spec.md`
**Date**: 2026-10-22

## Decision: TanStack Query v5 for server cache

**Decision**: Adopt `@tanstack/react-query@^5` as the single shared cache for notifications, repositories, connection status, and thread details. No API shape change.

**Rationale**: Solves FR-001 through FR-007 and SC-001 through SC-005 directly. Shared cache removes the duplicate inbox plus palette fetches. `placeholderData: keepPreviousData` keeps the prior list visible with a refreshing flag. Same-key cancellation gives out-of-order safety for free. `useMutation` with `onMutate`, `onError`, and `onSettled` replaces the manual `busyCount` counter and `fetchWithTimeout` rollback logic with snapshot plus restore plus invalidate.

**Alternatives considered**:
- SWR: lighter but weaker mutation and optimistic-update tooling for bulk triage. Rejected because triage rollback is the core loop.
- Zustand for server data: rejected. Duplicates the cache, loses dedupe, background refetch, and invalidation, with no memory win at 1000 records.
- Hand-rolled `useState` plus `fetch` plus request ids (today): rejected. Already proven fragile across `app/page.tsx`, `command-palette.tsx`, and three settings-style pages.

## Decision: Query provider placement and defaults

**Decision**: Extend existing client boundary `app/providers.tsx` with a lazily created `QueryClient` via `React.useState`. Defaults: `staleTime 30s`, `gcTime 5min`, `retry 1`, `refetchOnWindowFocus false`, `refetchOnReconnect true`.

**Rationale**: `providers.tsx` is already `"use client"` under the server root layout. `useState` lazy init avoids recreating the client per render and avoids a module singleton leaking across users if SSR is ever added. 30s matches the spec freshness window so palette reuses inbox data. `refetchOnWindowFocus false` keeps manual refresh and polling as the single cadence.

**Alternatives considered**:
- Module-level singleton client: rejected for cross-user leak risk and test pollution.
- Per-page providers: rejected. Breaks cache sharing between inbox and palette.

## Decision: Query keys derived from URL filters

**Decision**: Central key factory in planned `lib/query-keys.ts`. Notifications key is `['notifications', repo, state, type, age]`. Repositories, connection, thread, and rate-limits keys are hierarchical primitives. Keys derive from normalized `parseInboxFilters` output.

**Rationale**: Keeps URL as source of truth per FR-008. Malformed URLs fall back to `unread` and `all` without breaking keys. Query functions read params from the key, not from closure, so rapid filter changes map to distinct cache entries with correct cancellation.

**Alternatives considered**:
- Keys from raw search string: rejected. Ordering and default-omission differences in `serializeInboxFilters` would split the cache.
- Filters in store: rejected. Breaks links, back and forward, and palette repo-filter navigation.

## Decision: Optimistic triage reuses pure helpers

**Decision**: Mutations for bulk actions and per-thread sync reuse `nextSelection`, `applyLocalAction`, and related helpers from `lib/inbox-state.ts` inside `onMutate`. Snapshot previous query data, apply optimistic change, restore on error, invalidate on settle. Busy state derives from `mutation.isPending` and per-row syncing ids derive from mutation variables.

**Rationale**: Preserves tested triage math per FR-011 while removing manual rollback and stuck-button risk per FR-004 through FR-006 and SC-002 plus SC-004.

**Alternatives considered**:
- Pessimistic refetch-only: rejected. Loses instant feedback required by spec.
- Manual `busyCount`: rejected. Current failure mode the spec explicitly removes.

## Decision: Zustand UI-only store is optional and never holds records

**Decision**: If added, `zustand@^5` holds only ephemeral globals: sidebar open, palette open, help open, drawer id, selected ids, focused index. Records stay out. No `persist` middleware in v1. Initialize from existing `loadDrawerWidth` and `localStorage` helpers and subscribe back to the same keys. Select one field per component via selectors.

**Rationale**: At max 1000 records the store question is coupling, not volume. The records fit in Query cache at a few hundred kilobytes. The DOM cost in `notification-list.tsx` without virtualization dominates any store overhead. A 1kB UI store pays off only by replacing the untyped `ghn:*` `CustomEvent` bus with typed actions, which is a small but real maintainability win.

**Alternatives considered**:
- Records in zustand: rejected. Duplicates Query cache with no benefit.
- `persist` middleware with one JSON blob: rejected for v1. Incompatible with legacy separate keys `ghn:sidebar`, `ghn:drawer-width`, `ghn:last-opened` and mixes `localStorage` with `sessionStorage`.
- React Context plus `useReducer`: viable fallback if zustand is rejected. Worse re-render granularity without careful splitting, which is why zustand is preferred if any store is added.
- Keep `CustomEvent` bus: viable zero-dep fallback. Rejected as the end state because string names are invisible to types and devtools.

## Decision: No virtualization in this feature

**Decision**: Out of scope. Note as follow-up if 1000-row lists feel slow after the cache work.

**Rationale**: Spec success criteria do not require it. Cache sharing and optimistic updates deliver the specified wins without changing list layout or keyboard behavior.

## Test strategy

**Decision**: Keep pure helper tests framework-free. Add component tests with a fresh `QueryClient` per test (`retry false`, `staleTime 0`), stubbed `fetch`, and zustand reset via `setState` in `beforeEach`. Reuse existing `tests/support/dom-setup.ts` stubs.

**Rationale**: Matches existing vitest unit, integration, and component project split. Avoids cross-test cache leaks and keeps triage math verifiable without React.
