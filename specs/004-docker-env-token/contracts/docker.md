# Contracts: Docker Env Token Support

**Feature**: specs/004-docker-env-token/spec.md

## Env contract (`.env` / `.env.example`)

- `GH_TOKEN`: primary token. Takes precedence when non-empty after trim.
- `GITHUB_TOKEN`: fallback token. Used only when `GH_TOKEN` is unset or empty.
- `GH_HOST`: optional Enterprise host. Same semantics as `lib/rate-limits.ts`.
- `GHN_API_BASE`: optional API base override. Same semantics as `lib/github.ts`.
- `GHN_LOGIN`: optional login override. Same semantics as `app/api/contributions/route.ts`.
- `PORT`: optional host port. Defaults to `21120`.

Rules:

- Empty or whitespace-only values behave as unset.
- The real `.env` file is never committed and never printed by targets.
- `.env.example` contains placeholder values only.

## Compose contract (`compose.yaml`)

- Service `app` builds from repo `Dockerfile`, publishes `${PORT:-21120}:21120`.
- `env_file: .env` is the only token path into the container. No `environment`
  token passthrough exists on purpose: an interpolated empty value would
  override the file value.
- `environment` pins `PORT=21120` inside the container so a host `PORT`
  override cannot break the listen port.
- Volume `ghn-data:/app/data` persists SQLite data across restarts.
- No token in `build.args` or image layers.

## Makefile contract

- `make up`: requires `.env`, runs `docker compose up --build -d`, prints the app URL.
- `make down`: runs `docker compose down`, preserves the `ghn-data` volume.
- `make logs`: runs `docker compose logs -f app`.
- `PORT=21121 make up` overrides the host port.

## HTTP behavior contract (unchanged shape)

- `GET /api/connection` returns `connected: true` with env token when valid, else `connected: false` with `auth` reason and a hint covering both `GH_TOKEN` and host login.
- Missing token never prevents startup. It surfaces as disconnected at request time.
