# Feature Specification: Single-Source Inbox List

**Feature Branch**: `006-single-source-list`

**Created**: 2026-10-27

**Status**: Draft

**Input**: User description: "Single-source inbox list in several phases: render the list directly from one shared list with optimistic updates plus rollback so triaged rows never return, keep all-view done rows visible marked in place, surface queued versus settled distinctly, wire mute plus rhythm placement with precedence, and pin repos on the repos page. Must keep the lifecycle guarantees green with regression tests plus all five gates."

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Triage without flicker (Priority: P1, Phase 2)

A developer selects notifications and marks them done. Rows leave the inbox immediately, stay gone through any background refresh, and only a failure brings them back with a message.

**Why this priority**: This is the reported backbone bug. Done rows that return destroy trust in triage. One shared list removes the entire class.

**Independent Test**: Can be fully tested by marking 20 items done on a throttled connection, including a manual refresh mid-triage, and confirming zero rows return across three runs.

**Acceptance Scenarios**:

1. **Given** an unread inbox with visible items, **When** the user marks one or more items done, **Then** those rows leave the list immediately and stay absent through every background refresh until the action confirms.
2. **Given** a bulk action in flight, **When** the user triggers a manual refresh before the action commits, **Then** the pre-commit refresh response never restores the removed rows.
3. **Given** a failing bulk action, **When** the request errors or times out, **Then** the prior list is restored with a non-blocking message and triage controls become usable again without reload.
4. **Given** overlapping triage and sync operations, **When** both run concurrently, **Then** triage controls stay disabled until all settle and re-enable exactly once when the last one finishes.

---

### User Story 2 - All-view done stays visible (Priority: P1, Phase 2)

A developer working in the all filter marks items done. Rows stay visible and show their done state instead of flashing out and back on the next refresh.

**Why this priority**: The all view intentionally keeps done rows. Removing them optimistically contradicts the confirmed state and reproduces the reported symptom on every refresh.

**Independent Test**: Can be fully tested by marking 2 items done in the all view with the server response gated, confirming both rows stay visible throughout, then confirming they still show after the response lands.

**Acceptance Scenarios**:

1. **Given** the all filter with visible items, **When** the user marks items done, **Then** the rows stay in place showing done state and never leave the list at any point.
2. **Given** the confirmed post-action refresh, **When** it returns, **Then** the same rows remain visible with no flash or reorder.

---

### User Story 3 - Offline triage and revive survive sync (Priority: P2, Phase 2)

A developer triages while offline or revives a finished item. Hidden rows stay hidden, revived rows stay revived, and the next sync cycle changes neither until the queued work is pushed. In doubt the remote service state wins for everything without explicit local intent.

**Why this priority**: Local-first triage is the backbone promise. Any sync that reverts unpushed intent reintroduces the reappear class through a different door.

**Independent Test**: Can be fully tested by marking items done offline, reviving one finished item, running a full sync cycle, and confirming hidden stays hidden, revived stays revived, and queued labels clear only after the push succeeds.

**Acceptance Scenarios**:

1. **Given** items marked done while the remote push fails or is offline, **When** a sync cycle runs before the retry succeeds, **Then** the rows stay hidden with a queued indication and the sync never restores them.
2. **Given** a finished item explicitly revived to unread, **When** a full sync cycle runs, **Then** the row stays revived and is never re-marked done by the sync.
3. **Given** the queued push later succeeds, **When** the next sync confirms it, **Then** queued indications clear with no rows returning.
4. **Given** a clean row with no queued work and no revive, **When** the remote state changed, **Then** the next sync converges the row to the remote state.

---

### User Story 4 - Queued versus settled reads distinctly (Priority: P2, Phase 3)

A developer triaging offline always sees which rows are confirmed and which are still waiting on the remote push, with words that never mix the two.

**Why this priority**: Hidden rows with no explanation read as a silent no-op. Busy and queued are different facts and the UI must never use one word for both.

**Independent Test**: Can be fully tested by triaging offline and confirming every hidden row carries a queued label that clears exactly when its push succeeds, while busy indicators appear only while work is actually in flight.

**Acceptance Scenarios**:

1. **Given** rows hidden while their push is still queued, **When** the user looks at the inbox, **Then** a persistent queued indication explains they are waiting on the remote push.
2. **Given** the queued push succeeding, **When** the next sync confirms it, **Then** the queued indication clears with no rows returning.
3. **Given** any in-flight triage or sync work, **When** the user looks at the controls, **Then** busy means work in flight and queued means waiting on remote, never one word for both.

---

### User Story 5 - Mute and rhythm place rows predictably (Priority: P3, Phase 4)

A developer mutes a noisy repo, changes a digest cadence, or promotes a repo to immediate. Rows move between the main flow and the quiet digest exactly as stated, and no placement change ever flips done state.

**Why this priority**: Placement confusion reads as data loss. One written precedence rule makes every move predictable.

**Independent Test**: Can be fully tested by muting an immediate repo, changing rhythms, and promoting a quiet repo, confirming placement after each step with done states untouched.

**Acceptance Scenarios**:

1. **Given** a muted repo, **When** its digest becomes due or its rhythm changes, **Then** it stays quiet until the mute expires or is lifted, since mute always beats rhythm.
2. **Given** any rhythm or mute change, **When** it applies, **Then** no notification changes done state and counts stay consistent.
3. **Given** a repo-wide done on a quiet repo, **When** it confirms, **Then** the hidden pending items clear too and the messaging states that explicitly.

---

