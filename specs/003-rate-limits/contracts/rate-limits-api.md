# Contract: Rate Limits API + Page

**Feature**: specs/003-rate-limits/spec.md
**Date**: 2026-10-17

## `GET /api/rate-limits`

Returns the current GitHub quota for the buckets ghn consumes. No parameters. `Cache-Control: no-store`.

### Success (200)

```json
{
  "provider": "github",
  "fetchedAt": "2026-10-17T12:00:00.000Z",
  "usage": {
    "core": {
      "used": 125,
      "limit": 5000,
      "remaining": 4875,
      "percent": 2.5,
      "resetsAt": "2026-10-17T13:00:00.000Z",
      "resetsInSecs": 3600,
      "status": "ok"
    },
    "graphql": { "...": "same shape" },
    "search": { "...": "same shape" }
  },
  "warnings": {
    "search": "probe returned HTTP 403"
  }
}
```

- `usage` contains only buckets with parsable headers; `warnings` (optional) explains absent buckets.
- Cost: 1 GitHub request per bucket per call.

### Disconnected (401)

```json
{ "provider": "github", "error": "GitHub auth rejected (HTTP 401). Run `gh auth login` to refresh the token.", "reason": "auth" }
```

Returned when no `gh` session exists or a probe is rejected as unauthorized.

### Unreachable (502)

```json
{ "provider": "github", "error": "GitHub API probes failed: core: ...; graphql: ...; search: ...", "reason": "unreachable" }
```

Returned when zero buckets yield parsable headers (network failure or header-less responses on all probes).

## Page contract (`/rate-limits`)

- Navigation: a "Rate limits" entry in the main nav opens the page; the header shows the route-specific subtitle.
- One card per bucket (`core`, `graphql`, `search`) showing used/limit, remaining, percent with a meter, and reset time or countdown. Buckets without data show a per-bucket notice; the remaining cards render normally.
- A zero-remaining bucket is flagged rate-limited with text, not color alone.
- A Refresh action re-fetches and updates the fetch timestamp; the control disables while a refresh is in flight.
- A documented-limits section maps each live bucket to its allowance and window with a link to GitHub's rate-limit docs, plus a note that each refresh costs one request per bucket.
- Disconnected state: distinct message with reconnect path, no figures presented as current. Unreachable state: non-blocking error with retry, previously loaded figures stay readable and marked as not fresh.
- No demo or seed figures are ever shown as live data.
