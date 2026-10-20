# Feature Specification: Live GitHub Sync

**Feature Branch**: `002-live-github-sync`

**Created**: 2026-10-16

**Status**: Draft

**Input**: User description: "We have a working prototype now, now build a plan to make that real"

## User Scenarios & Testing *(mandatory)*

### User Story 1 - See live GitHub notifications in the same inbox (Priority: P1)

A developer who triaged mocked data in the prototype connects their GitHub account and sees their real notifications in the same unified inbox, with the same repository name, subject, reason, and age columns, the same repo/type/age/state filters, and the same bulk Done/Unread keyboard triage, without relearning the UI.

**Why this priority**: This is the definition of "real". If the inbox still shows seed data, nothing else matters. It must replace mock data as the default source while preserving the click-reduction proven in the prototype.

**Independent Test**: Can be fully tested by connecting an account with 20+ real notifications across 3+ repos, loading the inbox, and triaging 20 items to done/unread from the list view in under 5 minutes with at most half the clicks of the GitHub website flow. Delivers a live inbox that is as fast as the prototype.

**Acceptance Scenarios**:

1. **Given** a connected GitHub account with unread notifications, **When** the user opens the inbox, **Then** they see live items showing repository, subject, reason, and age without opening each thread.
2. **Given** a live inbox, **When** the user changes repository, type, age, or read/done filters, **Then** the list updates to matching live items with correct counts, same as prototype behavior.
3. **Given** a connected account, **When** new activity arrives on GitHub, **Then** a manual refresh brings those items into the inbox within one minute without losing filter or scroll position.

---

### User Story 2 - Triage writes back so GitHub stays in agreement (Priority: P1)

A developer who marks items done, unread, or read in the inbox trusts that GitHub reflects the same state, so returning to the GitHub website does not resurface items already triaged.

**Why this priority**: Without write-back the local inbox diverges from GitHub on first use and the user must triage twice. This is co-equal with live read for a usable real tool.

**Independent Test**: Can be fully tested by marking 5 live items done, 2 unread, and 1 read in the inbox, then checking the GitHub website shows the matching read/done state within minutes, and reloading the inbox does not resurrect done items. Delivers single-triage confidence.

**Acceptance Scenarios**:

1. **Given** live items in the inbox, **When** the user marks one or many items done in a single action, **Then** those items leave the inbox and stay gone after the next sync from GitHub.
2. **Given** a done item, **When** the user marks it unread, **Then** it re-enters the correct inbox section on next load based on its repository rhythm and due state.
3. **Given** a write-back failure (offline or permission error), **When** the user attempts a triage action, **Then** the inbox shows a non-blocking error, keeps the prior state visible, and offers retry without data loss.

---

### User Story 3 - Noisy repos stay quiet on live data (Priority: P2)

A developer who set weekly, every-2-weeks, or monthly rhythms in the prototype keeps those settings on live data, and newly discovered watched repositories get a calm default instead of flooding the main flow.

**Why this priority**: Digest behavior is the second core value from the prototype. It must survive the switch to live data, including repos the prototype seed never contained.

**Independent Test**: Can be fully tested by carrying over existing rhythm settings to live data, discovering 2+ new watched repos with a sensible default rhythm, and verifying non-due items sit in the dimmed collapsed section with pending counts until due, then promote with a due indicator. Delivers the same calm inbox on real volume.

**Acceptance Scenarios**:

1. **Given** existing per-repository rhythm settings from the prototype, **When** the first live sync runs, **Then** those rhythms, pending counts, and next due dates carry over unchanged.
2. **Given** a newly discovered watched repository with no explicit rhythm, **When** live items arrive for it, **Then** it appears with a quiet default rhythm and its items stay collapsed until due, with rhythm, next due date, and pending count visible.
3. **Given** a digest group that becomes due, **When** the user opens the inbox on or after the due date, **Then** its items promote into the main flow with a visible due indicator.

---

### User Story 4 - Stay oriented and resilient when GitHub is slow or unreachable (Priority: P3)

A developer whose network drops, whose access token expires, or who hits API limits still reads the last synced inbox, understands what is stale, and reconnects or retries with one clear path.

**Why this priority**: A live dependency introduces failure modes the mock prototype never had. Trust requires explicit stale, error, and re-auth states rather than silent stale data.

**Independent Test**: Can be fully tested by revoking access, throttling the network, and simulating a rate limit, then verifying each case shows a distinct disconnected/stale/limited message with a reconnect or retry action while the cached inbox stays readable. Delivers confidence to rely on the tool daily.

**Acceptance Scenarios**:

1. **Given** a previously synced inbox, **When** GitHub is unreachable during refresh, **Then** the cached inbox stays readable with a visible stale indicator, last-synced time, and retry action.
2. **Given** expired or revoked access, **When** the user opens the inbox or triggers sync, **Then** they see a distinct disconnected state with a reconnect path, and the inbox never presents stale items as fresh.
3. **Given** an opened source thread, **When** the user returns, **Then** they land on the prior inbox filter and position, same round-trip guarantee as the prototype.

---

### Edge Cases

