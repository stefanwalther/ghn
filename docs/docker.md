# Docker

The app authenticates to GitHub with `GH_TOKEN` (fallback `GITHUB_TOKEN`) when set, or the host `gh` CLI session otherwise. The container path needs no `gh` install.

## Published images

Every release-please release publishes `ghcr.io/stefanwalther/ghn:<tag>`
(e.g. `ghn-v0.4.0`) and `ghcr.io/stefanwalther/ghn:latest`
(multi-arch: `linux/amd64` + `linux/arm64`).

To run a published image instead of building locally:

1. `cp .env.example .env` and set `GH_TOKEN=...` (never commit `.env`)
2. `docker compose pull app && docker compose up -d` (skip `--build`)

## Setup

1. `cp .env.example .env`
2. Set `GH_TOKEN=...` in `.env` (never commit `.env`)
3. Optional overrides in `.env`: `GH_HOST`, `GHN_API_BASE`, `GHN_LOGIN`, `PORT`

## Run

- `make up` - build and start (`PORT=21220 make up` to override the host port)
- `make logs` - follow container logs
- `make down` - stop, keeping the `ghn-data` volume (SQLite data survives restarts)

## Troubleshooting

- `make up` refuses without `.env`: copy `.env.example` first.
- App up but GitHub disconnected: token missing, invalid, or expired. Check `GET /api/connection` and `make logs`, then fix `GH_TOKEN` and retry.
- App down (connection refused): the container is not running. Check `docker compose ps` and `make logs`.
- App exits right after upgrading with a database or permission error in the logs: the image now runs as non-root, so a `ghn-data` volume created by the old root image is not writable. Recreate it with `docker compose down -v && make up` (this deletes the SQLite data) and resync afterwards.
- Local flow unchanged: with no token env vars set, the app keeps using the host `gh` session as before.
