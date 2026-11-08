# Contract: Sidebar Multi-Select Interaction

**Feature**: [spec.md](../spec.md) | **Date**: 2026-11-08

UI behavior contract for the repository multi-select. This is the contract a reviewer or test author checks against; prop names below are proposed and finalized in implementation.

## 1. Selection gestures

| Input | Precondition | Result |
|---|---|---|
| Ctrl-click / Cmd-click row | any | Toggle row membership; row becomes anchor |
| Shift-click row | anchor set | Select visible range anchor→target (union with existing) |
| Shift-click row | no anchor | Toggle target row; row becomes anchor |
| Plain click row | any | Clear selection; filter inbox to row (unchanged behavior) |
| Escape | menu closed, selection non-empty | Clear selection; filter unchanged |
| Escape | menu open | Close menu only (existing menu behavior) |
| Click empty sidebar space | selection non-empty | Clear selection; filter unchanged |

Both Ctrl and Cmd toggle on every platform. Either modifier plus Shift extends a range.

## 2. Visual states

- Selected rows carry `aria-pressed="true"` (toggle-button pattern; `aria-selected` is invalid on the `button` role) and a selected style distinct from the active-filter style.
- A row that is both active filter and selected shows both states simultaneously.
- Busy rows (bulk action in flight) show the existing per-repo busy indication in addition to selection.

## 3. Menu targeting

| Input | Result |
|---|---|
| Right-click selected row | One `RepoBulkMenu` for the whole selection; title names the count (e.g. "3 repositories") |
| Right-click unselected row with active selection | Clear selection; single-row menu for that row |
| Keyboard menu key / "..." trigger on a selected row | Same as right-click on that row |
| Keyboard menu key / "..." trigger on an unselected row | Single-row menu (unchanged) |

## 4. Bulk menu entries

Available entries mirror the single-row menu: snooze presets + unsnooze, digest rhythm submenu, mark all done, mark all read, open repo, copy link.

| Entry | Multi behavior |
|---|---|
| Snooze preset / unsnooze | Applies to every selected repository |
| Rhythm | Applies to every selected repository; shows "Mixed" when members disagree |
| Mark all done | Applies to members with pending > 0; label shows combined count; confirmation above threshold names items + repo count |
| Mark all read | Applies to members with unread > 0; label shows combined count |
| Open repo | Opens the anchor (right-clicked) row only |
| Copy link | Copies all selected links, one per line; single success/failure notice |
| Any entry | Disabled with hint only when the combined actionable count is zero |

## 5. Inbox-page fan-out contract

The sidebar reports bulk intents; the inbox page executes them:

- `onBulkSnooze(ids, snoozedUntil)`, `onBulkRhythm(ids, rhythm)`, `onBulkDone(ids)`, `onBulkRead(ids)` (names proposed).
- Done/read fan out through the existing `useMarkRepoDone` / `useMarkRepoRead` mutations once per actionable repository; snooze/rhythm through `useUpdateRepository`.
- Combined totals reuse `BULK_CONFIRM_THRESHOLD`; the existing confirm dialogs generalize from one repository to an id list, naming total items and repository count.
- Exactly one summary notice per bulk operation; failures restore affected repositories and report once.

## 6. Non-goals (out of contract)

- Multi-repository inbox filtering (filter stays single-valued).
- Touch long-press range gesture (trigger control covers touch).
- `DigestSection` main-column rows (single-row menus unchanged).
