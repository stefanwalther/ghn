# Feature Specification: Sidebar Update Badge with Inline Release Notes

**Feature Branch**: `008-show-new-version`

**Created**: 2026-11-14

**Status**: Draft

**Input**: User description: "Similar to the functionality you find in T3 Code, I'd like to show, at the bottom left, that a new version is available. I'd also like to show the user, without going to the GitHub directory, what's actually included in the new version."

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Notice a new version at the bottom left (Priority: P1)

A user working in the inbox glances at the sidebar footer (bottom left, next to the GitHub repo icon) and sees that a newer ghn version is out, e.g. running `v0.11.0` with `v0.12.0 available` plus an attention dot, without any popup interrupting the triage flow. Clicking the badge opens the update dialog; dismissing it keeps the badge so it can be revisited later.

**Why this priority**: This is the T3 Code parity request: passive, always-visible awareness exactly where the user already looks for the version. Without it users only discover updates by visiting GitHub.

**Independent Test**: Can be fully tested by stubbing `/api/version` to return a newer `latest` and confirming the footer shows both versions plus the indicator, that no dialog opens on its own, and that the dialog opens only on badge click. Delivers the value of update awareness even if inline notes are not yet shown.

**Acceptance Scenarios**:

1. **Given** the running version is older than the latest release, **When** the app loads, **Then** the bottom-left footer shows the running version, the latest version, and an update indicator, and no dialog opens automatically.
2. **Given** the update badge is visible, **When** the user clicks it, **Then** the update dialog opens anchored above the badge.
3. **Given** the update dialog is open, **When** the user closes it via Not now, X, Escape, or backdrop click, **Then** the dialog closes, focus returns to the badge, and the badge remains visible for reopening.
4. **Given** there is no newer version (or the check fails / is disabled / offline), **When** the app loads, **Then** only the plain running version shows and no badge or dialog appears.

---

### User Story 2 - Read what is included without opening GitHub (Priority: P1)

A user who opened the update dialog reads what the new version actually contains directly inside ghn: the release title, publish info, and the rendered release notes (features, fixes, breaking changes), instead of having to click out to github.com to decide whether to update now or later.

**Why this priority**: This is the second half of the request and the actual decision support. A version number alone does not tell the user whether the update matters to them.

**Independent Test**: Can be fully tested by stubbing `/api/version` with a release body and confirming the dialog renders the notes inline with readable formatting, plus an explicit empty state when the body is empty. Delivers the value of informed update decisions without a browser round-trip.

**Acceptance Scenarios**:

1. **Given** an update is available with a non-empty release body, **When** the dialog opens, **Then** it shows an inline "What's included" section with the release title/version, publish metadata when available, and the rendered notes body (headings, lists, links, code readable; links distinguishable).
2. **Given** the release body is empty or missing, **When** the dialog opens, **Then** it shows a clear empty state (e.g. "No release notes for this version.") instead of a blank area, and still shows the update commands and the outbound link.
3. **Given** the release body is very long, **When** the dialog opens, **Then** the notes area scrolls inside the dialog without breaking the dialog layout or hiding the update commands and the Not now / close actions.
4. **Given** the notes fail to load but the version check succeeded, **When** the dialog opens, **Then** it shows the version line, the update commands, and the "View release notes" fallback link plus a quiet "could not load notes" hint, not a spinner forever or an error crash.

---

### User Story 3 - Act on the update from inside the dialog (Priority: P2)

A developer running ghn from source or Docker sees the exact commands to update (and can copy them) plus a fallback link to the full GitHub release page, so acting on the notice takes one copy-paste instead of a docs hunt.

**Why this priority**: Preserves the existing useful behavior. Awareness (US1) plus understanding (US2) only convert to updates if the next step stays in the dialog.

**Independent Test**: Can be fully tested by opening the dialog and confirming both command blocks (source checkout, Docker) render with working Copy buttons and the outbound release link points at the latest tag. Delivers the value of one-place update action.

**Acceptance Scenarios**:

1. **Given** the dialog is open, **When** the user views the action area, **Then** both the source-checkout and Docker command blocks are shown with working Copy/Copied feedback.
2. **Given** the dialog is open, **When** the user follows the release link, **Then** it opens the correct `releases/tag/...` URL in a new tab with `noopener/noreferrer`.

---

### Edge Cases

