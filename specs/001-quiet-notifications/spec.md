# Feature Specification: Quiet Notifications Prototype

**Feature Branch**: `001-quiet-notifications`

**Created**: 2026-10-14

**Status**: Draft

**Input**: User description: "We want to build a prototype, including a full web-ui (following the $w5r-design ), that is doing the following: Same or similar functionality as the GitHub Notifications interface, but reduce some of the clicking, some repos I do not own, show updates only once a week or every 2 weeks or once a month (local SQLite db or so), TypeScript/Bun/Next.js/Shadcn stack, read-only browser view of GitHub notifications page if needed, ideally 'Back to notifications' if somehow possible. Feel free to ask questions until we nail a first prototype/MVP."

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Triage notifications with fewer clicks (Priority: P1)

A developer with notifications across many repositories opens one unified inbox in the morning, scans unread items grouped and filterable by repository, previews enough context to decide, and clears items in bulk with one or two actions instead of opening each thread on GitHub.

**Why this priority**: This is the core value. If triage still takes as many clicks as GitHub, the prototype fails regardless of digest or styling.

**Independent Test**: Can be fully tested by loading a seeded inbox of 20+ notifications across 3+ repos, triaging all of them to done/unread/deferred using only the list view, and measuring clicks and time versus the GitHub baseline. Delivers a visibly faster inbox.

**Acceptance Scenarios**:

1. **Given** an inbox with unread notifications from multiple repos, **When** the user opens the prototype inbox, **Then** they see unread items with repository name, subject, reason, and age without opening each thread.
2. **Given** a list of visible notifications, **When** the user selects multiple items and marks them done in one action, **Then** those items leave the inbox and the selection clears.
3. **Given** a notification in the list, **When** the user opens its source thread, **Then** they can return to the same inbox position with one back action.

---

### User Story 2 - Quiet down noisy repos with a digest schedule (Priority: P2)

A developer who watches repositories they do not own sets a per-repository rhythm (weekly, every 2 weeks, monthly) so updates from those repos stay hidden until the digest is due, while owned or urgent repos stay immediate.

**Why this priority**: This is the second-biggest pain: low-priority repos drown out owned repos. Independent of triage speed, it changes what shows up and when.

**Independent Test**: Can be fully tested by setting one repo to weekly and one to monthly, seeding updates on non-due days, and verifying they stay in the collapsed dimmed section until due while an immediate repo stays in the main flow. Delivers a calmer inbox.

**Acceptance Scenarios**:

1. **Given** a repository set to weekly digest, **When** new activity arrives before the due date, **Then** it appears only as a dimmed collapsed group at the bottom of the inbox with a pending count, outside the main triage flow.
2. **Given** a digest becomes due, **When** the user opens the inbox on or after the due date, **Then** the pending items for that repo appear as a group with a clear "digest due" indicator.
3. **Given** per-repo digest settings saved locally, **When** the app restarts, **Then** the settings and pending counts persist.

---

### User Story 3 - Stay oriented between prototype and GitHub (Priority: P3)

A developer who jumps to GitHub to read or comment never loses their place: every item links to its source, and returning brings them back to the same filtered inbox.

**Why this priority**: Builds trust for daily use. Without reliable round-tripping, users will not adopt the prototype even if triage and digests work.

**Independent Test**: Can be fully tested by opening 3 source threads from the inbox and returning each time to the same filter and scroll position. Delivers confidence to use both views together.

**Acceptance Scenarios**:

1. **Given** a notification in the prototype, **When** the user activates "open source", **Then** the source thread opens in a new context with the prototype inbox preserved.
2. **Given** the user has navigated to the source, **When** they trigger the back action, **Then** they land on the prior inbox state (same filter, selection cleared or preserved, position retained).

---

### Edge Cases

