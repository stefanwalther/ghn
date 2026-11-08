# Feature Specification: Repository Multi-Select with Bulk Context Menu

**Feature Branch**: `007-repo-multi-select`

**Created**: 2026-11-08

**Status**: Draft

**Input**: User description: "I realize that it would be extremely cool to select several items in the left menu, either range with shift or single one with Ctrl, then have a context menu for all of them."

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Select multiple repositories in the left menu (Priority: P1)

A user with a long repository filter list selects several repositories using standard multi-select gestures: holding Ctrl (Windows/Linux) or Cmd (macOS) while clicking toggles individual rows, holding Shift while clicking extends a contiguous range from the anchor row. Selected rows show a visible selected state. A plain click without modifiers keeps today's behavior (filter the inbox to that repository and clear the multi-selection).

**Why this priority**: Selection is the foundation; without it no bulk menu is possible. It delivers visible value on its own (marking a working set).

**Independent Test**: Can be fully tested by Ctrl/Cmd-clicking three separate repository rows and Shift-clicking a fourth to extend a range, then verifying the selected set matches and the inbox filter is unchanged except for plain clicks.

**Acceptance Scenarios**:

1. **Given** the inbox filter sidebar with at least five repositories, **When** the user Ctrl/Cmd-clicks two non-adjacent rows, **Then** both rows appear selected and no other row does.
2. **Given** one selected anchor row, **When** the user Shift-clicks a row four positions below, **Then** every row between anchor and target inclusive becomes selected.
3. **Given** an active multi-selection, **When** the user plain-clicks one repository row, **Then** the multi-selection clears and the inbox filters to that single repository as today.
4. **Given** an active multi-selection, **When** the user presses Escape or plain-clicks empty sidebar space, **Then** the selection clears and focus stays in the sidebar.

---

### User Story 2 - One context menu for the whole selection (Priority: P1)

A user with several repositories selected right-clicks any selected row and gets a single context menu that acts on the entire selection: snooze all, set the same digest rhythm for all, mark all done/read for all, with per-action disabled states and counts reflecting the combined set.

**Why this priority**: This is the payoff the request asks for. It turns N repeated per-repo menus into one gesture.

**Independent Test**: Can be fully tested by selecting three repositories, right-clicking one, choosing "Snooze 1 hour", and verifying all three repositories snooze while unselected repositories are untouched.

**Acceptance Scenarios**:

1. **Given** three selected repositories, **When** the user right-clicks any selected row, **Then** one menu opens whose title names the selection size (e.g. "3 repositories") rather than a single repository name.
2. **Given** the bulk menu is open for three selected repositories, **When** the user picks a snooze preset, **Then** all three repositories receive that snooze value.
3. **Given** the bulk menu is open for three selected repositories, **When** the user picks a digest rhythm, **Then** all three repositories switch to that rhythm.
4. **Given** the bulk menu is open, **When** one selected repository has nothing actionable for an entry (e.g. zero pending items for "Mark all as done"), **Then** that entry shows the combined actionable count and stays enabled as long as at least one selected repository is actionable, and the confirmation names the affected subset.

---

### User Story 3 - Safe bulk triage with confirmations and feedback (Priority: P2)

A user applying a destructive or wide-reaching bulk action (marking many items done across several repositories) gets the same safety rails as today's single-repo flow: a confirmation step above the established destructive threshold, per-repository busy indication while the change applies, and one summary notice afterwards. Failures restore the previous state and explain what happened.

**Why this priority**: Bulk multiplies the blast radius of a misclick. Shipping selection plus menu without the existing safety rails would regress trust.

**Independent Test**: Can be fully tested by selecting repositories whose combined pending total exceeds the destructive threshold, choosing "Mark all as done", confirming, and verifying the confirmation count, the success notice, and rollback on simulated failure.

**Acceptance Scenarios**:

1. **Given** a selection whose combined pending total exceeds the established destructive-action threshold, **When** the user chooses "Mark all as done", **Then** a confirmation dialog appears naming the total item count and the number of repositories before anything changes.
2. **Given** a bulk action in flight, **When** the user looks at the sidebar, **Then** every affected repository row shows a busy indication while unaffected rows stay interactive.
3. **Given** a bulk action that partially or fully fails, **When** the operation settles, **Then** the previous repository states are restored and a single error notice explains the failure.

---

### Edge Cases

