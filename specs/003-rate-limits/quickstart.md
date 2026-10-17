# Quickstart: Rate Limits View

**Feature**: specs/003-rate-limits/spec.md
**Date**: 2026-10-17

Validates the feature end to end. See [contracts/rate-limits-api.md](./contracts/rate-limits-api.md) for exact shapes and [data-model.md](./data-model.md) for entity rules.

## Prerequisites

- Repository dependencies installed (`bun install`).
- `gh` CLI authenticated (`gh auth status` shows an active account) for the live path.
- Dev server running (`bun run dev`, default port 21120).

## 1. Unit gate (no network)

```sh
bun test tests/unit/rate-limits.test.ts
bunx tsc --noEmit
```

Expected: header parsing, three-bucket collection, and 401-to-auth mapping pass; typecheck is clean.

## 2. Page load (connected)

1. Open `/rate-limits` from the "Rate limits" nav entry.
2. Expect one card each for Core, GraphQL, and Search with used/limit, remaining, percent, and a reset time.
3. Expect the documented-limits section with three allowances and the docs link, plus the per-refresh cost note and a fetch timestamp.

## 3. Refresh

1. Click Refresh and expect the fetch timestamp to update and figures to re-read.
2. Expect the control to disable while the refresh is in flight and re-enable after.

## 4. Rate-limited bucket

Exhaust (or wait for) one bucket to zero remaining and reload. Expect that card flagged as rate-limited with the reset figure prominent, while the other cards render normally.

## 5. Disconnected (revoked or missing auth)

1. Log out (`gh auth logout`) or revoke the token, then open `/rate-limits`.
2. Expect the distinct disconnected state with the reconnect path and no figures presented as current.
3. Re-authenticate (`gh auth login`), refresh, and expect live figures again.

## 6. Partial failure

If one bucket's probe fails (e.g., search throttled), expect that card to show its notice while the other two cards keep live figures. A total failure shows the non-blocking error with retry.
