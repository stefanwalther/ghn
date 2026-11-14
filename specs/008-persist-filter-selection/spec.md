# Feature Specification: Persist Filter Selection

**Feature Branch**: `008-persist-filter-selection`

**Created**: 2026-11-14

**Status**: Draft

**Input**: User description: "The Filter selection should be remembered in the localStorage, so if I open ghn the next page, the filter from last time is pre-selected without any further do."

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Reopen ghn with last filters pre-selected (Priority: P1)

A user triages with a non-default filter set (for example repo `acme/web`, state `unread`, type `pull_request`, age `7d`), closes the tab, and opens ghn again at `/` with no query string. The inbox shows the same filter set as the last visit, without any extra click.

**Why this priority**: This is the exact request. It removes the daily re-filtering friction and delivers value on its own.

**Independent Test**: Can be fully tested by setting a non-default filter, reloading `/` with an empty query string in a fresh navigation, and verifying the sidebar, age/state selects, and list match the previous selection.

**Acceptance Scenarios**:

1. **Given** a previous visit stored repo `acme/web`, state `unread`, type `pull_request`, age `7d`, **When** the user opens `/` with no query params, **Then** the inbox pre-selects those four values and loads that view.
2. **Given** no stored filters (first visit or cleared storage), **When** the user opens `/` with no query params, **Then** the inbox shows today's defaults (`repo=all`, `state=unread`, `type=all`, `age=all`).
3. **Given** a stored filter set, **When** the user reloads, **Then** no extra confirmation or click is required.

---

### User Story 2 - Explicit URL always wins and refreshes memory (Priority: P1)

A user opens a shared or bookmarked link such as `/?repo=acme/api&state=all`, or changes any filter in the UI. The URL view renders exactly, and that explicit choice becomes the new remembered set for the next bare visit.

**Why this priority**: URL is the constitution's source of truth for filters and the sharing mechanism. Memory must never hijack a deep link.

**Independent Test**: Can be fully tested by opening a URL with explicit params while a different set is stored, verifying the URL view renders, then opening `/` bare and verifying the URL set is now the remembered one.

**Acceptance Scenarios**:

1. **Given** stored filters differ from the link, **When** the user opens `/?repo=acme/api&state=all`, **Then** the inbox shows `acme/api` + `all` (not the stored values).
2. **Given** the inbox is open, **When** the user changes any filter (repo, state, type, age), **Then** the URL updates as today and the stored set updates to match.
3. **Given** the user picks "All repositories" / default values, **When** the change applies, **Then** the stored set records the defaults too, so the next bare visit also shows "all".

---

### User Story 3 - Corrupt or stale memory never breaks the inbox (Priority: P2)

A user returns with localStorage missing, blocked (private mode), corrupt, or holding values that no longer validate (unknown age, unknown state, repo id that no longer exists in facets).

**Why this priority**: Robustness gate. A convenience feature must fail open to today's defaults, never to an error or empty screen.

**Independent Test**: Can be fully tested by seeding localStorage with garbage, an unknown age, and an unknown repo id, then opening `/` bare and verifying the inbox falls back to safe defaults and stays usable.

**Acceptance Scenarios**:

1. **Given** localStorage holds invalid JSON or blocked access throws, **When** the user opens `/` bare, **Then** the inbox shows defaults and remains fully interactive.
2. **Given** stored age/state/type values outside the known enums, **When** the user opens `/` bare, **Then** each invalid field falls back to its default (`all`, except state falls back to `unread`).
3. **Given** a stored repo id with no matching facet, **When** the inbox loads, **Then** the repo filter still pre-selects the stored id text (deep-link semantics) but the list shows the empty state for that repo rather than crashing; picking another repo recovers.

---

### Edge Cases

- What happens when localStorage is unavailable (private mode, quota, disabled)? Reads return null, writes are swallowed; inbox behaves as today with URL-only filters.
- How are partial query strings handled (e.g. only `?repo=x`)? Explicit params win per-field; missing fields fall back to stored values first, then defaults. A bare `/` (empty query) uses the full stored set.
- What happens when the stored repo no longer exists? The filter still applies (same as typing an unknown `?repo=` today); facets simply show zero counts and the empty state explains it.
- Does back/forward navigation re-trigger a restore? No. Restore runs once on bare entry; in-session history navigation uses the URL as today and each URL change re-saves.
- Does this change server state, API, or DB? No. Pure client preference, same pattern as `ghn:filter-width` and `ghn:filter-sections`.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: System MUST persist the active inbox filter set (`repo`, `state`, `type`, `age`) to localStorage on every filter change that updates the URL.
- **FR-002**: System MUST, on opening `/` with an empty query string, restore the stored filter set and navigate to its serialized URL before or during first data load, with no user action.
- **FR-003**: System MUST treat any non-empty query string as explicit: render exactly what the URL says and overwrite the stored set with the parsed explicit values.
- **FR-004**: System MUST validate stored values on load with the same rules as URL parsing (known `state` in `unread|all|done`, known `age` enum, `type` non-empty string, `repo` non-empty string); invalid fields MUST fall back to defaults (`all`, state `unread`).
- **FR-005**: System MUST fail open when storage is missing, corrupt, or throws: fall back to defaults and keep the inbox fully usable.
- **FR-006**: Storage MUST use a single namespaced key following the existing `ghn:*` convention and store a versioned JSON payload so future fields can evolve without breaking old readers.
- **FR-007**: System MUST NOT change the URL schema, API contracts, or server state; URL remains the canonical shareable representation.

### Key Entities

- **Remembered filter set**: The last explicit inbox filter choice (`repo`, `state`, `type`, `age`) plus a schema version. Lives only in the browser's localStorage, written on every explicit filter navigation, read once on bare entry.
- **Explicit navigation**: Any location with a non-empty query string, or any in-app filter change. Always renders verbatim and becomes the new remembered set.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Returning users opening `/` bare see their last filter set pre-selected with zero extra clicks, verified by manual reload and by an automated browser test (set filter, reload bare, assert URL + UI match).
- **SC-002**: Shared/bookmarked URLs render exactly as addressed even when stored filters differ, with zero hijack events in testing (explicit-URL suite passes).
- **SC-003**: With storage blocked or seeded with corrupt/unknown values, the inbox loads to safe defaults with no error screen and remains triage-capable (robustness suite passes).
- **SC-004**: No regression to existing filter behavior: current URL-only filter tests (inbox, views, triage, palette-scopes specs) keep passing unchanged.

## Assumptions

- All four inbox filter dimensions are remembered together (`repo`, `state`, `type`, `age`); remembering a subset was considered and rejected because a partial restore surprises more than a full one.
- The existing URL defaults stay unchanged (`repo=all`, `state=unread`, `type=all`, `age=all`).
- Storage key follows the established convention (`ghn:inbox-filters`) with a `{version: 1, filters: {...}}` envelope; `localStorage` (not `sessionStorage`) so the memory survives restarts, matching `ghn:filter-width`.
- Restore applies only when the entry URL has an empty query string; any param present means explicit intent.
- No cross-tab sync or expiry in v1; last write wins, and a stored repo id is never validated against facets at restore time.