- What happens when the release is a pre-release or draft? The `releases/latest` endpoint already excludes drafts/pre-releases by default; the dialog shows whatever stable release the check returns and MUST NOT add separate pre-release handling in v1.
- How does the system handle very long notes or many sections? Notes scroll inside the dialog; header (version line), command blocks, and Not now/close stay reachable; the dialog keeps its existing position above the bottom-left badge and its portal to `document.body`.
- What happens when notes contain raw HTML or script-like content? Rendering reuses the same sanitized Markdown treatment as the inbox drawer (headings, lists, links, code safe; scripts stripped), never `dangerouslySetInnerHTML` without sanitization.
- What happens when the version check succeeds but the notes payload is truncated or partially missing (no title, no date)? The dialog shows what exists and omits only the missing piece; version line, commands, and fallback link always render.
- What happens when the check is disabled (`GHN_DISABLE_UPDATE_CHECK`), offline, rate-limited, or returns non-200? The footer stays on the plain version, no badge, no dialog, no error toast; the failure stays quiet exactly as today.
- What happens when a cached check is in flight? Existing 6-hour in-memory TTL and 10s timeout behavior is unchanged; the footer never blocks first paint waiting for the check.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: System MUST always show the running version (`v<current>`) in the sidebar footer at the bottom left, next to the GitHub repository link.
- **FR-002**: System MUST, when a newer release exists, augment that same footer spot with the latest version text and a non-blocking attention indicator, visible without scrolling or interaction, and MUST NOT auto-open any dialog.
- **FR-003**: System MUST open the update dialog only on badge click, anchored above the bottom-left badge, portaled to `document.body`, with focus moved into the dialog and returned to the badge on close; Escape, X, backdrop click, and Not now MUST all close it.
- **FR-004**: Update dialog MUST show the `running vX / vY is out` version line and an inline "What's included / What's new" section rendering the release notes for the `latest` tag without requiring navigation to GitHub.
- **FR-005**: Release-notes section MUST show the release title/version identifier and SHOULD show publisher and publish date when the API provides them; missing fields are omitted, never faked.
- **FR-006**: Release-notes body MUST be rendered as sanitized Markdown reusing the inbox-drawer treatment (readable headings, lists, links, code; links distinguishable and safe); an empty/missing body MUST produce an explicit "No release notes" empty state.
- **FR-007**: Update dialog MUST preserve the existing action area: source-checkout command block and Docker command block each with Copy/Copied feedback, plus the "View release notes for vY" outbound link (`target _blank`, `noopener noreferrer`) as the full-page fallback.
- **FR-008**: When release notes cannot be retrieved but the version comparison succeeded, the dialog MUST still open with FR-004 version line, FR-007 commands and link, plus a quiet inline "could not load notes" hint; it MUST NOT hang on a loader or crash.
- **FR-009**: Version check MUST keep existing behavior: single `GET /api/version` on footer mount (`cache: no-store`), server-side `GET .../repos/stefanwalther/ghn/releases/latest` with 10s timeout, existing `gh` token reuse when available, 6-hour in-memory cache, `GHN_DISABLE_UPDATE_CHECK` and `GHN_RELEASES_API_BASE` overrides honored, and quiet fallback to `{ updateAvailable: false, latest: null }` on any failure.
- **FR-010**: Update dialog MUST keep existing accessibility and layout contracts: `role dialog`, `aria-modal true`, `aria-label "Update available"`, `data-testid "update-backdrop"`, `absolute bottom-16 left-4` positioning, and readable behavior on narrow viewports.

### Key Entities

- **UpdateInfo**: The version-check result the footer consumes. Attributes: running version (`current`), newest stable tag (`latest`, null when unknown), whether an update is available (`updateAvailable`), outbound release URL (`releaseUrl`), check timestamp (`checkedAt`), plus the inline-notes payload below.
- **ReleaseNotes**: What is included in the new version. Attributes: release title/name, tag/version identifier, publisher, publish date, notes body in Markdown, outbound release URL. Sourced from the same `releases/latest` response that already drives the badge; no new credentials or endpoints.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Users running an outdated install can notice the newer version from the bottom-left footer within 5 seconds of page load without navigating or opening anything, in 100% of connected checks that report an update.
- **SC-002**: Users can read what the new version includes (title plus notes body or explicit empty state) inside the update dialog without opening a browser, in 100% of connected dialog opens where the API returned a body.
- **SC-003**: The update dialog never opens on its own (0 auto-opens per session) and the badge persists after dismissal so the decision can be revisited.
- **SC-004**: Failed, offline, or disabled checks degrade to the plain running version with zero error surfaces and zero layout shift in the footer.

## Assumptions

- Users run ghn from a source checkout or Docker and update via `git pull` flows; the existing command blocks (`git pull` + `bun install` / `make up`) stay correct and are out of scope to change.
- The `releases/latest` response already carries everything the dialog needs (`tag_name`, `name`, `body`, `html_url`, `published_at`); no new GitHub endpoint, token scope, or background poller is introduced.
- Markdown rendering reuses the sanitized treatment already used for issue/PR/release previews in the inbox drawer; contributor lists, asset lists, checksums, and per-asset timestamps are supplementary and explicitly out of scope for the update dialog.
- T3 Code is the UX reference (passive bottom-left badge, click for inline notes, non-blocking) but ghn keeps its own visual language, copy, and dialog position; no new settings toggle is added in v1.
- Performance and offline expectations match the existing footer check (cached, timed out, quiet on failure); no new timing or freshness guarantees are introduced.
