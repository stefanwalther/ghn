# Item lifecycle: done vs settled vs rhythm

Backbone of the inbox. If this breaks, triage cannot be trusted. Any change
to the files listed here must keep the guarantees below green.

Scope: local SQLite plus GitHub threads, inbox list only. Palette, repos page
and settings reuse the same states but do not redefine them.

## Definitions

- Mark done: user intent to finish. Server sets `isDone=1` at once in
  `app/api/notifications/bulk/route.ts`, then attempts `markThreadDone` on
  GitHub. The row leaves the unread main flow and appears under the done
  filter. Reversible only through unread.
- UI settled: a TanStack mutation reached `onSettled` in `lib/queries.ts`.
  Cache is invalidated, refetch is scheduled, busy flags in `app/page.tsx`
  drain. Says nothing about GitHub.
- Remote settled: the writeback queue in `lib/queue.ts` drained against
  GitHub. Until then the row stays hidden locally with an explicit queued
  label. Offline done can stay in this state by design.
- Rhythm: per repo cadence in `lib/digest.ts`. Immediate, weekly, biweekly,
  monthly plus `snoozedUntil`, `nextDueAt`, `lastPromotedAt`. Controls
  placement only, computed in `app/api/notifications/route.ts`. Never marks
  anything done.
- Promote: set one repo to immediate in `app/page.tsx`. Quiet items surface
  now. Done state untouched.
- Snooze: hide a repo until a timestamp without changing rhythm. This is
  the only repo mute word. Settled never means repo mute.
- Read: marked read locally and on GitHub. Server sets `isRead=1` locally
  in `app/api/notifications/bulk/route.ts`, then calls `markThreadRead`
  (`PATCH`) in `lib/github.ts:281`, queued on failure. Row stays visible.
- Unread: explicit restore, local only. Decision B tested GitHub parity
  and it failed. Live probe 2026-10-27: per thread PATCH with
  `read:false` returns 205 but leaves `unread:false`, the body is ignored.
  No unread write exists in REST. Server sets `isDone=0, localUnread=1`
  and clears queued retries for those ids. GitHub keeps its last read or
  done state, so github.com may still show read while ghn shows unread.
- Pin: repo level, local only. A pinned repo renders in the
  `Pinned Repositories` section of `app/repos/page.tsx` instead of the
  `Repositories` section. Pin changes grouping only. It never changes done,
  read, rhythm, snooze, counts, or main vs quiet placement in the inbox.
  Inbox sidebar is unchanged in v1.

Rule of thumb: done changes row state, rhythm changes row placement,
settled names which layer confirmed.

## Principles

- P1: optimistic UI updates are good. Every triage action applies locally
  at once, rolls back the prior list with a message on failure, confirms
  via refetch on success, and keeps controls disabled only until settled.
  No action leaves the list or the buttons stuck.
- P2: dirty local beats sync, clean local follows GitHub. Dirty means a
  queued write is pending or `localUnread=1`. Sync refreshes content but
  never flips done or read for dirty rows.
- P3: in doubt, the GitHub notifications UI wins. Clean rows converge to
  what github.com shows on next sync. Missing threads go done on full
  sync, changed threads refresh, read follows remote. Only queued writes
  and explicit revives override, and only until pushed.

## Guarantees

- G1: done rows never return from a stale fetch. A notifications GET started
  before the bulk POST commits must not overwrite an optimistic removal.
  Current risk is `app/page.tsx` copying `serverList` into local `items`
  without a generation guard.
- G2: done rows stay done across sync. `lib/sync.ts` skips rows with
  `isDone=1` on upsert. New GitHub activity on a done thread does not
  reopen it unless unread is used. If reopen on new activity is ever wanted,
  it needs an explicit product decision.
- G3: UI settled and remote settled stay distinct in copy. Busy means
  mutations in flight. Queued means hidden locally while GitHub retry is
  pending. One must never imply the other.
- G4: rhythm never changes done state. Changing rhythm or snooze only moves
  rows between main flow and the collapsed quiet section. Repo wide done
  clears hidden pending items too, matching
  `app/api/notifications/bulk/route.ts` repo branch.
- G5: unread always wins over queued work. Unread clears pending retries
  for those ids.
- G6: pin never changes notification state. Pin, unpin, and pinned order
  leave `isDone`, `isRead`, rhythm, snooze, pending counts, and main vs
  quiet placement untouched on every filter.
- G7: the all view keeps done rows visible. Optimistic done marks them in
  place and never removes them, matching the confirmed server state.

## State transitions

- unread main flow -> done: optimistic remove from list plus cache,
  `isDone=1` locally, GitHub attempt, queue on failure.
- done -> unread: `isDone=0, localUnread=1`, queued retries for those ids
  deleted, row returns to unread placement per current rhythm.
- quiet collapsed -> main flow: rhythm set to immediate, snooze expiry, or
  due date reached. No state write on the notification itself.
- any -> done via repo wide action: server resolves all pending ids for the
  repo including quiet rows, client removes main flow rows and drops the
  collapsed group on confirm.

## Non-regression

These checks must exist and stay green:

- Slow GET plus bulk done does not restore rows.
- Repo wide done on a quiet repo empties the collapsed group.
- Offline done stays hidden with a queued label, clears the label after sync
  without the row returning.
- Filter switches between unread, done and all never restore removed rows.
- Pin and unpin leave counts and inbox placement unchanged, and search
  filters both repo sections.
- `bun run typecheck`, `bun run lint`, `bun run test:unit`,
  `bun run test:integration`, `bun run test:component` pass.

## Files that own this

- `app/page.tsx`, `lib/queries.ts`, `lib/inbox-state.ts`
- `app/api/notifications/route.ts`, `app/api/notifications/bulk/route.ts`
- `app/api/sync/route.ts`, `app/api/thread/sync/route.ts`
- `lib/sync.ts`, `lib/queue.ts`, `lib/digest.ts`
- Pin owns only: `app/repos/page.tsx`, `components/repos/repo-row.tsx`,
  `app/api/repositories/route.ts`, `app/api/repositories/[id]/route.ts`,
  `db/schema.ts`, `db/ensure-schema.ts`, `lib/queries.ts` patch shape