- What happens when the same notification updates on GitHub between two syncs (new comment, new review)? The inbox reflects the latest state without duplicating the item or losing local digest placement.
- How does the system handle zero live notifications? Show the same explicit empty state as the prototype, not a blank page, with last-synced time.
- What happens when a repository is renamed, deleted, or access is lost? Its cached items are marked clearly and do not block the rest of the inbox.
- How are timezone and week boundaries handled for digest due dates on live data? Same local-time rule as the prototype with a displayed next due date.
- What happens when the user changes a live repo from monthly to immediate? Pending items become visible in the main flow on next inbox load.
- What happens when local triage and remote GitHub state conflict (marked done locally but unread remotely)? The write-back result wins after sync; conflicts never silently resurrect done items without explanation.
- What happens when live volume is large (hundreds of notifications)? The inbox still loads the first screen quickly with progressive or paged loading rather than blocking.
- What happens to the prototype seed data and dev-only reseed action? Seed data is never mixed with live data, and reseed is unavailable in live mode.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: System MUST present live GitHub notifications in the existing unified inbox showing repository, subject, reason, and age for each item without requiring per-item navigation, preserving prototype filters and bulk triage interactions.
- **FR-002**: System MUST authenticate the single user to GitHub by reusing the existing local `gh` CLI session, persisting only the minimum needed to sync without re-authenticating on every restart, and MUST show a distinct disconnected state with a reconnect path when auth is missing or expired.
- **FR-003**: System MUST sync live notification state on open and on manual refresh, display last-synced time on every inbox load, and MUST keep the cached inbox readable with a stale indicator when GitHub is unreachable.
- **FR-004**: System MUST map Done in the inbox to GitHub's Done state, and MUST propagate read/unread marks so the GitHub website agrees within minutes and a subsequent sync does not resurrect triaged items.
- **FR-005**: System MUST surface sync failures (network error, rate limit, permission error) as non-blocking messages with retry, keeping cached data visible and never presenting stale items as fresh.
- **FR-006**: Users MUST be able to set per-repository rhythm of immediate, weekly, every-2-weeks, or monthly plus temporary snooze, carried over unchanged from prototype settings, applied identically to live items.
- **FR-007**: System MUST keep non-due live digest items out of the main triage flow in the existing dimmed collapsed section with per-repository pending count, rhythm, and next due date.
- **FR-008**: System MUST promote a live digest group into the main flow when due with a visible due indicator, same as prototype.
- **FR-009**: System MUST auto-discover repositories appearing in live sync and assign a quiet default rhythm for watched/non-owned repos while keeping owned repos immediate, with the assignment visible and changeable in repository settings.
- **FR-010**: System MUST preserve inbox context (filter and position) across refresh, sync, and source-thread round-trips, with a single-click return path to the prior inbox state.
- **FR-011**: System MUST NOT mix prototype seed data with live data in the same view, MUST remove or gate the dev-only reseed action in live mode, and MUST provide a defined migration that carries prototype digest settings forward without carrying seed notifications.
- **FR-012**: System MUST remain a single-user local app, with background or periodic sync only if it preserves the single-user offline-readable guarantee.
- **FR-013**: Users MUST be able to open the source thread for any live notification from the list and return to the same inbox state with one back action.
- **FR-014**: System MUST retain prototype keyboard triage, bulk Done/Unread, light/dark themes, and accessibility baseline (full keyboard operability, visible focus, no color-only signaling) on live data.

### Key Entities

- **Live Notification**: A GitHub update item mirrored locally (stable GitHub thread identifier, repository, subject, reason, last-updated time, read/done state, source link). It is the same inbox row as the prototype but backed by GitHub as system of record.
- **Repository**: A GitHub repository appearing in sync (full name, owned vs. watched, digest rhythm, pending count, next due date, snooze state). Includes newly discovered repos from live data.
- **Digest Setting**: Per-repository cadence (immediate, weekly, every-2-weeks, monthly) plus computed next due date, carried over from the prototype and applied to live items.
- **Sync State**: Last successful sync time, per-refresh outcome (fresh, stale, rate-limited, disconnected), and pending write-back queue depth, shown in the inbox.
- **Connection**: The user's GitHub authorization presence (connected vs. disconnected, expiry or permission failure), without exposing secret values in the UI.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Users see their live GitHub notifications in the inbox within 1 minute of connecting their account, with repository, subject, reason, and age visible without opening threads.
- **SC-002**: Users triage 20 live notifications to done/unread in under 5 minutes from the list view with at most half the clicks of the equivalent GitHub website flow.
- **SC-003**: Items marked done in the inbox stay done after the next sync and agree with the GitHub website within 5 minutes in 95% of trials.
- **SC-004**: Non-due digest items stay out of the main flow in 100% of seeded live-data test runs, remaining collapsed until due, while due digests promote within one day of due date.
- **SC-005**: 90% of first-time users can connect, trigger a refresh, and state when a weekly repo will next appear, without guidance.
- **SC-006**: When GitHub is unreachable or access expires, 100% of trials show a distinct stale or disconnected state with last-synced time and a retry or reconnect path, never silent stale-as-fresh.

## Assumptions

- Single-user local prototype behavior (one inbox, bulk triage, digest math, keyboard shortcuts, w5r-design list/detail layout) carries over unchanged unless live data forces a stated exception.
- GitHub remains the system of record for notification read/done state; the local store is a mirror plus digest placement, not a fork.
- Week boundaries use the user's local timezone; monthly means one calendar month from last promotion, same as prototype.
- Default rhythms stay immediate for owned repos and weekly for watched/non-owned repos, including newly discovered repos.
- Prototype stack and local database constraints are downstream planning concerns, not user-facing requirements; success criteria above are stack-agnostic.
- Seed data shape (10 repos, 200 items) remains available only as a dev fixture behind an explicit non-live mode; it never appears alongside live data.
- Accessibility baseline from prototype holds: full keyboard operability, visible focus, no color-only read/unread signaling.
