# Feature Specification: Client State Management

**Feature Branch**: `005-client-state-management`

**Created**: 2026-10-22

**Status**: Draft

**Input**: User description: "our client-side state-management is not ideal and we might use something like TanStack or zustand. Evaluate and improve."

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Open inbox once and see consistent data everywhere (Priority: P1)

A developer opens the inbox, then opens the command palette to jump to a thread or repo. Both views show the same notification and repository data without a second spinner, a stale flash, or diverging counts.

**Why this priority**: Duplicate fetching is the most visible symptom today. Inbox and palette each fetch `/api/notifications` and `/api/repositories` independently. A single shared cache fixes perceived slowness and inconsistency in one move.

**Independent Test**: Can be fully tested by loading the inbox with network logging on, then opening the palette. Delivers one notifications request and one repositories request per 30s window shared across both views, with identical subjects and counts.

**Acceptance Scenarios**:

1. **Given** a loaded inbox, **When** the user opens the command palette, **Then** thread and repo results appear instantly from cached data without a new notifications fetch unless the cache is stale.
2. **Given** a filter change in the inbox, **When** the list reloads, **Then** the previous list stays visible with a background refreshing indicator rather than a full loading skeleton or empty flash.
3. **Given** two rapid filter changes, **When** responses return out of order, **Then** only the latest filter result is shown and no older response overwrites it.

---

### User Story 2 - Triage with instant feedback that never gets stuck (Priority: P1)

A developer selects rows and presses `d`, `r`, `u`, or uses bulk actions. Rows disappear or change state immediately, stay hidden on success, restore with a message on failure, and triage buttons never stay disabled after an error or timeout.

**Why this priority**: Triage is the core loop. Today's manual optimistic update plus `busyCount` counter and `fetchWithTimeout` is easy to leave stuck and hard to reason about.

**Independent Test**: Can be fully tested by triaging 5 items done, 2 read, 1 unread, then simulating a bulk failure. Delivers instant row update on action, restore on failure, and enabled buttons after every outcome.

**Acceptance Scenarios**:

1. **Given** selected items, **When** the user applies Done, **Then** rows leave the list immediately and stay gone after the background refetch on success.
2. **Given** a failing bulk request, **When** the request errors or times out, **Then** the prior list is restored with a non-blocking error and triage controls become enabled again.
3. **Given** overlapping triage and sync operations, **When** both run concurrently, **Then** buttons stay disabled until all settle and re-enable exactly once when the last one finishes.

---

### User Story 3 - Refresh, poll, and connection state stay truthful (Priority: P2)

A developer leaves the inbox open, triggers manual refresh, or loses GitHub connectivity. Last-synced time, stale indicator, poll countdown, and disconnected banner always agree and never show fresh data as stale or stale data as fresh.

**Why this priority**: Today's `nowMs` interval, `pollWindow`, `conn`, `stale`, and `syncError` are five separate atoms updated from three effects. Centralizing polling and connection status removes a class of drift bugs.

**Independent Test**: Can be fully tested by throttling sync, revoking auth, and waiting through a poll window. Delivers one consistent header state with last-synced time, countdown, and correct banner in each case.

**Acceptance Scenarios**:

1. **Given** a recent sync, **When** the poll window is active, **Then** refresh is disabled with an accurate countdown and re-enables automatically when the window ends.
2. **Given** GitHub unreachable, **When** refresh fails, **Then** cached rows stay readable with a stale indicator, last-synced time, and retry action.
3. **Given** expired access, **When** the inbox loads, **Then** a distinct disconnected state appears and cached rows are never presented as fresh.

---

### User Story 4 - Global UI actions work without event-string plumbing (Priority: P2)

A developer toggles the sidebar, opens the palette with Cmd+K, opens a thread from the palette, or shows shortcuts help. Every entry point produces the same result whether triggered from keyboard, button, or palette command.

**Why this priority**: Today's cross-component calls use `CustomEvent` names like `ghn:open-thread`, `ghn:refresh`, `ghn:toggle-sidebar`. Stringly-typed events are invisible to types and devtools and duplicate state in multiple components.

**Independent Test**: Can be fully tested by triggering each global action from all three entry points and navigating between inbox, repos, and settings. Delivers identical navigation, drawer, sidebar, and help behavior from every trigger.

**Acceptance Scenarios**:

1. **Given** any page, **When** the user invokes palette open via button or Cmd+K or slash, **Then** the same palette opens with focus in the input.
2. **Given** a palette thread result, **When** the user selects it from the inbox versus from another page, **Then** the inbox opens the drawer directly or navigates to the right repo filter and restores scroll to the thread.
3. **Given** sidebar or help state, **When** the user toggles via keyboard versus palette command, **Then** the resulting open or closed state matches and persists across reloads where persistence is expected.

---

### User Story 5 - Repos and settings share the same data behavior (Priority: P3)

A developer changes a repo rhythm or snooze, or checks settings and rate limits. Lists update without a full-page reload pattern copied per page, and loading and error states look and behave the same as the inbox.

**Why this priority**: Repos, settings, and rate-limits pages each re-implement load, loading, ready, error, and busy flags. Unifying them reduces future maintenance when adding new pages.

**Independent Test**: Can be fully tested by changing a rhythm, snoozing a repo, and reloading settings. Delivers in-place row update with rollback on failure and consistent loading and error copy across pages.

**Acceptance Scenarios**:

