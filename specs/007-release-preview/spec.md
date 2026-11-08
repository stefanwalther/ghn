# Feature Specification: Release Preview in Inbox Drawer

**Feature Branch**: `007-release-preview`

**Created**: 2026-11-08

**Status**: Draft

**Input**: User description: "For releases, I'd like to see a preview in ghn, too, without having to go to the online repo"

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Read release notes without leaving ghn (Priority: P1)

A user selects a release notification (e.g. "T3 Code Nightly 0.1.8-nightly.20261107.4301") in the inbox and reads the full release notes directly in the preview drawer, exactly as they today read issues and pull requests, instead of seeing "No preview for releases" and having to open GitHub in a browser.

**Why this priority**: This is the core complaint in the request. The drawer currently blocks release triage ("The preview drawer renders issues, pull requests, and security alerts. For everything else, continue on GitHub."). Reading the notes inline restores the triage flow: read, decide, Done/Unsubscribe.

**Independent Test**: Can be fully tested by selecting a release thread and confirming the release title, version/tag reference, and notes body are visible in the drawer without opening a browser, and delivers the value of triaging releases inside ghn.

**Acceptance Scenarios**:

1. **Given** an unread release notification is selected, **When** the preview drawer opens, **Then** the drawer shows the release title, version/tag identifier, publication metadata (author and date), and the rendered release notes body.
2. **Given** a release with an empty notes body, **When** the preview renders, **Then** the drawer shows a clear "No description" empty state instead of a blank area or an error.
3. **Given** the release notes contain formatted text (headings, lists, links, code), **When** the preview renders, **Then** the formatting is readable in the drawer and links are distinguishable.

---

### User Story 2 - Judge release relevance from version metadata (Priority: P2)

A user triaging nightly/beta releases sees at a glance whether the release is a pre-release or draft, which tag and commit it points at, and who published it and when, so they can decide whether to install, skip, or unsubscribe.

**Why this priority**: The GitHub release page leads with this metadata (Pre-release badge, "github-actions released this yesterday", tag `v0.1.8-nightly...`, commit `4cb6945` with verification state). Without it the notes lack context.

**Independent Test**: Can be fully tested by opening release notifications for a pre-release, a draft, and a final release and confirming the correct badges and tag/commit/author/date lines appear for each.

**Acceptance Scenarios**:

1. **Given** a published pre-release, **When** the preview renders, **Then** the drawer marks it as a pre-release and shows the tag, the target commit reference, the publisher, and the publish date.
2. **Given** a draft release notification, **When** the preview renders, **Then** the drawer marks it as a draft.
3. **Given** a final (non-prerelease, non-draft) release, **When** the preview renders, **Then** no pre-release or draft badge is shown.

---

### User Story 3 - Inspect release assets without opening GitHub (Priority: P3)

A user checking a nightly release expands an Assets section in the drawer, sees each downloadable file with its name and size, and follows a link to download it, instead of going to the online repo to find the file list.

**Why this priority**: The reference screenshot shows an Assets section with 30 files (e.g. `nightly-mac.yml`, 786 Bytes, yesterday). Asset awareness is secondary to reading the notes but is part of "without having to go to the online repo".

**Independent Test**: Can be fully tested by opening a release that has assets and confirming the count, names, sizes, and working download links render in the drawer.

**Acceptance Scenarios**:

1. **Given** a release with assets, **When** the preview renders, **Then** the drawer shows a collapsed Assets section with the asset count; expanding it reveals each asset's file name, its file size, and a link to fetch it.
2. **Given** a release with no assets, **When** the preview renders, **Then** the Assets section is hidden and the notes preview still renders normally.
3. **Given** a release with many assets (e.g. 30), **When** the preview renders, **Then** the full list remains reachable by scrolling inside the drawer without breaking the drawer layout or hiding the triage buttons.

---

### Edge Cases

