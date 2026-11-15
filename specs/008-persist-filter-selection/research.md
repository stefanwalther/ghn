# Research: Persist Filter Selection

**Feature**: `008-persist-filter-selection` | **Date**: 2026-11-14

## Decision 1: Storage key and payload shape

**Decision**: Single key `ghn:inbox-filters` holding `{version: 1, filters: {repo, state, type, age}}` as JSON.

**Rationale**: Follows the established `ghn:*` convention (`ghn:filter-width`, `ghn:filter-sections`, `ghn:last-opened`, `ghn:drawer-width`). Envelope with version lets future fields evolve without breaking old readers, same as plain-string keys do today but forward-compatible.

**Alternatives considered**:
- Four separate keys (one per field): rejected, four reads/writes per navigation for no benefit, harder to version atomically.
- `sessionStorage`: rejected, user explicitly asks for next visit persistence across restarts; `loadLastOpened` uses sessionStorage for scroll position, but filter memory needs `localStorage` like `ghn:filter-width`.

## Decision 2: URL stays canonical; storage is default-only

**Decision**: Any non-empty query string is explicit and wins. Only a bare entry (empty query string) restores from storage via `router.replace`. Every explicit filter change overwrites storage.

**Rationale**: Constitution principle III says filters live in the URL. Storage never overrides an explicit address, so shared/bookmarked links keep working. This matches how `parseInboxFilters`/`serializeInboxFilters` already treat missing params as defaults, except defaults now come from storage on bare entry.

**Alternatives considered**:
- Merge per-field (explicit repo + stored age): rejected for v1 as surprising; spec pins full-set restore on bare entry and full explicit render otherwise. Partial query strings (rare, only via hand-edit) use URL defaults for omitted fields; only a bare entry reads storage. UI always writes full sets so the distinction is invisible in practice.
- `router.push` for restore: rejected, restore must not create a history entry; `router.replace` with `scroll: false` matches existing `setFilters`.

## Decision 3: Validation reuses URL parsing

**Decision**: New `loadInboxFilters()` validates with the same allow-lists as `parseInboxFilters` (`state in unread|all|done`, `age` in known enum, non-empty `type`/`repo` strings). Unknown fields fall back per-field. Corrupt JSON, wrong shape, or thrown access returns null.

**Rationale**: One validation rule in two entry points (URL, storage). No new enum to drift. Fail-open keeps the inbox usable in private mode or after manual storage edits.

**Alternatives considered**: Zod/schema validation: rejected, overkill for four strings; existing `parseInboxFilters` pattern is try-free pure code with try/catch only around storage access, matching `loadFilterWidth`.

## Decision 4: Restore timing avoids fetch flash and hydration mismatch

**Decision**: Restore in the client `InboxView` with a mount effect: if `searchParams.toString()` is empty and stored filters are non-default, `router.replace('/' + serialize(...))`. Persist in a second effect watching the parsed filters. Render never blocks on storage; the first fetch for defaults may fire before replace, then the replaced URL fetches the remembered view. `useIsomorphicLayoutEffect` pattern already used for sidebar width is reused for consistency.

**Rationale**: `app/page.tsx` is a client component under `Suspense`; server render always uses defaults so hydration stays consistent (same as `ghn:filter-sections` which renders open then applies prefs). A blocking read would risk mismatch. The double-fetch on bare restore is one extra cached query, acceptable for a local-first app, and identical to today's behavior when a user clicks a filter right after load.

**Alternatives considered**:
- Middleware/cookie sync: rejected, adds server surface and secret-adjacent state for a pure client preference; constitution prefers client fetching plus caching.
- Zustand global for filters: rejected, principle III forbids stores for records/page state; filters already live in URL + local component callbacks.

## Decision 5: Test layers

**Decision**: Unit tests for `loadInboxFilters`/`saveInboxFilters` (validation, corrupt, private-mode throw, round-trip) in `tests/unit/view-state.test.ts` (extend existing file if present, else new). Component/e2e: extend `tests/e2e/inbox.spec.ts` pattern with a dedicated spec for bare-restore, explicit-wins, and corrupt-fallback using `page.addInitScript` localStorage seeding.

**Rationale**: Pure rules get unit coverage per constitution II; user journey (reload restores) needs a real browser store, so e2e, not jsdom. Existing e2e specs already drive `Filter by age/state` selects and sidebar buttons, so selectors are stable.

## Open items

None. All technical unknowns resolved; no NEEDS CLARIFICATION remains.