### User Story 6 - Pin repos on the repos page (Priority: P3, Phase 5)

A developer pins a repo. It appears under Pinned Repositories above the regular list instead, with nothing else about the app changing.

**Why this priority**: Small grouping win with zero triage risk when scoped to display only.

**Independent Test**: Can be fully tested by pinning and unpinning repos and confirming sections, search, counts and inbox placement behave identically otherwise.

**Acceptance Scenarios**:

1. **Given** the repos page, **When** the user pins a repo, **Then** it renders in a Pinned Repositories section above Repositories and nowhere else changes.
2. **Given** a search fragment, **When** filtering, **Then** both sections filter and an empty pinned section stays hidden.
3. **Given** pin or unpin, **When** it confirms, **Then** counts, inbox placement and sidebar stay exactly as before.

---

### Edge Cases

- What happens when responses arrive out of order? Only the latest filter result determines the visible list; older responses never overwrite it.
- What happens when the user switches filters mid-triage? The pending action still confirms against its own filter and the new filter loads independently without restoring removed rows.
- What happens when the last visible item is triaged? The list shows the correct empty state for the active filter instead of a blank or stale list.
- What happens when the open drawer item is triaged done? The drawer closes and focus moves to a sensible row; read actions update the drawer in place.
- What happens when two bulk actions run back to back? Both confirm independently and the final list reflects both, with no restored rows from either.
- What happens when GitHub has no unread write? Revive stays local-only by design (proven by live API probe); the divergence is documented, not retried.
- What happens when a muted immediate repo hits its due date? It stays quiet until unsnooze or expiry; mute beats rhythm with no exception.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: System MUST apply done and unsubscribe to the unread view immediately, removing the rows from the visible list at action time.
- **FR-002**: System MUST keep removed rows absent through every background refresh, including refreshes started before the action commits, until the action confirms or fails.
- **FR-003**: System MUST restore the prior list with a non-blocking message and re-enabled controls when a bulk action fails for any reason.
- **FR-004**: System MUST mark done rows in place without removing them when the active filter is the all view, at action time and after confirmation.
- **FR-005**: System MUST keep offline or queued done rows hidden with an explicit queued indication across sync cycles until the push succeeds.
- **FR-006**: System MUST keep explicitly revived rows revived across full sync cycles and MUST NOT re-mark them done during sync reconciliation.
- **FR-007**: System MUST converge clean rows to the remote state on sync: missing threads done on full sync, changed threads refreshed, read following remote.
- **FR-008**: System MUST surface queued and busy distinctly: queued means hidden while waiting on remote, busy means work in flight, with no shared wording.
- **FR-009**: System MUST let mute override rhythm on every placement decision and MUST never change done state on any rhythm or mute change.
- **FR-010**: System MUST state explicitly when repo-wide done clears hidden pending items.
- **FR-011**: System MUST render pinned repos in a Pinned Repositories section above Repositories, filter both sections on search, hide the pinned section when empty, and leave counts, inbox placement and sidebar untouched.
- **FR-012**: System MUST derive every inbox view (list, counts, empty states, drawer position) from one shared list so no second copy can diverge from it.
- **FR-013**: System MUST disable triage controls while any triage or per-thread sync is in flight and re-enable them exactly once when all settle, including on timeout or error.

### Key Entities

- **Shared inbox list**: The single cached copy of the filtered list every view reads from, with freshness state and a background refreshing indicator.
- **Optimistic change**: An immediately applied list change holding the previous list for rollback, with busy state until confirmed or restored.
- **Queued write**: A remote push that has not succeeded yet and MUST survive sync cycles without being reverted.
- **Revived row**: A finished item explicitly brought back that MUST survive sync reconciliation until the user triages it again.
- **Filter view**: The URL-backed unread, all, or done selection that decides whether done rows are hidden, shown, or exclusive.
- **Repo placement**: The per-repo mute, rhythm and pin settings deciding main flow versus quiet digest versus pinned grouping, never touching row state.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Bulk done of 20 items shows zero returned rows across 3 throttled runs, including one manual refresh started mid-triage in each run.
- **SC-002**: Failed triage restores the prior list with a visible message in 100% of simulated failure trials, with controls usable again without page reload.
- **SC-003**: All-view done keeps every row visible with done state in 100% of trials, with zero flash-out-and-back frames.
- **SC-004**: Offline done rows and revived rows survive a full sync cycle in 100% of trials, with queued labels clearing only after the push succeeds.
- **SC-005**: Queued labels are present on 100% of unpushed hidden rows and clear exactly on confirmation, with busy shown only while work is in flight.
- **SC-006**: Mute, rhythm and promote moves place rows correctly in 100% of trials with zero done-state flips and consistent counts.
- **SC-007**: Pin and unpin leave counts, inbox placement and sidebar identical in 100% of trials, with both sections searchable.
- **SC-008**: 90% of users triaging 20 mixed items report full confidence the list reflects their actions, with zero "it came back" reports in acceptance walkthrough.

## Assumptions

- GitHub offers no unread write (proven by live API probe on 2026-10-27); revive stays local-only and the divergence is documented, not a defect.
- Existing regression tests pin the fixed behavior and MUST stay green: the revive-survives-sync unit test and the all-view mark-in-place component test.
- All five gates MUST pass: typecheck, lint, unit, integration, component.
- Stories land in phase order 1 through 6 but each is independently testable once its predecessors are in place.
- Worktree cleanup and branch sequencing are process work outside this spec; the spec covers product behavior only.
- Filter state stays in the URL as the source of truth; no filter state moves into a client store.
