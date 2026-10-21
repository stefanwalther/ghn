# Implementation Plan: Docker Env Token Support

**Branch**: `004-docker-env-token` | **Date**: 2026-10-20 | **Spec**: specs/004-docker-env-token/spec.md

**Input**: Feature specification from `/specs/004-docker-env-token/spec.md`

## Summary

Add GitHub token env support (`GH_TOKEN`, fallback `GITHUB_TOKEN`) as an additional auth option alongside the host `gh` session, so the app runs in a container without `gh` installed. Ship `Dockerfile`, `compose.yaml`, `.env.example`, Makefile `up`/`down`/`logs` targets, and a README Docker section. Local `gh` flow stays the default when no env token is set.

## Technical Context

**Language/Version**: TypeScript 5.7 on Bun 1.3.10, Next.js 15 App Router, React 19

**Primary Dependencies**: `next`, `react`, `drizzle-orm` with `bun:sqlite`, `tailwindcss` v4, `lucide-react`, Docker 29 + compose v2 for the container path

**Storage**: SQLite file at `./data/quiet-notifications.db` via `db/client.ts`. Container persists it with named volume `ghn-data:/app/data`. No schema changes.

**Testing**: `bun test tests/unit` for token precedence and fetch fallback, `bun run typecheck`, `make up` smoke against `GET /api/connection`, README-only follow-through per `quickstart.md`

**Target Platform**: macOS local dev plus Linux container (`oven/bun:1`, `WORKDIR /app`, serving port `21120`)

**Project Type**: Single Next.js web application with App Router route handlers owning SQLite plus the GitHub transport

**Performance Goals**: Missing or invalid token surfaces as disconnected within 30 seconds. Clean-checkout to connected container in under 10 minutes following the README.

**Constraints**: Single-user local only. Token enters at runtime via `.env` or environment, never baked into the image, never committed, never logged. Existing `PORT ?= 21120` convention honored. Enterprise overrides `GH_HOST` and `GHN_API_BASE` keep working.

**Scale/Scope**: One developer, one container, one token. No multi-user handling.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

The project constitution at `.specify/memory/constitution.md` is an unfilled template with no enforceable gates. No violations to justify. Re-checked after design: the plan keeps the change minimal (env-first token helper, fetch fallback for contributions, runtime-only secrets, no DB changes, existing tests keep passing), so no complexity exception is needed.

## Project Structure

### Documentation (this feature)

```text
specs/004-docker-env-token/
├── plan.md              # This file (/speckit-plan command output)
├── research.md          # Phase 0 output (/speckit-plan command)
├── data-model.md        # Phase 1 output (/speckit-plan command)
├── quickstart.md        # Phase 1 output (/speckit-plan command)
├── contracts/           # Phase 1 output (/speckit-plan command)
│   └── docker.md
└── tasks.md             # Phase 2 output (/speckit-tasks command - NOT created by /speckit-plan)
```

### Source Code (repository root)

```text
app/api/connection/route.ts
app/api/contributions/route.ts
app/api/sync/route.ts
app/api/thread/route.ts
lib/github.ts
lib/contributions.ts
lib/rate-limits.ts
tests/unit/

Dockerfile
compose.yaml
.env.example
Makefile
README.md
```

**Structure Decision**: Single Next.js monolith at the repo root, matching the layout recorded for features 001 through 003. Route handlers keep owning SQLite plus the GitHub transport. New container files sit at the root beside the existing `Makefile`. Auth logic stays in `lib/github.ts` with a token-parameter fallback in `lib/contributions.ts`.

## Complexity Tracking

No constitution violations. Table not applicable.
