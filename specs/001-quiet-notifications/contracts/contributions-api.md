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
  today refreshes after one hour.
- Login resolves from `GHN_LOGIN` or the `gh`-authenticated viewer.
- The profile tooltip can differ by one at day edges because it uses a
  different day boundary than the UTC window queried here.
- Without auth or on failure, a stale cached row is served when present,
  otherwise 503. The UI renders a muted fallback and stays quiet.
