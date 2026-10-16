# Contracts: Digest API (local Route Handlers)

**Base**: Next.js App Router Route Handlers, JSON only.

## GET /api/repositories

Lists repos with digest status for FR-006 and FR-010.

Response 200:

```json
{
  "repositories": [
    {
      "id": "slow-dep",
      "fullName": "vendor/slow-dep",
      "ownership": "watched",
      "rhythm": "weekly",
      "lastPromotedAt": 1728400000000,
      "nextDueAt": 1729000000000,
      "pendingCount": 14,
      "isDue": true
    }
  ]
}
```

## PATCH /api/repositories/[id]

Changes one repo rhythm. Body:

```json
{ "rhythm": "monthly" }
```

Response 200 returns the updated repo object with recomputed `nextDueAt`.

Rules:

- `rhythm` must be `immediate`, `weekly`, `biweekly`, or `monthly`.
- Switching to `immediate` clears `nextDueAt` and promotes pending items on next inbox load.
- Switching to a digest rhythm sets `nextDueAt` from now via `lib/digest.ts`.
- 404 when id is unknown, 400 when rhythm is invalid.

## UI contract: repositories page and digest section

- Repositories page lists each repo with ownership, rhythm select, next due date, and pending count.
- Rhythm select shows helper text with the consequence, e.g. monthly hides new items until the due date.
- Inbox collapsed section sits below the main flow, dimmed and collapsed by default, one group per non-due repo with count and next due date.
- Due groups promote to the main flow with a visible due indicator, never silently.
- Count badges use `muted` or `secondary`. Solid `primary` appears at most once per region, reserved for the single bulk Done action and the single page-level save where present.