- What happens when the notification source is unreachable or returns an error? Show a non-blocking error state with retry, keep cached inbox readable.
- How does the system handle zero notifications (all done)? Show an explicit empty state, not a blank page.
- What happens when a digest repo has no activity by its due date? Show "nothing pending" rather than an empty digest group.
- How are timezone and week boundaries handled for weekly/biweekly/monthly digests? Use one consistent local definition and display the next due date.
- What happens when a user changes a repo from monthly to immediate? Pending items become visible immediately on next inbox load.
- What happens when authentication to the source expires? Show a clear disconnected state with a reconnect path, do not silently show stale data as fresh.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: System MUST present a unified inbox of notifications showing repository, subject, reason, and age for each item without requiring per-item navigation.
- **FR-002**: System MUST let users filter the inbox by repository, by notification type (mention, review requested, action failed, CI failed, release, merged, assigned, subscribed), by age bucket (last 24 hours, last 48 hours, last 7/14/30 days, this year, older than a year, all time), and by read/done state.
- **FR-003**: Users MUST be able to mark one or multiple notifications as done and as unread from the list view.
- **FR-004**: System MUST let users open the source thread for any notification from the list.
- **FR-005**: System MUST preserve inbox context (filter and position) when the user returns from a source thread.
- **FR-006**: Users MUST be able to set a per-repository update rhythm of immediate, weekly, every-2-weeks, or monthly, plus a temporary snooze (in 1 hour, in 3 hours, this evening, tomorrow morning, next week, or a custom time) that hides the repo until it expires without changing the rhythm.
- **FR-007**: System MUST keep non-due digest items out of the main triage flow in a dimmed collapsed section at the bottom, showing a pending count per repository (decision Q2: Option C).
- **FR-008**: System MUST promote a digest group into the main flow when it becomes due, with a visible due indicator and next due date.
- **FR-009**: System MUST persist per-repository digest settings and pending state across restarts using local storage.
- **FR-010**: System MUST display repository-level digest status (rhythm, next due date, pending count) in the UI.
- **FR-011**: System MUST provide a single-click return path from a source thread context back to the prior inbox state ("Back to notifications").
- **FR-015**: System MUST display the authenticated user's GitHub contribution count for the current day, fetched via `gh`, cached locally per day, always visible in the header, with a quiet fallback when offline or unauthenticated.
- **FR-012**: System MUST provide bulk checkbox triage with one-click Done and Unread from the list view (decision Q1: Option A), plus keyboard triage (j/k move, x select, e done, Shift+U unsubscribe, u unread, r read, o open, a select all, Esc clear, ? help) that never fires while typing, with key hints revealed while holding Alt. Inline preview remains out of scope.
- **FR-013**: System MUST render non-due digests as a dimmed collapsed section at the bottom of the same inbox view (decision Q2: Option C), not as a separate tab.
- **FR-014**: System MUST source MVP notification data from local mocked seed data only (decision Q3: Option A). Live GitHub read is an explicit follow-up and MUST NOT add a second data path to the MVP.

### Key Entities

- **Notification**: An update item from a repository (subject, repository, reason such as mention/review/CI, age, read/done state, link to source thread).
- **Repository**: A watched code repository (name, ownership such as owned vs. watched, digest rhythm, pending count, next due date).
- **Digest Setting**: Per-repository cadence choice (immediate, weekly, every-2-weeks, monthly) plus computed next due date and pending item set.
- **Inbox View State**: Current filter, selection, and position that must survive round-trips to source threads.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Users can triage 20 notifications to done/unread in under 5 minutes from the list view without opening each source thread.
- **SC-002**: Triage from the list takes at most half the clicks of the equivalent GitHub Notifications flow for the same 20 items.
- **SC-003**: 90% of first-time users can set a repository to weekly digest and correctly state when it will next appear, without guidance.
- **SC-004**: Non-due digest items stay out of the main triage flow in 100% of seeded test runs, remaining in the collapsed section until due, while due digests promote to the main flow within one day of their due date.

## Assumptions

- Single-user local prototype; no multi-user accounts, sharing, or server-side sync in MVP.
- Notification source is GitHub; GitHub remains the system of record for read/done state in MVP (prototype mirrors, does not replace).
- Prototype stack preference (TypeScript / Bun / Next.js / shadcn-style UI, local embedded database) is a downstream planning constraint, not a user-facing requirement; success criteria above are stack-agnostic.
- Visual language follows the w5r-design guidelines (single primary action per region, quiet badges, list/detail layout); exact tokens resolved at plan time.
- Default digest rhythms are immediate for owned repos and weekly for watched/non-owned repos; user can change per repo.
- Week boundaries use the user's local timezone; monthly means calendar month from the setting date.
- "Back to notifications" means bidirectional round-tripping: each prototype item deep-links to its source, and returning restores the prior inbox filter and position.
- Initial inbox content for the prototype is local mocked seed data (decision Q3: Option A); write-back beyond mark-done/unread is out of MVP scope. Live GitHub read is a follow-up.
- Accessibility baseline: full keyboard operability for triage actions and visible focus states.