1. **Given** the repos list, **When** the user changes rhythm, **Then** the row updates immediately and stays updated on success or reverts with an error on failure without refetching the whole list from scratch visibly.
2. **Given** settings or rate-limits fetch failure, **When** load fails, **Then** the page shows the same retry pattern as the inbox error state.

---

### Edge Cases

- What happens when cache is empty and network is offline on first load? Show the same explicit error state with retry, not a stuck spinner, and succeed on retry without reload of the app.
- How does system handle filter in URL that is unknown or malformed? Fall back to unread and all, same as current `parseInboxFilters` behavior, without breaking shared cache keys.
- What happens when drawer item is triaged from keyboard while drawer is open? Drawer closes for done actions and updates in place for read actions, with focus returning to a sensible row.
- What happens when palette thread id is not in current filter? Save last-opened, navigate to owning repo filter, and scroll to the thread after load, preserving existing restoration behavior.
- What happens when localStorage or sessionStorage is unavailable? Sidebar, drawer width, and last-opened persistence degrade silently without breaking state updates.
- What happens when user navigates quickly between inbox, repos, and settings? In-flight requests do not overwrite the newly mounted page and shared repo data is reused.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: System MUST share one cached copy of notification and repository server data across inbox and command palette so concurrent views do not issue duplicate fetches within the freshness window.
- **FR-002**: System MUST keep the previous inbox list visible during filter change or background refetch with a distinct refreshing indicator instead of replacing it with a full loading state.
- **FR-003**: System MUST ignore out-of-order list responses so only the latest filter request determines the visible list.
- **FR-004**: System MUST apply triage actions optimistically to the visible list immediately, confirm via background refetch on success, and restore the prior list with a non-blocking message on failure.
- **FR-005**: System MUST disable triage controls while any triage or per-thread sync is in flight and re-enable them exactly when all settle, including on timeout or error.
- **FR-006**: System MUST show per-thread syncing state on affected rows without blocking triage of other rows.
- **FR-007**: System MUST centralize refresh polling so the disabled window, countdown, last-synced time, stale flag, and disconnected banner always agree.
- **FR-008**: System MUST keep inbox filters in the URL as the source of truth so links, back and forward, and palette repo-filter navigation keep working unchanged.
- **FR-009**: System MUST provide typed global UI actions for palette open, sidebar toggle, help open, thread open, refresh, and scroll-top that behave identically from keyboard, button, and palette triggers.
- **FR-010**: System MUST persist sidebar open state, drawer width, and last-opened thread using existing storage keys unless the user explicitly resets them, degrading silently when storage is unavailable.
- **FR-011**: System MUST reuse the existing pure decision helpers for selection, optimistic updates, focus index, and poll window behavior so tested triage math does not change.
- **FR-012**: Users MUST retain full keyboard triage, drawer navigation, palette ranking, and light and dark themes with no regression in shortcut behavior or accessibility baseline.
- **FR-013**: System MUST NOT increase the number of notifications or repositories requests per user action compared to today; palette opens and filter-preserving navigations MUST reuse cache when fresh.

### Key Entities

- **Server Cache Entry**: Shared fresh copy of remote data (notifications list for a filter, repositories list, connection status, thread details) with freshness time, background refreshing flag, and error state. Replaces per-component fetch state.
- **Inbox Filter**: URL-backed selection of repo, state, type, and age that keys the list query and survives reload, share, and navigation.
- **Optimistic Mutation**: Immediate list change for a triage action with previous list retained for rollback, plus busy and per-row syncing indicators until settled.
- **Global UI State**: Cross-page ephemeral state for sidebar open, palette open, shortcuts help open, selected ids, focused index, and open drawer item.
- **Sync Status**: Last successful sync time, poll interval, disabled-window countdown, stale flag, and connection state shown in the inbox header and brand mark.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Opening the palette from a loaded inbox issues zero new notifications fetches in 95% of trials within the freshness window, and results appear in under 200ms from cache.
- **SC-002**: Users triage 20 items to done, read, and unread in under 5 minutes with instant row feedback and zero cases of stuck disabled buttons after success, failure, or timeout.
- **SC-003**: Rapid filter changes show only the latest result in 100% of out-of-order response trials, with no stale list flash replacing the correct list.
- **SC-004**: Failed triage restores the prior list with a visible message in 100% of simulated failure trials, and controls become usable again without page reload.
- **SC-005**: 90% of users can state last-synced time and next-refresh countdown correctly during a poll window, and disconnected versus stale states are correctly distinguished in 100% of offline trials.
- **SC-006**: All global actions produce identical outcomes from keyboard, button, and palette triggers in acceptance walkthrough, with zero untyped event-string mismatches found in review.

## Assumptions

- Single-user local app behavior, digest math, keyboard shortcuts, and w5r-design layout carry over unchanged; this is a client-state refactor, not a UX redesign.
- Inbox filters stay in the URL; no filter state moves into a client store.
- Pure helpers in `lib/inbox-state.ts`, `lib/view-state.ts`, and `lib/filters.ts` keep their tested semantics and are reused by mutations and UI.
- Existing API routes and response shapes are unchanged; only client fetching and caching change.
- Preferred direction is TanStack Query for server cache and a minimal typed store for global UI, but final stack choice happens in planning with bundle-size and App Router fit verified.
- Storage keys `ghn:sidebar`, `ghn:drawer-width`, and `ghn:last-opened` keep their names and fallback behavior.
- Accessibility baseline holds: full keyboard operability, visible focus, no color-only signaling.
