# Quickstart: Docker Env Token Support

**Feature**: specs/004-docker-env-token/spec.md
Validates the feature end to end. See `contracts/docker.md` for the env and target contracts.

## Prerequisites

- Docker and `docker compose` v2 installed.
- A GitHub token with notification and repo read scopes.
- Port `21120` free, or pick an override.

## Setup

1. Copy the example env file: `cp .env.example .env`.
2. Put the token in `.env` as `GH_TOKEN=...`.
3. Confirm `.env` stays untracked: `git status --short` shows nothing for `.env`.

## Run

1. Start: `make up`.
2. Open `http://localhost:21120`.
3. Confirm `GET /api/connection` reports `connected: true`.
4. Confirm inbox sync loads live data.

## Regression check (local flow unchanged)

1. Stop the container: `make down`.
2. Run the app locally as before with host auth and no token env var.
3. Confirm sync and contributions succeed.

## Failure drills

- Missing token: empty `GH_TOKEN` in `.env`, `make up`, confirm the app starts but connection reports disconnected with a reconnect hint.
- Invalid token: set a bad value, refresh, confirm auth error is distinguishable from app-down. Use `make logs` to confirm the app process is up.
- Port conflict: `PORT=21121 make up`, open `http://localhost:21121`.
- Persistence: sync, `make down`, `make up`, confirm prior inbox state returns without full resync.

## Cleanup

- `make down` stops containers and keeps the `ghn-data` volume.