- What happens when the repository search filter changes or a section collapses while rows are selected? Hidden rows stay selected (selection is by repository identity, not visible position) but Shift-range extension uses the currently visible order.
- How does the menu behave for a mixed set (some snoozed, some not; different rhythms)? The menu shows "Mixed" instead of a single rhythm/snooze state, and the action still applies uniformly to the whole selection.
- What happens when the user right-clicks an unselected row while a selection exists? The menu targets only the right-clicked row (standard behavior) and the prior selection clears, unless the row is already part of the selection.
- How are single-row navigation actions handled for a multi-selection? "Open repo" applies to the row under the cursor only; "Copy link" copies all selected repository links (one per line); all triage/state actions apply to the whole selection.
- What happens on touch devices or keyboards without Ctrl/Cmd? Selection remains available through checkbox-style keyboard toggling (Space/Enter on a focused row with an explicit selection modifier key held, plus arrow-key navigation), and the "..." trigger menu offers the same bulk actions; nothing requires a right-click.
- What happens when all selected repositories are unactionable for an entry (e.g. zero pending across the set)? That entry is disabled with an explanatory hint.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: Users MUST be able to toggle individual repository rows in the left filter menu into and out of a selection using Ctrl-click on Windows/Linux and Cmd-click on macOS.
- **FR-002**: Users MUST be able to extend the selection as a contiguous visible range from the anchor row using Shift-click.
- **FR-003**: System MUST keep a single anchor row (the last toggled or clicked row) so repeated Shift-clicks extend from the same base until a new anchor is set.
- **FR-004**: System MUST visually distinguish selected rows from the single active filter row, and MUST keep both states visible when they overlap (a row can be both the active filter and part of the selection).
- **FR-005**: A plain click without modifiers MUST preserve today's behavior (filter to that repository) and clear the multi-selection.
- **FR-006**: Pressing Escape or plain-clicking empty sidebar space MUST clear the selection without changing the active filter.
- **FR-007**: Right-clicking a row that is part of the selection MUST open one combined menu for the whole selection; right-clicking a row outside the selection MUST target only that row and clear the prior selection.
- **FR-008**: The combined menu MUST offer the same triage actions as the single-row menu (snooze presets plus unsnooze, digest rhythm, mark all done, mark all read) applied to every selected repository.
- **FR-009**: The combined menu MUST show combined counts (total pending/unread across the selection) and MUST disable an entry only when no selected repository can act on it.
- **FR-010**: The combined menu MUST show "Mixed" instead of a single value when selected repositories disagree on rhythm or snooze state.
- **FR-011**: "Open repo" in the combined menu MUST open only the row under the cursor; "Copy link" MUST copy all selected repository links, one per line, and MUST report success or failure once.
- **FR-012**: Bulk destructive actions MUST reuse the established confirmation threshold and dialog pattern, naming the total affected item count and repository count.
- **FR-013**: System MUST show per-repository busy indication for every repository touched by an in-flight bulk action and MUST keep untouched rows interactive.
- **FR-014**: System MUST show the expected result immediately for every repository touched by a bulk action, restore failed repositories to their prior state, and MUST surface one summary notice (success with visible-plus-quiet split, or failure with restore message).
- **FR-015**: Selection MUST be by repository identity so filtering, searching, or collapsing sections never silently drops selected repositories; Shift-range computation MUST use the currently visible order.
- **FR-016**: The selection and bulk menu MUST be fully keyboard operable (navigate rows with arrows, toggle with an explicit modifier, open the menu from the keyboard, Escape closes menu then clears selection) and MUST expose selected/expanded states to assistive technology.
- **FR-017**: Snoozed-section rows and quiet-digest rows MUST participate in the same selection model as regular rows when visible in the left menu.

### Key Entities

- **Repository selection**: The set of selected repository identities plus one anchor identity marking the base for Shift-range extension. Independent of the single active inbox filter.
- **Combined menu target**: Either one repository (right-click outside selection) or the whole selection (right-click inside selection), with combined counts and mixed-state indicators derived from the member repositories.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Users can snooze or change the rhythm of 5 repositories in under 30 seconds (versus opening 5 separate menus today).
- **SC-002**: 90% of first-time users successfully select 3 non-adjacent repositories on their first attempt without instruction beyond standard Ctrl/Cmd and Shift hints.
- **SC-003**: Zero accidental bulk destructive actions in testing: every bulk "mark all done" above the destructive threshold shows a confirmation naming the correct totals before executing.
- **SC-004**: Bulk actions complete with the same perceived reliability as single-repo actions: success and failure notices appear within the same time budget, and failed repositories visibly roll back.

## Assumptions

- Standard platform conventions apply: Ctrl-click on Windows/Linux, Cmd-click on macOS (both supported everywhere so either modifier toggles); Shift extends a range; Escape clears.
- Single click, filtering, badges, and the single-row menu keep today's exact behavior when nothing is multi-selected, so existing users see no change until they use a modifier.
- The destructive-action confirmation threshold already used for single-repo and notification bulk actions is reused unchanged for multi-repo selections.
- Filter state stays single-valued: multi-select never creates a multi-repo inbox filter; it only defines the target set for the context menu. Viewing items from several repositories at once is out of scope.
- "Copy link" joins selected repository links with newlines; "Open repo" opens only the right-clicked repository to avoid popup-blocker bursts.
- Bulk actions behave exactly like repeating the corresponding single-repository action once per selected repository, including confirmations, busy indication, and notices; no new server capability is assumed.
- Touch users reach the same bulk actions through the existing per-row "..." control applied to the current selection; a dedicated long-press range gesture is out of scope for v1.
