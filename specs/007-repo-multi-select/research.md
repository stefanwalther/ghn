# Research: Repository Multi-Select with Bulk Context Menu

**Feature**: [spec.md](spec.md) | **Date**: 2026-11-08

No `NEEDS CLARIFICATION` items existed in the Technical Context (stack, patterns, and thresholds were all established in-repo). This document records the approach decisions with evidence, so Phase 1 design rests on verified patterns rather than guesses.

## Decision 1: Selection state lives inside FilterSidebar as local state

**Decision**: `FilterSidebar` owns `selected: Set<string>` plus `anchorId: string | null` via `useState`. The inbox page does not hold selection; it only supplies bulk-action callbacks.

**Rationale**: The spec requires selection to be independent of the active inbox filter, and `FilterSidebar` already works standalone in component tests (`tests/component/repo-list-filter.test.tsx`) with local state for the repo search box. Page-local UI state is the constitutionally preferred home for this. The inbox notification list already keeps its checkbox `selected` set as page state in `app/page.tsx`, so sidebar selection mirrors an established pattern without touching the global `useUIStore`.

**Alternatives considered**:
- Global store (`useUIStore`): rejected, store is for true globals (palette, sidebar open), never per-list UI state.
- URL query param: rejected, filter state stays single-valued per spec; selection is ephemeral working state, not shareable view state.

## Decision 2: One new pure range helper in lib/inbox-state.ts

**Decision**: Add a pure `rangeSelection(visibleIds: string[], anchorId: string | null, targetId: string, selected: Set<string>)` helper next to `nextSelection` / `toggleAllSelection` in `lib/inbox-state.ts`, covered by `tests/unit/inbox-state.test.ts`.

**Rationale**: The file's stated purpose is pure inbox decision logic kept out of components for direct testing. Toggle already exists (`nextSelection`); only Shift-range is missing. Pure + unit-tested matches constitution principle II and the existing test file proves the pattern. Shift ranges compute over the currently visible order (spec FR-015), so the helper takes the visible id list as input and stays independent of filtering.

**Alternatives considered**:
- Inline range logic in the click handler: rejected, untestable in isolation and against the file's documented purpose.

## Decision 3: Bulk menu as a second export in repo-snooze-menu.tsx

**Decision**: Add a `RepoBulkMenu` export in `components/inbox/repo-snooze-menu.tsx` that reuses the file's private positioning, submenu, and keyboard helpers. It takes an array of repo targets plus precomputed combined counts/mixed flags; single-row `RepoSnoozeMenu` is untouched.

**Rationale**: The positioning/submenu/keyboard code is ~300 lines of fiddly, tested behavior (viewport clamping, focus return, Escape layering). Duplicating it in a new file would fork behavior; extracting it into a shared module would be a new abstraction for two consumers in the same file. A second export in the same file is the smallest change that shares everything, per constitution principle III.

**Alternatives considered**:
- Generalize `RepoSnoozeMenu` props to accept arrays: rejected, every existing call site passes single-repo props and the branching would complicate the already-long component.
- New standalone menu component: rejected, duplicates positioning/a11y logic with inevitable drift.

## Decision 4: Fan-out through existing per-repository mutations, no new endpoint

**Decision**: Bulk actions call the existing mutations once per selected repository in parallel: `useUpdateRepository` for snooze/rhythm, `useMarkRepoDone` / `useMarkRepoRead` for triage. Combined pending/unread totals gate the existing `BULK_CONFIRM_THRESHOLD` (25, `lib/bulk.ts`) confirmation pattern, generalized from one repo id to an id list. Per-repo busy indication reuses the existing `pendingRepos` set, which is already a set.

**Rationale**: The spec assumes no new server capability. The mutations already carry optimistic updates with rollback and per-repo granularity; fan-out inherits all of it. The threshold constant's own comment says one number explains both bulk behavior and the confirm dialog, so applying it to combined totals is the intended use.

**Alternatives considered**:
- New `repositoryIds[]` bulk endpoint: rejected, spec explicitly out of scope and unnecessary at sidebar scale (tens of parallel PATCH calls are already the norm for notification bulks).
- Sequential calls: rejected, slower with no benefit; existing mutations are independent.

## Decision 5: Right-click targeting follows platform convention

**Decision**: Right-click on a selected row opens the combined menu for the whole selection; right-click on an unselected row clears the selection and targets only that row. Plain click clears selection and filters (unchanged). Escape closes menu first, then clears selection (menu already owns Escape while open per `app/page.tsx` key handler).

**Rationale**: Matches Finder/Explorer convention and spec FR-007 exactly. The inbox page already suspends list shortcuts while a `role="menu"` is open, so no new global-keyboard conflict work is needed.

## Decision 6: Keyboard story without roving tabindex

**Decision**: Rows stay native buttons (Tab-reachable). Ctrl/Cmd+Space/Enter toggles for free because the click event carries modifier flags. Add Shift+Arrow range extension on focused rows and Shift+F10/Applications-key menu opening via the existing per-row trigger path. `aria-pressed` on row toggle buttons, selection count announced via the existing `role="status"` patterns.

**Rationale**: Minimal mechanism that satisfies FR-016. Native buttons already handle focus visibility; arrow-key row movement is a small `onKeyDown` addition. Full roving-tabindex grid semantics would be heavier than the list warrants.

## Decision 7: Scope is FilterSidebar rows only

**Decision**: Selection applies to regular + snoozed repository rows in the sidebar. `DigestSection` quiet rows (main column, not the left menu) keep single-row menus. The sidebar quiet section shows only an aggregate row, so there is nothing per-repo to select there.

**Rationale**: The request names the left menu; spec FR-017 covers rows "when visible in the left menu". Keeps the change to one component tree.

## Decision 8: Test strategy per layer

**Decision**: Unit tests for the range helper (anchor null, forward/backward ranges, target outside visible list, hidden-row preservation). Component tests extending `repo-list-filter.test.tsx` for toggle/range/clear visuals, combined menu targeting, and disabled-when-nothing-actionable. One e2e journey (select three, snooze all, verify; combined done over threshold confirms) against the seeded stand-in.

**Rationale**: Matches constitution principle II layering (pure rules unit, React behavior component, journey e2e) and reuses existing fixtures instead of new ones.
