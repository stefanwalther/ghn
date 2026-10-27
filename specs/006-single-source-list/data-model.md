# Data Model: Single-Source Inbox List

No new tables. One additive repositories field. Everything else reuses existing entities with tightened state rules.

## Shared inbox list

- What it is: the one cached copy of the filtered list every inbox view reads from.
- Fields: rows with id, repository, subject, reason, age, read flag, done flag, local unread flag, source link; placement derived per row (main versus quiet); freshness plus background-refreshing flag; error state with retry.
- Rules: exactly one owner. Optimistic changes apply first with the previous list held for rollback. Only the latest filter response determines visible rows.

## Optimistic change

- What it is: an immediately applied list change with rollback.
- Fields: action (done, unsubscribe, read, unread), target ids, previous list snapshot, busy flag until settled, per-row syncing flags.
- Rules: done and unsubscribe remove rows in unread and done views, mark in place in the all view. Unread in the done view removes restored rows. Failure restores the snapshot with a message and re-enables controls.

## Queued write

- What it is: a remote push that has not succeeded yet.
- Fields: thread id, action, attempts, last error, created time.
- Rules: survives sync cycles without revert. Rows stay hidden with a queued indication until the push succeeds. Unread deletes superseded retries for its ids.

## Revived row

- What it is: a finished item explicitly brought back by the user.
- Fields: done cleared, read cleared, local unread set.
- Rules: survives full sync reconciliation. Never re-marked done by sync. Local-only by design since no remote unread write exists.

## Filter view

- What it is: the URL-backed unread, all or done selection.
- Rules: unread hides done rows, all keeps them with done state, done shows only done rows. Survives reload, share and navigation.

## Repo placement

- What it is: per-repo rhythm, mute-until timestamp, pin flag, computed due state.
- Fields: rhythm (immediate, weekly, biweekly, monthly), snoozed-until timestamp or null, pinned flag default unpinned, next due date, pending count.
- Rules: mute always beats rhythm. Rhythm and mute move rows only, never flip done state. Pin groups the repos page only and never touches counts, placement or sidebar.
- State transitions: promote sets immediate and surfaces quiet rows at once. Snooze expiry or unsnooze returns the repo to rhythm placement. Pin and unpin move the repo between sections with no other change.
