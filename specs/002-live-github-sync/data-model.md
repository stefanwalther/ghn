# Data Model: Live GitHub Sync

**Feature**: specs/002-live-github-sync/spec.md
**Date**: 2026-10-16

Evolves the prototype schema (see `../001-quiet-notifications/data-model.md`) from seeded mocks to a live GitHub mirror. Repository rhythm columns and digest math are unchanged; notification identity and sync bookkeeping are new.

## Entities

### Repository (existing table, discovery extended)

Watched code repository keyed by GitHub `full_name`. Rhythm columns carry over verbatim from the prototype.

- `id` text primary key. Prototype seed ids (`acme-web`) persist for carried-over rows; newly discovered repos use the lowercased `full_name` with `/` replaced by `--` (e.g. `NandhaKishorM/laya` → `nandhakishorm--laya`) for URL-safe stability.
- `fullName` text unique, e.g. `NandhaKishorM/laya`.
- `ownership` text, `owned` when `repository.owner.login == viewer login`, else `watched`.
- `rhythm` text, `immediate` | `weekly` | `biweekly` | `monthly`. Carried-over rows keep their value; new `owned` rows default `immediate`, new `watched` rows default `weekly`.
- `lastPromotedAt` integer unix ms, nullable. `nextDueAt` integer unix ms, nullable for immediate.
- `snoozedUntil` integer unix ms, nullable (already in schema, unchanged).
- `createdAt` integer unix ms.
- `unreachable` integer 0/1, default 0. Set when sync sees the repo renamed, deleted, or access-lost; the inbox marks its cached items instead of dropping them.

Validation:

- `rhythm` must be one of the four values; `nextDueAt` required unless immediate.
- Discovery never overwrites an existing row's `rhythm`, `snoozedUntil`, or due dates.

Relationships: one repository has many live notifications.

### Live Notification (existing `notifications` table, identity changed)

GitHub thread mirrored locally. GitHub is the system of record for read/done; the local row adds digest placement.

- `id` text primary key = GitHub thread `id` string (e.g. `26392900861`). Seed `n_*` rows are deleted by the first-sync migration.
- `repositoryId` text foreign key to Repository.
- `subject` text from `subject.title`, non-empty, max 200 chars (prototype constraint kept).
- `subjectType` text, e.g. `Issue` | `PullRequest` | `Commit` | `Release` | `Discussion`. New column, display-only, informs the source-URL fallback shape.
- `reason` text stores the raw GitHub reason verbatim (`subscribed`, `state_change`, `mention`, `review_requested`, `ci_activity`, `assign`, `author`, `comment`, ...). Prototype's closed 8-value union is widened; filter facets enumerate the observed set.
- `createdAt` integer unix ms = `updated_at` from GitHub (sort key, replaces the seed age spread).
- `githubUpdatedAt` integer unix ms, same instant as `createdAt` at insert, refreshed on every sync where the thread still appears. New column; drives `since`-based incremental sync and conflict comparison.
- `isRead` integer 0/1 = inverse of thread `unread`.
- `isDone` integer 0/1. Local done wins after write-back; remote done (thread absent from a full `all=true` sync) propagates to local done.
- `sourceUrl` text, resolved `html_url` for `subject.url` (cached per unique API URL), valid https URL.
- `localUnread` integer 0/1, default 0. New column; set by explicit local unread action (which has no remote endpoint), cleared by the next read/done action. Sync preserves `isRead = 0` rows flagged this way even when the remote thread reports read.

Validation:

- `subject` non-empty, max 200 chars. `sourceUrl` must be valid https.
- `isDone = 1` removes the item from both main flow and collapsed counts (unchanged).

State transitions:

- remote unread (`unread true`) → local `isRead 0, isDone 0, localUnread 0`.
- bulk/one-click read → `PATCH` thread, then `isRead 1`, clear `localUnread`.
- bulk/one-click done → `DELETE` thread (GitHub Done), then `isDone 1`, clear `localUnread`.
- explicit unread → `isDone 0, isRead 0, localUnread 1`, no remote call.
- remote done (thread missing from full sync, no queued write-back) → `isDone 1`.
- done → unread re-enters the correct flow section by repo rhythm and due state (unchanged).

### Digest Setting (unchanged, columns on Repository)

Per-repository cadence plus computed dates via `lib/digest.ts`. Weekly `nextDueAt = lastPromotedAt + 7d`, biweekly +14d, monthly +1 calendar month. Displayed per FR-010 as rhythm label, next due date, pending count (derived, not stored).

### Inbox View State (transient, unchanged)

`repoFilter` and `stateFilter` in URL search params, `selection` in client memory, `lastOpenedId` in sessionStorage. Full reload restores filters; selection resets.

### Sync State (new `sync_state` table)

Last-successful-sync bookkeeping shown in the inbox header.

- `key` text primary key, e.g. `lastSyncAt`, `viewerLogin`, `lastModified`, `pollIntervalSecs`.
- `value` text. `lastSyncAt` is unix ms of the last completed full sync; `viewerLogin` caches `gh api user --jq .login` for ownership derivation; `lastModified` stores the last response `Last-Modified` for conditional polling; `pollIntervalSecs` stores the last advertised `X-Poll-Interval` (observed 60).

### Write-back Queue (new `writeback_queue` table)

Durable backlog for done/read/unsubscribe actions that failed (offline, rate limit, permission).

- `id` integer primary key autoincrement.
- `threadId` text, GitHub thread id.
- `action` text, `done` | `read` | `unsubscribe`.
- `attempts` integer, default 0.
- `lastError` text nullable.
- `createdAt` integer unix ms.

Processing: FIFO on next successful sync or manual retry; success applies the local state transition and deletes the row; repeated failure keeps the cached state visible with the error banner.

## Derived views (unchanged shape, live rows)

- `mainFlow`: notifications where `isDone = 0` and (`repositories.rhythm = immediate` or digest `isDue(now)` or snooze expired), plus `localUnread` rows for present threads.
- `collapsedSection`: non-done notifications where rhythm is digest and not due (or snoozed), grouped by repository with `pendingCount`.
- `pendingCount`: count of non-done notifications per non-due repo.
- `dueBadge`: true when `now >= nextDueAt`; group promotes with due indicator.

## Migration (first live sync, one way)

1. Read all repository rows; snapshot their `rhythm`, `snoozedUntil`, and due dates.
2. Delete every notification with id starting `n_` (seed rows only); never delete a numeric thread id.
3. Delete repositories left with zero notification rows (the seed fixtures); live repositories are discovered next and never match this rule because their rows are inserted first.
4. Upsert discovered repositories with R5 defaults without touching snapshotted rows.
5. Full `all=true` paginated fetch, then upsert threads per the R4 field map.
6. Record `lastSyncAt` and `viewerLogin`; clear nothing else. `mutedSubjects` and `contributionDays` carry over untouched.
