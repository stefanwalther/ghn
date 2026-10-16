# Data Model: Quiet Notifications Prototype

**Feature**: specs/001-quiet-notifications/spec.md
**Date**: 2026-10-15

## Entities

### Repository

Watched code repository. Owns its digest rhythm.

- `id` text primary key, e.g. `acme-web`
- `fullName` text unique, e.g. `acme/web`
- `ownership` text, `owned` or `watched`
- `rhythm` text, `immediate` | `weekly` | `biweekly` | `monthly`
- `lastPromotedAt` integer unix ms, nullable
- `nextDueAt` integer unix ms, nullable for immediate
- `createdAt` integer unix ms

Validation:

- `rhythm` must be one of the four values.
- `nextDueAt` required unless rhythm is immediate.
- Changing rhythm recomputes `nextDueAt` via `lib/digest.ts` and sets `lastPromotedAt` when promoting.

Relationships: one repository has many notifications.

### Notification (seeded mock in MVP)

Update item triaged in the inbox.

- `id` text primary key, e.g. `n_001`
- `repositoryId` text foreign key to Repository
- `subject` text, e.g. `Fix flaky login redirect`
- `reason` text, `mention` | `review_requested` | `ci_failed` | `assigned` | `subscribed`
- `createdAt` integer unix ms
- `isRead` integer 0/1
- `isDone` integer 0/1
- `sourceUrl` text, stable fake GitHub URL

Validation:

- `subject` non-empty, max 200 chars.
- `sourceUrl` must be a valid https URL.
- `isDone = 1` removes the item from both main flow and collapsed counts.

State transitions:

- unread (`isRead 0, isDone 0`) -> read (`isRead 1`) on open or mark-read
- unread/read -> done (`isDone 1`) via single or bulk Done
- done -> unread (`isDone 0, isRead 0`) via mark-unread, item re-enters correct flow section based on repo rhythm and due state

### Digest Setting (columns on Repository, not a separate table)

Per-repository cadence choice plus computed dates.

- Lives as `repositories.rhythm`, `lastPromotedAt`, `nextDueAt`.
- Weekly means `nextDueAt = lastPromotedAt + 7 days` local time, biweekly +14 days, monthly +1 calendar month.
- Displayed per FR-010 as rhythm label, next due date, pending count (count derived, not stored).

### Inbox View State (transient, not in SQLite)

Current filter, selection, and position.

- `repoFilter` string in URL `?repo=<id|all>`, `stateFilter` in URL `?state=unread|all|done`
- `selection` string set in client memory only, cleared after bulk action
- `lastOpenedId` string in sessionStorage for scroll restore
- Never persisted to SQLite. Full reload restores filters from URL, selection resets to empty.

## Derived views (not stored)

- `mainFlow`: notifications where `isDone = 0` and (`repositories.rhythm = immediate` or digest `isDue(now)`).
- `collapsedSection`: notifications where `isDone = 0` and rhythm is digest and not due, grouped by repository with `pendingCount`.
- `pendingCount`: count of non-done notifications per non-due repo.
- `dueBadge`: true when `now >= nextDueAt`, group promotes to main flow with due indicator.

## Seed volumes (MVP)

- 10 repositories (3 owned immediate, 7 watched across weekly, biweekly, monthly).
- 200 notifications spread over 45 days.
- Indexes on `notifications(repositoryId)`, `notifications(isDone)`, `repositories(rhythm)`.
