# Data Model: Docker Env Token Support

**Feature**: specs/004-docker-env-token/spec.md
**Date**: 2026-10-20

No database schema changes. This feature introduces runtime configuration entities only.

## Entities

### GitHub credential (existing behavior, extended source)

- Source: `env-token` when `GH_TOKEN` or `GITHUB_TOKEN` is non-empty after trim, else `host-session` via `gh auth token`.
- Precedence rule: `GH_TOKEN` wins over `GITHUB_TOKEN`, either wins over host session.
- Validation: non-empty after trim. Empty string behaves as unset.
- State transitions: valid token to revoked or expired token surfaces as disconnected with auth reason on next probe. No local state machine change.

### Containerized app (new runtime)

- Port: `${PORT:-21120}` published to container `21120`.
- Data: named volume `ghn-data` mounted at `/app/data`, backing `./data/quiet-notifications.db` from `db/client.ts`.
- Auth source in effect: resolved per request through `getStoredToken()`. No persisted credential.
- Lifecycle: `up` creates and starts, `down` stops without removing the volume.

### Env configuration (new file contract)

- File: `.env` (ignored), template `.env.example` (committed).
- Keys: `GH_TOKEN` (primary), `GITHUB_TOKEN` (fallback), `GH_HOST`, `GHN_API_BASE`, `GHN_LOGIN`, `PORT`.
- Validation: missing file blocks `up` with a copy hint. Missing token still starts the app but connection reports disconnected.
- Relationships: compose `env_file` loads the file, `environment` passes listed keys into the app process.

## Non-goals

- No new tables, columns, or migrations in `db/schema.ts`.
- No token storage in SQLite or logs.
- No multi-user or secret rotation handling.
