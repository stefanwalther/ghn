# Contracts: Single-Source Inbox List

Behavior contracts the implementation MUST honor. Internal route shapes change only where noted.

## Notifications view contract

- Unread view hides done rows. All view keeps done rows with done state. Done view shows only done rows.
- Optimistic done removes rows in the unread view, keeps rows unchanged in the done view, and marks in place in the all view.
- Failure restores the previous list with a message and usable controls.
- A pre-commit refresh response never restores triaged rows.

## Sync precedence contract

- Queued writes and explicit revives survive sync cycles. Content may refresh; done and read never flip for dirty rows.
- Missing threads on full sync become done, except explicitly revived rows which stay revived.
- Changed threads refresh. Read follows remote for clean rows.
- Route shape change: none. Existing sync behavior plus the revive exclusion.

## Repositories pin contract (route shape change)

- GET repositories rows gain a pinned flag, default unpinned for existing rows.
- PATCH repository accepts a pinned boolean alongside rhythm and snooze fields, validates its type, and returns the updated row.
- Unknown repository id returns not-found. Nothing else about the route changes.
- UI contract: pinned section above Repositories, both sections searchable, empty pinned section hidden, no count or placement changes.
