# Contracts: Sync + Connection (local Route Handlers)

**Base**: Next.js App Router Route Handlers, JSON only. GitHub access reuses the server's `gh` CLI session (spec Q1); no tokens cross these contracts. All timestamps are unix ms unless ISO-marked.

## POST /api/sync

Runs a full or incremental live sync (manual refresh and on-open sync share this route).

Request (all optional):

```json
{ "full": false }
```

Response 200 (fresh):

```json
{
  "now": 1729000000000,
  "lastSyncAt": 1729000000000,
  "fresh": true,
  "pollIntervalSecs": 60,
  "upserted": 132,
  "markedDone": 4,
  "discoveredRepos": 2,
  "queueDepth": 0
}
```

Response 200 (not modified, conditional `304` from GitHub):

```json
{
  "now": 1729000000000,
  "lastSyncAt": 1728990000000,
  "fresh": true,
  "pollIntervalSecs": 60,
  "upserted": 0,
  "markedDone": 0,
  "discoveredRepos": 0,
  "queueDepth": 0,
  "notModified": true
}
```

Response 200 (stale, GitHub unreachable or rate-limited; cached inbox stays readable):

```json
{
  "now": 1729000000000,
  "lastSyncAt": 1728990000000,
  "fresh": false,
  "reason": "network",
  "retryable": true,
  "queueDepth": 2
}
```

`reason` is `network` | `rate_limited` | `auth` | `unknown`. `auth` pairs with the connection contract below.

Rules:

- Respects the advertised `X-Poll-Interval`: calls inside the window return the cached `lastSyncAt` result with `notModified: true` instead of hitting GitHub.
- `full: true` forces a complete `all=true` paginated pass; default uses `since=<lastSyncAt>` when available.
- First-ever call runs the one-way migration from `data-model.md` (delete `n_*` seed rows, keep rhythms, discover repos) before upserting.
- Remote-done propagation: a thread absent from a full pass with no queued write-back becomes local `isDone = 1`. Incremental passes never mark done by absence.
- Explicit local unreads (`localUnread = 1`) survive sync for threads still present; read/done actions clear the flag.

## GET /api/connection

Reports how the server reaches GitHub, backing the disconnected banner and the reconnect path.

Response 200:

```json
{ "connected": true, "viewerLogin": "stefanwalther", "lastSyncAt": 1729000000000, "pollIntervalSecs": 60, "stale": false }
```

Response 200 (disconnected):

```json
{ "connected": false, "reason": "missing_auth", "hint": "Run `gh auth login` on the server and refresh.", "lastSyncAt": 1729000000000, "pollIntervalSecs": 60, "stale": true }
```

`reason` is `missing_auth` | `revoked` | `rate_limited` | `network`. The UI never presents cached rows as fresh when `connected` is false; it shows last-synced time with retry.

## GET /api/notifications (live deltas vs 001)

Same query params and grouping as [`inbox-api`](../../001-quiet-notifications/contracts/inbox-api.md), plus sync metadata on every response:

```json
{
  "now": 1729000000000,
  "lastSyncAt": 1729000000000,
  "stale": false,
  "mainFlow": [],
  "collapsedSection": [],
  "facets": { "types": [], "repos": [] }
}
```

Rules carried from 001 plus:

- `reason` values are raw GitHub reasons (`subscribed`, `state_change`, `mention`, `review_requested`, `ci_activity`, ...); facets enumerate the observed set.
- `lastSyncAt` renders in the header on every load; `stale: true` renders the stale banner with retry, never silent stale-as-fresh.
- Response `Link`-style paging from GitHub stays server-side; the inbox keeps its current page contract (first screen fast, no client paging changes).

## POST /api/notifications/bulk (live write-back deltas vs 001)

Same request shape (`{ids, action}` with `done | unsubscribe | read | unread`), same 400/422 rules, plus:

- `done` calls `DELETE /notifications/threads/{id}` per thread, then marks local done. `read` calls `PATCH` per thread, then marks local read. `unsubscribe` marks local done, inserts the muted-subject row, and best-effort `PUT .../subscription {ignored: true}`.
- `unread` is local-only (no remote endpoint exists): sets `isDone 0, isRead 0, localUnread 1` and returns success without a GitHub call.
- Any remote failure keeps the prior local state visible, appends one `writeback_queue` row per failed thread, and returns 200 with a per-action summary the UI renders as a non-blocking retry notice:

```json
{ "updated": 3, "action": "done", "remote": "partial", "queued": 2 }
```

- `GET /api/sync` (or the next refresh) drains the queue FIFO before fetching.

## POST /api/notifications/seed (live gating delta vs 001)

Unchanged 403-in-production rule, plus: refuses with 409 when any numeric-thread (live) notification row exists, unless the body carries `{ "force": true }` in non-production development. The inbox hides the Reseed button whenever `lastSyncAt` is set.

## UI contract deltas

- Header shows connection presence plus `Last synced <time>` on every inbox load; inside the poll window the refresh control counts down instead of firing.
- Stale (`network`/`rate_limited`), disconnected (`auth`), and partial-write-back states reuse the prototype's non-blocking notice pattern and `empty-states` visuals; cached rows stay interactive.
- Newly discovered repos appear in `/repos` with their quiet default rhythm selected and changeable; unreachable (renamed/deleted/access-lost) repos are badged, never blocking.
- Unread rows carry a quiet "local only" hint until their next read/done action, documenting the R3 API limitation where the user can see it.
