# Feature Specification: Bulk Triage Local-First

**Feature Branch**: `006-bulk-triage-local-first`

**Created**: 2026-10-27

**Status**: Implemented

**Input**: Marking a repository with hundreds of items done held the request
open for seconds while hundreds of GitHub calls drained, and a global busy
flag blocked every other triage action meanwhile. The repo menu also showed
Done and Read as identical twins, so a mis-tap was easy and its scope
(visible plus hidden quiet items) was invisible.

## The contract

One shared threshold, `BULK_CONFIRM_THRESHOLD` (25, in `lib/bulk.ts`),
drives two behaviors:

1. **Small bulks stay strongly consistent.** At or under 25 ids the bulk
   route awaits the remote GitHub calls on the request and reports exact
   partial failures (`remote: "partial"`). Existing callers and tests rely
   on this.
2. **Large bulks go local-first.** Over 25 ids the route applies the local
   DB update, replaces the threads' queue rows in one chunked insert, and
   responds in milliseconds with `remote: "background"`. A background drain
   (slower concurrency, `after()` when available, detached otherwise) syncs
   to GitHub; failures stay queued for the `/api/sync` retry net. The drain
   must never throw past the already-sent response.

SQLite variable caps are handled by chunking (`QUEUE_CHUNK_SIZE`, 200) on
every local update, queue delete, and queue insert path, so 1000+ id lists
never blow the statement limit.

A queued row is the user's current intent. Mark-unread withdraws rows, and
the background drain (`drainWritebacks` in `lib/queue.ts`) re-checks the
row before each GitHub call, so a withdrawn intent never fires its
DELETE/PATCH afterwards. Covered by the `drainWritebacks` suite in
`tests/unit/queue.test.ts`.

## User Scenarios & Testing

### User Story 1 - Large Done returns instantly (Priority: P1)

A developer marks a 1000-item repository done and immediately triages the
next repository without waiting.

**Independent Test**: Bulk 30 ids against the GitHub stand-in and assert
the response carries `remote: "background"` with local rows hidden and no
GitHub traffic on the request; then poll until the queue drains and 30
DELETEs land. Covers the split in
`tests/integration/bulk-route.test.ts` ("large-batch background path").

**Acceptance Scenarios**:

1. **Given** a bulk over the threshold, **When** the route responds, **Then**
   local state is already applied and the queue holds one row per id.
2. **Given** a valid credential, **When** the background drain runs, **Then**
   every queued row reaches GitHub and the queue empties.
3. **Given** no credential, **When** a large bulk runs, **Then** rows stay
   queued for the next sync instead of being lost.

### User Story 2 - Destructive bulk asks first (Priority: P1)

A developer picks Mark all as done on a repository with more than 25
pending items and gets a confirm dialog naming the total with its visible
plus quiet split before anything happens.

**Independent Test**: Page test "asks to confirm before marking a large
repo done" in `tests/component/inbox-page.test.tsx`: no bulk call fires
until confirmation, and the resulting notice carries the split.

**Acceptance Scenarios**:

1. **Given** a repo total over the threshold, **When** Mark all as done is
   chosen, **Then** a confirm dialog appears and no request fires.
2. **Given** confirmation, **When** the bulk resolves as background, **Then**
   the notice reads as a muted status with the visible/quiet split, never
   as a red alert with a bare total.
3. **Given** more than the threshold rows selected, **When** Done is picked
   in the bulk bar, **Then** the same confirm gate applies before the
   request fires (page test "asks to confirm before marking a large
   selection done").

### User Story 3 - One syncing repo never blocks the others (Priority: P1)

A developer starts Done on repo A and, while it syncs, opens repo B's menu
and triages there.

**Independent Test**: Page test "a second repo stays usable while the
first syncs" plus the sidebar wiring test "holds only the pending repo
while it syncs". Per-repo pending (`pendingRepos` in `app/page.tsx`,
`busyRepoIds` on the sidebar/digest) replaces the old global guard.

**Acceptance Scenarios**:

1. **Given** repo A syncing, **When** repo B's menu opens, **Then** its Done
   entry is enabled.
2. **Given** repo A syncing, **When** repo A's menu opens, **Then** its Done
   entry is disabled until the sync settles.

### User Story 4 - The menu cannot be misread (Priority: P2)

Done is the primary Triage entry with its consequence ("Removes from
inbox" plus the quiet split); Read sits below Snooze as a dimmed secondary
("Stays in list"). No redundant native `title` duplicates a visible label.

**Independent Test**: Menu order, hints, breakdown, and keyboard-only
trigger refocus in `tests/component/components.test.tsx`
(`RepoSnoozeMenu`, `FilterSidebar`, `DigestSection` suites).

**Acceptance Scenarios**:

1. **Given** the repo menu, **When** it opens, **Then** order is Done,
   Snooze, Read, Open repo, Copy repo link.
2. **Given** a pointer choice, **When** the menu closes, **Then** focus does
   not return to the trigger; keyboard choices still refocus it.

## Out of scope

Time-travel Undo for repo-wide Done (a GitHub DELETE cannot be un-sent,
and quiet ids are not all client-side). Restore stays via the Done view
plus failure rollback.
