# Feature Specification: Rate Limits View

**Feature Branch**: `003-rate-limits`

**Created**: 2026-10-17

**Status**: Draft

**Input**: User description: "We should have a menu item "Rate limits", basically showing what we have in stefanwalther/rate-limits so that people can check the rate-limits within ghn."

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Check GitHub rate limits without leaving ghn (Priority: P1)

A person triaging notifications in ghn opens a "Rate limits" menu item and sees their current GitHub API usage for the buckets ghn itself consumes, so they can tell at a glance whether sync or refresh failures are caused by an exhausted quota.

**Why this priority**: This is the core of the request. If the user cannot see quota state inside ghn, they must leave the app or guess why sync is failing. Everything else is presentation.

**Independent Test**: Can be fully tested by opening the Rate limits view on a connected account and confirming it shows current used/remaining figures for each quota bucket with a refresh action, without navigating to GitHub or another tool. Delivers quota visibility where the work happens.

**Acceptance Scenarios**:

1. **Given** a connected GitHub account, **When** the user opens "Rate limits", **Then** they see one card per quota bucket (core REST, GraphQL, search) showing used, remaining, and percent consumed.
2. **Given** the Rate limits view, **When** the user triggers refresh, **Then** the figures update to the latest values with a visible fetch time.
3. **Given** a disconnected or expired authorization, **When** the user opens "Rate limits", **Then** they see a distinct disconnected state with a reconnect path instead of stale figures presented as fresh.

---

### User Story 2 - Know when quota recovers (Priority: P2)

A person who hit a sync failure or a rate-limited warning checks when each bucket resets, so they know whether to wait or to keep working from the cached inbox.

**Why this priority**: Raw percentages without reset times leave the user guessing. Reset visibility turns a dead end into a plan.

**Independent Test**: Can be fully tested by viewing each bucket card and confirming a reset time or countdown is shown alongside the usage figure. Delivers an actionable recovery estimate.

**Acceptance Scenarios**:

1. **Given** current bucket figures, **When** the user reads a bucket card, **Then** they see when that bucket resets (clock time or countdown).
2. **Given** an exhausted bucket, **When** the user views it, **Then** it is visibly flagged as rate-limited rather than shown as a normal reading.

---

### User Story 3 - Trust the reference numbers (Priority: P3)

A person unfamiliar with GitHub quotas reads the documented limits next to their live usage, so they understand what "5,000 per hour" means for each bucket without opening external docs.

**Why this priority**: Live numbers without context are hard to interpret. A short reference turns the view into a self-contained explainer.

**Independent Test**: Can be fully tested by reading the documented-limits section and matching each live bucket to its documented allowance and window. Delivers a view that needs no external documentation.

**Acceptance Scenarios**:

1. **Given** the Rate limits view, **When** the user reads the reference section, **Then** each live bucket maps to a documented allowance (core, GraphQL, search) with its window.
2. **Given** the reference section, **When** the user follows the docs link, **Then** they land on the authoritative GitHub rate-limit documentation.

### Edge Cases

- What happens when GitHub is unreachable during a refresh? The view keeps the last readable state where possible, shows a non-blocking error with retry, and never presents unknown figures as current.
- What happens when only some buckets return figures? Buckets with data render normally; buckets without data show a per-bucket notice instead of blocking the whole view.
- What happens when a refresh is triggered twice in quick succession? The view handles it without duplicated or frozen state and the latest result wins.
- What happens when authorization is revoked mid-session? The view switches to the disconnected state with a reconnect path on the next load or refresh.
- What happens when a user has never synced? The view still loads and reports authorization state; it does not depend on inbox sync history or seed data.
- What happens at 100% exhaustion? The bucket is flagged rate-limited and the reset estimate is the most prominent figure on that card.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: System MUST provide a "Rate limits" entry in the main navigation that opens a dedicated rate-limits view.
- **FR-002**: System MUST show current usage per GitHub quota bucket ghn consumes (core REST, GraphQL, search), each with used count, remaining count, and percent consumed.
- **FR-003**: System MUST show when each bucket resets (clock time or countdown) alongside its usage figure.
- **FR-004**: System MUST visibly flag any bucket with zero remaining as rate-limited, distinguishable without relying on color alone.
- **FR-005**: System MUST provide a manual refresh action on the rate-limits view and show when the figures were last fetched.
- **FR-006**: System MUST show a distinct disconnected state with a reconnect path when GitHub authorization is missing, expired, or rejected, and MUST NOT present figures as current in that state.
- **FR-007**: System MUST show a non-blocking error with retry when GitHub is unreachable, keeping any previously loaded figures readable and clearly marked as not fresh.
- **FR-008**: System MUST render buckets with data independently, so one failed bucket shows a per-bucket notice without hiding the other buckets.
- **FR-009**: System MUST show a documented-limits reference mapping each live bucket to its allowance and window, with a link to the authoritative GitHub rate-limit documentation.
- **FR-010**: System MUST state the cost of checking (one request per bucket per refresh) in the view so users understand that refreshing consumes quota.
- **FR-011**: System MUST NOT mix prototype or demo figures with live figures; any fallback state MUST be labeled as unavailable rather than shown as real numbers.

### Key Entities

- **Rate Limit Bucket**: One GitHub quota family ghn consumes (core REST, GraphQL, search), with used count, remaining count, percent consumed, reset point, and exhausted vs. available state.
- **Refresh**: A user-triggered re-read of current bucket figures, with fetch time and per-bucket outcome; each refresh consumes a small amount of the quota it reports on.
- **Documented Limit**: The published allowance and window for a bucket (e.g., requests per hour), shown as reference next to live usage with a link to the authoritative documentation.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Users open the Rate limits view and read current used/remaining/reset figures for all three buckets in under 30 seconds on a connected account.
- **SC-002**: When a sync fails due to exhausted quota, 90% of users can identify which bucket is exhausted and when it resets from the Rate limits view without leaving ghn.
- **SC-003**: 100% of trials with revoked authorization show the disconnected state with a reconnect path and never show stale figures as current.
- **SC-004**: 100% of trials with one failing bucket still show live figures for the remaining buckets with a per-bucket notice for the failed one.
- **SC-005**: Users trigger a refresh and see updated figures with a new fetch time in under 15 seconds on a normal connection.

## Assumptions

- The view covers the GitHub quota buckets ghn consumes (core REST, GraphQL, search); other provider quotas from the rate-limits prototype are out of scope for this feature.
- GitHub remains the system of record for quota figures; the view reports what GitHub reports and does not estimate or project usage.
- The existing single-user authorization is reused; no new sign-in flow is introduced.
- Usage figures reflect the whole account across all tokens and apps, not ghn's share alone; the documented-limits reference explains this.
- Accessibility baseline holds: full keyboard operability, visible focus, no color-only signaling for the rate-limited state.
