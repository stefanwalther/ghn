# Implementation Plan: Rate Limits View

**Branch**: `t3/add-rate-limits-menu` | **Date**: 2026-10-17 | **Spec**: [specs/003-rate-limits/spec.md](./spec.md)

**Input**: Feature specification from `/specs/003-rate-limits/spec.md`

## Summary

Add a "Rate limits" entry to the main navigation opening a dedicated page that shows the current GitHub API quota for the three buckets ghn consumes (core REST, GraphQL, search): used, remaining, percent, and reset per bucket, plus a documented-limits reference and a manual refresh. Figures are read server-side from the `X-RateLimit-*` response headers on one cheap probe per bucket (the same technique proven in the `stefanwalther/rate-limits` prototype), reusing the existing `gh` CLI session with no new sign-in flow and no secret ever reaching the browser. No database changes: the data is ephemeral and every load shows its fetch time.

## Technical Context

**Language/Version**: TypeScript 5.x, Bun 1.x as runtime, test runner, and package manager

**Primary Dependencies**: Next.js 15 App Router + React 19, Tailwind CSS v4, shadcn/ui local primitives (`Card`, `Button`), lucide-react icons, `gh` CLI 2.x as the GitHub transport (token via the existing `getStoredToken()` helper in `lib/github.ts`, same pattern as sync and contributions)

**Storage**: N/A. Rate-limit figures are ephemeral: probed on demand, never persisted. Freshness is communicated with a fetch timestamp per response, not a stored row. No migration, no new tables.

**Testing**: `bun test tests/unit` for header parsing, three-bucket collection, and 401-to-disconnected mapping (recorded-fixture style with injected `fetch`, no live calls in CI); `bunx tsc --noEmit` and eslint as gates; manual browser validation per `quickstart.md` (page load, refresh, revoked-auth state)

**Target Platform**: Local single-user app on macOS (dev port 21120), modern Chromium/Safari/Firefox, light/dark theme via existing providers

**Project Type**: Web application, Next.js monolith (App Router page + Route Handler, same split as inbox and repositories)

**Performance Goals**: Refresh completes in under 15 seconds on a normal connection (3 lightweight API requests, sequential, each with a 10s timeout); page renders partial bucket data instead of blocking on the slowest probe; refresh control disables while a refresh is in flight

**Constraints**: Single-user local only; reuse the `gh` CLI session, no token UI and no secret storage; token never leaves the server process (browser receives numbers only); each refresh costs 1 request per bucket and the view discloses that cost; accessibility baseline holds (full keyboard operability, visible focus, rate-limited state never color-only); live figures are never mixed with demo data

**Scale/Scope**: 1 user, 1 page (`app/rate-limits`), 1 route handler (`app/api/rate-limits`), 1 library module (`lib/rate-limits.ts`), 1 nav entry, 1 unit-test file. No changes to inbox, sync, digest, or schema.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

Constitution at `.specify/memory/constitution.md` is an unratified placeholder template with no enforceable principles, so there are no gates to violate. Plan proceeds with project-level guards instead (carried over from 002):

- [x] Single-user local scope holds, no auth UI or multi-tenant complexity added
- [x] Reused `gh` session, no new secret handling (token stays server-side)
- [x] No database changes, so seed/live separation and digest logic are untouched
- [x] Existing AppShell/Card/Button patterns reused, no new design system
- [x] Accessibility baseline adopted as UI gate (no color-only rate-limited signaling)
- [x] Refresh cost disclosed in the UI so the feature cannot silently burn quota

Post-design re-check: PASS, no new violations introduced. No Complexity Tracking entries required.

## Project Structure

### Documentation (this feature)

```text
specs/003-rate-limits/
├── plan.md              # This file (/speckit-plan command output)
├── research.md          # Phase 0 output (/speckit-plan command)
├── data-model.md        # Phase 1 output (/speckit-plan command)
├── quickstart.md        # Phase 1 output (/speckit-plan command)
├── contracts/           # Phase 1 output (/speckit-plan command)
│   └── rate-limits-api.md  # route handler contract + page UI contract
└── tasks.md             # Phase 2 output (/speckit-tasks command - NOT created by /speckit-plan)
```

### Source Code (repository root)

```text
app/
├── api/rate-limits/route.ts   # GET handler: probe buckets, return numbers (no token)
├── rate-limits/page.tsx       # Rate limits page: bucket cards, reference, refresh
components/
├── app-shell.tsx              # NAV gains the Rate limits entry (Gauge icon)
lib/
└── rate-limits.ts             # header parsing + three-bucket probe + token reuse

tests/
└── unit/
    └── rate-limits.test.ts    # header/bucket/401 unit tests with injected fetch
```

**Structure Decision**: Single Next.js monolith, following the existing repositories page split exactly (page under `app/`, data access in `lib/`, JSON via a Route Handler under `app/api/`). No new top-level directories.

## Complexity Tracking

> **Fill ONLY if Constitution Check has violations that must be justified**

| Violation | Why Needed | Simpler Alternative Rejected Because |
|-----------|------------|-------------------------------------|
| [e.g., 4th project] | [current need] | [why 3 projects insufficient] |
| [e.g., Repository pattern] | [specific problem] | [why direct DB access insufficient] |
