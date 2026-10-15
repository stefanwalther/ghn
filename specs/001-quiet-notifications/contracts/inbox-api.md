# Contracts: Inbox API (local Route Handlers)

**Base**: Next.js App Router Route Handlers, JSON only. All timestamps are unix ms.

## GET /api/notifications?repo=<id|all>&state=<unread|all|done>

Returns grouped inbox for the current digest clock.

Response 200:

```json
{
  "now": 1729000000000,
  "mainFlow": [
    {
      "id": "n_001",
      "repositoryId": "acme-web",
      "repositoryName": "acme/web",
      "subject": "Fix flaky login redirect",
      "reason": "review_requested",
      "createdAt": 1728900000000,
      "isRead": 0,
      "isDone": 0,
      "sourceUrl": "https://github.com/acme/web/pull/12#discussion_r1",
      "due": true,
      "dueLabel": "Digest due"
    }
  ],
  "collapsedSection": [
    {
      "repositoryId": "slow-dep",
      "repositoryName": "vendor/slow-dep",
      "rhythm": "weekly",
      "nextDueAt": 1729600000000,
      "pendingCount": 14,
      "items": []
    }
  ]
}
```

Rules:

- `mainFlow` holds immediate plus due digest items with `isDone = 0`.
- `collapsedSection` holds one entry per non-due digest repo with counts. Item previews load on expand via the same endpoint with `?repo=<id>`.
- Empty inbox returns empty arrays, UI renders the w5r empty state.

## POST /api/notifications/bulk

Applies one action to many items in a single round-trip (FR-003, FR-012).

Request:

```json
{ "ids": ["n_001", "n_002"], "action": "done" }
```

`action` is `done`, `unread`, or `read`.

Response 200:

```json
{ "updated": 2, "action": "done" }
```

Errors:

- 400 when `ids` is empty or `action` unknown.
- 422 when any id is unknown, no partial writes.

## POST /api/notifications/seed (dev only)

Reseeds the 200-item mock dataset. Disabled in production builds.

Response 200: `{ "repositories": 10, "notifications": 200 }`

## UI contract: inbox list

- Each row shows repository name, subject, reason badge, age, read/done affordance, and external open link.
- Checkbox column drives bulk bar. Bulk bar offers Done and Unread only in MVP.
- Every clickable row, checkbox, link, and button carries `cursor-pointer`, subtle hover, and `focus-visible` ring per w5r patterns.
- Source links use `target=_blank rel=noopener`, prototype tab state untouched.
