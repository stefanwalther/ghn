# Contracts: Contributions API (local Route Handler)

**Base**: Next.js App Router Route Handler, JSON only. Data comes from `gh api graphql`
(`contributionsCollection`), never scraped.

## GET /api/contributions?date=<YYYY-MM-DD>

Returns the contribution count for one UTC calendar day.

Response 200:

```json
{ "date": "2026-10-16", "count": 30, "cached": true, "login": "stefanwalther" }
```

Rules:

- `date` defaults to today (UTC). Invalid values return 400.
- Counts persist in the `contribution_days` table. Past dates cache forever,
  today refreshes after five minutes.
- Login resolves from `GHN_LOGIN` or the `gh`-authenticated viewer.
- The profile tooltip can differ by a few at day edges because it buckets by
  the viewer's local day while the API reports UTC calendar days.
- Without auth or on failure, a stale cached row is served when present,
  otherwise 503. The UI renders a muted fallback and stays quiet.

## GET /api/contributions?days=<N>

Returns the contribution counts for the last N UTC calendar days, oldest
first, in a single `contributionsCollection` range query.

Response 200:

```json
{ "days": [{ "date": "2026-10-16", "count": 30 }], "cached": false, "login": "stefanwalther" }
```

Rules:

- `days` must be an integer between 2 and 366. Anything else returns 400.
- Each day persists in the `contribution_days` table under the same rules as
  `?date=`. Fully cached ranges return `cached: true` without calling GitHub.
- Without auth or on failure, the cached subset is served with
  `partial: true` when at least one requested day is cached, otherwise 503.
- Days the range query does not return fall back to their cached row, or `0`
  when never fetched.
