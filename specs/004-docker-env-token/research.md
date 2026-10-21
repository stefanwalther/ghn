# Research: Docker Env Token Support

**Feature**: specs/004-docker-env-token/spec.md
**Date**: 2026-10-20

## R1: Token env var precedence

- Decision: `readToken()` checks `GH_TOKEN` first, then `GITHUB_TOKEN`, trims whitespace, ignores empty, then falls back to `gh auth token`. `GITHUB_TOKEN` exists only as a fallback for CI familiarity.
- Rationale: Matches `gh` CLI precedence (`GH_TOKEN` overrides `GITHUB_TOKEN`) so local and container behavior agree. Verified against current code: `lib/github.ts:48` has no env check today, while `lib/rate-limits.ts:35,44` already reads `GHN_API_BASE` and `GH_HOST` from env, so env-first token is consistent.
- Alternatives considered: `GHN_TOKEN` custom name (rejected, new name to learn, breaks copy-paste from `gh` docs); env-only with no `gh` fallback (rejected, regresses local flow in spec US2).

## R2: Contributions without `gh` in container

- Decision: Add optional token parameter to `getViewerLogin()` and `fetchDayCount()` in `lib/contributions.ts:55,66`. When a token is available, use `fetch` to `GET /user` and GraphQL `contributionsCollection` with the same `GHN_API_BASE`/`GH_HOST` handling as `lib/github.ts` and `lib/rate-limits.ts`. Keep `gh api` subprocess as fallback when no token is set.
- Rationale: Sync, connection, thread, and rate-limit routes already use token-based `fetch` (`app/api/sync/route.ts:81`, `app/api/thread/route.ts:31`, `lib/rate-limits.ts:191`), so only contributions blocks a `gh`-free image. Token path reuses proven header and base-url logic.
- Alternatives considered: Installing `gh` in the image and mounting `hosts.yml` (rejected as default, keeps host coupling and macOS keychain issues); requiring `GHN_LOGIN` always (rejected, breaks viewer derivation).

## R3: Base image and build

- Decision: `oven/bun:1` single image, `WORKDIR /app`, `bun install`, `bun run build`, runtime `bun --bun next start -p 21120`. No `gh` install in the image.
- Rationale: Matches `package.json:6,8` scripts exactly. Bun 1.3.10 verified locally. `bun:sqlite` in `db/client.ts:1` is bundled with the Bun runtime, so no extra native toolchain is needed beyond what the base image ships. Verified `docker 29.8.2` and `compose v5.6.0` locally.
- Alternatives considered: `node:22-slim` runner (rejected, diverges from Bun-tested `bun test` and `bun:sqlite` path); multi-stage build (deferred, single stage is enough for local test, can optimize later).

## R4: Compose file name and command

- Decision: `compose.yaml` with `docker compose` v2 syntax. Makefile targets call `docker compose -f compose.yaml`.
- Rationale: v2 is installed here (v5.6.0). `compose.yaml` is the current canonical name. User said "docker-compose file", which this satisfies functionally.
- Alternatives considered: `docker-compose.yml` legacy name (rejected, older convention, identical behavior but no reason to prefer it).

## R5: Data persistence and port

- Decision: Named volume `ghn-data:/app/data` matching `db/client.ts:5` (`./data/quiet-notifications.db`). Default publish `${PORT:-21120}:21120`, honoring the existing `Makefile:4` `PORT ?= 21120` convention.
- Rationale: Named volume avoids macOS bind-mount permission churn and survives `down`. Port env keeps Raycast/local convention (`scripts/ensure-web.sh`, `Makefile`).
- Alternatives considered: Bind mount `./data` (rejected as default, leaks container UID files into checkout, but noted as an option in README troubleshooting).

## R6: Env file and secret handling

- Decision: `env_file: .env` in compose plus explicit `environment` passthrough for `GH_TOKEN, GITHUB_TOKEN, GH_HOST, GHN_API_BASE, GHN_LOGIN, PORT`. Commit `.env.example` only. `.env` is already ignored by `.gitignore:2`.
- Rationale: Runtime-only injection, nothing baked into the image. `GH_HOST`/`GHN_API_BASE` reuse is required for Enterprise hosts per `lib/rate-limits.ts:34,44`.
- Alternatives considered: `docker compose --env-file` flag only (equivalent, but `env_file:` keeps `make up` argument-free); Docker secrets (overkill for single-user local test).

## R7: Makefile interface

- Decision: `up` (build + detached start), `down` (stop, keep volume), `logs` (follow app logs). `up` depends on `.env` existing and prints a hint when missing.
- Rationale: Exactly the requested `up`/`down` surface, extended with `logs` for auth-vs-down diagnosis in README troubleshooting.
- Alternatives considered: `docker-up` prefixed names (rejected, user explicitly asked for `up`/`down`).
