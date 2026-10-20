# Research: Rate Limits View

**Feature**: specs/003-rate-limits/spec.md
**Date**: 2026-10-17

All Technical Context unknowns resolved. No NEEDS CLARIFICATION remains: the data source, transport, auth, and UI patterns below are either proven in the `stefanwalther/rate-limits` prototype or already established in this repository (002 plan, `lib/github.ts`, `lib/contributions.ts`).

## R1: Usage figures come from response headers, not the rate-limit endpoint

- Decision: Each bucket is probed with one cheap request and the usage is parsed from the `X-RateLimit-Limit/Used/Remaining/Reset` response headers. The `GET /rate_limit` endpoint is deliberately not used.
- Rationale: Verified in the rate-limits prototype (September 2026): with the OAuth App token that `gh auth login` mints, `GET /rate_limit` always reports `used: 0` with full remaining, while the headers on real endpoints report the true account-wide usage. GitHub's own docs recommend headers over the endpoint for this purpose.
- Alternatives considered: Calling `GET /rate_limit` once (rejected, reports zero usage for exactly the token type ghn uses, which would show a permanently empty view).

## R2: One probe per bucket, three buckets total

- Decision: `GET /user` for core, a minimal `POST { viewer { login } }` GraphQL query for the GraphQL bucket, and one `GET /search/repositories?q=...&per_page=1` for search. Each refresh costs exactly 1 request per bucket, stated in the UI.
- Rationale: Mirrors the prototype's probe set one-to-one; each probe is the cheapest request that returns headers for its bucket. The search probe stays at `per_page=1` to minimize cost against the smallest bucket (30/min).
- Alternatives considered: A single endpoint covering all buckets (rejected, no such endpoint exists; buckets are per-API-family by design).

## R3: Auth reuses the existing `gh` CLI session

- Decision: Server side reads the token through the existing `getStoredToken()` helper in `lib/github.ts` (which shells out to `gh auth token`), honoring `GH_HOST` for Enterprise hosts. No token UI, no new storage, no browser exposure.
- Rationale: Same pattern as sync (002 R1) and contributions; the user is already authenticated exactly once on the server. The browser receives numbers only, so there is no new secret surface.
- Alternatives considered: In-app token entry (rejected, new secret handling for a single-user local app that already has a session).

## R4: Failure semantics map onto the spec's states

- Decision: HTTP 401 from any probe aborts the whole refresh as disconnected (`gh auth login` hint). Transport failures and missing headers on individual probes become per-bucket notices; a refresh with zero usable buckets returns an unreachable error. A 403/429 whose headers still show remaining quota keeps the numbers and attaches a warning that the probe itself was refused.
- Rationale: Implements spec FR-006/FR-007/FR-008 exactly: disconnected is distinct and global, unreachable is non-blocking with retry, partial failure degrades per bucket instead of blanking the view. Keeping numbers on non-quota 403s avoids hiding valid quota data behind a scope quirk.
- Alternatives considered: Failing the whole view on any single probe error (rejected, violates FR-008 and wastes the two good buckets).

## R5: No persistence; fetch time is the freshness signal

- Decision: No database tables, no cache rows, no `sync_state` keys. Every response carries `fetchedAt` and the page renders it; staleness is "the numbers are from the last refresh you triggered" rather than a stored state.
- Rationale: Quota figures go stale in minutes, so stored rows would be a liability disguised as a feature. The ephemeral model also keeps the change additive: no migration, no seed interaction, nothing for 002's guarantees to conflict with.
- Alternatives considered: Caching in `sync_state` with a TTL (rejected, adds invalidation logic for data the user explicitly refreshes; the 3-request cost is negligible against the core bucket).

## R6: UI reuses the repositories page shape

- Decision: Client page under `app/`, data via a `GET` Route Handler under `app/api/`, cards from local shadcn/ui primitives, nav entry in `AppShell` with a `Gauge` icon, header subtitle for the new route. Rate-limited buckets get text plus styling, never color alone.
- Rationale: The repositories page already proves this exact shape (filterable cards + route handler + nav entry + subtitle). Reuse keeps the change to one page, one handler, one lib module, and preserves the accessibility baseline.
- Alternatives considered: Embedding quota into the inbox header (rejected, couples a global concern to the triage flow and adds per-load cost to every inbox visit).