- What happens when the release was deleted or is no longer visible to the user (private repo, revoked access)? The drawer shows a clear unavailable state with the existing "Open in new window" fallback instead of a spinner or blank panel.
- How does the preview handle very long notes or very long asset lists? Content scrolls inside the drawer; header and triage buttons stay reachable.
- How are release bodies that are plain text versus formatted text handled? Both render readably; plain text never appears as raw markup.
- What happens when asset metadata (size, download link) is missing for an entry? The entry still shows its file name and omits only the missing piece.
- What happens when the release data cannot be loaded (offline, rate-limited, server error)? The drawer shows the same kind of unavailable/loading treatment as issue and pull request previews, not the old "No preview for releases" message.
- How do contributor lists behave? Contributors are supplementary and MUST NOT block the notes and assets preview if contributor data is unavailable.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: System MUST render an inline preview for notifications whose type is Release in the same preview drawer that renders issues, pull requests, and security alerts.
- **FR-002**: Release preview MUST show the release title, the version/tag identifier, the publisher name, and the publish date/time.
- **FR-003**: Release preview MUST clearly label pre-release releases and draft releases; final releases MUST show neither label.
- **FR-004**: Release preview MUST show the target commit reference (short hash) when the release points at one, alongside the tag.
- **FR-005**: Release preview MUST render the release notes body readably, including common formatting (headings, lists, links, code), and MUST show an explicit empty state when the body is empty.
- **FR-006**: Release preview MUST list release assets when present behind a collapsed Assets section showing the total asset count; expanding the section reveals each asset's file name, file size, and a working download/access link.
- **FR-007**: Release preview MUST hide the Assets section entirely when the release has no assets.
- **FR-008**: When release details cannot be retrieved (deleted release, no access, network or rate-limit failure), system MUST show a clear unavailable state with a link to continue on GitHub, and MUST NOT show the legacy "No preview for releases" message for releases.
- **FR-009**: Release preview MUST preserve the existing drawer behavior: repository name, subject title with source link, read/unread state with timestamp, Done / Mark as read-unread / Unsubscribe triage actions, prev/next navigation, and close.
- **FR-010**: Release preview MUST respect existing visibility rules: sync scoping, read/unread and done filtering, and per-user access remain unchanged; a user MUST NOT see release content they could not see on GitHub.

### Key Entities

- **Release**: A published (or draft) versioned snapshot the user was notified about. Attributes: title, tag/version identifier, pre-release flag, draft flag, publisher, publish date, target commit reference, notes body.
- **Release Asset**: A downloadable file attached to a release. Attributes: file name, file size, download location, upload/publish date.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Users can read the full release notes (title, version, author/date, body) for a release notification without opening a browser in 100% of connected preview attempts.
- **SC-002**: Users can correctly identify whether a release is a pre-release, draft, or final release from the drawer preview in under 10 seconds.
- **SC-003**: For releases with assets, users can find a named asset file and reach its download from inside ghn without opening the online repo.
- **SC-004**: Release triage (Done / Mark as read / Unsubscribe) from the drawer works for release threads at the same success rate as for issue and pull request threads, with no increase in "must open GitHub to decide" reports.
- **SC-005**: Failed release loads (deleted release, no access, offline) show a clear unavailable state with a working continue-on-GitHub link instead of a hang, blank panel, or misleading message.

## Assumptions

- Users triage release notifications the same way they triage issues and pull requests: read the preview, then Done, Mark as read, or Unsubscribe.
- Release detail data (title, tag, publisher, date, notes, assets) is retrievable at view time through the user's existing GitHub login; no new credentials or tokens are introduced.
- Existing drawer layout patterns (header, badges, scrollable body, "Open in new window" fallback) are reused; no new navigation surface is needed.
- Contributor avatars/names, checksums (sha256), and per-asset upload timestamps seen on the GitHub web page are supplementary and may be omitted or simplified in v1 without blocking the notes-plus-assets preview.
- Markdown rendering reuses the same readable treatment already used for issue and pull request bodies.
- Performance and offline expectations match the existing issue/pull request previews; no new guarantees are introduced.
