# Docker (optional token-based run)

The app authenticates to GitHub with `GH_TOKEN` (fallback `GITHUB_TOKEN`) when set, or the host `gh` CLI session otherwise. The container path needs no `gh` install.

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
- Local flow unchanged: with no token env vars set, the app keeps using the host `gh` session as before.
