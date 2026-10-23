# Implementation Plan: Client State Management

**Branch**: `005-client-state-management` | **Date**: 2026-10-22 | **Spec**: `specs/005-client-state-management/spec.md`

**Input**: Feature specification from `specs/005-client-state-management/spec.md`

## Summary

Replace per-page `fetch` plus `window CustomEvent` plumbing with one shared server cache and typed UI actions. TanStack Query v5 owns notifications, repositories, connection, and thread details keyed from URL filters. URL stays the source of truth for filters. A minimal zustand UI store is optional and holds only ephemeral globals like sidebar, palette, help, and drawer id. Records never move into zustand. Existing pure helpers in `lib/inbox-state.ts` and `lib/view-state.ts` keep their semantics and become the optimistic-update contract.

## Technical Context

**Language/Version**: TypeScript 5.7, React 19.0, Next.js 15.1.6 App Router

**Primary Dependencies**: react, react-dom, next, next-themes, drizzle-orm. Proposed additions: `@tanstack/react-query@^5` for server cache, `zustand@^5` optional for UI-only globals.

**Storage**: SQLite via `bun:sqlite` plus drizzle (`db/client.ts`). UI prefs in `localStorage` (`ghn:sidebar`, `ghn:drawer-width`) and `sessionStorage` (`ghn:last-opened`) with silent fallback.

**Testing**: vitest 5 with three projects: unit (node), integration (node), component (happy-dom). Playwright for e2e. Existing pure helper tests stay framework-free.

**Target Platform**: Local single-user web app. Bun server for API routes, desktop browsers for client.

**Project Type**: Web application (Next App Router frontend plus API routes plus SQLite).

**Performance Goals**: Palette opens from cache in under 200ms. Triage applies optimistically on the same frame. Zero duplicate notifications or repositories fetches within the 30s freshness window. Max 1000 notification records.

**Constraints**: No API response shape change. URL filters remain source of truth. Offline-readable cached inbox with truthful stale and disconnected states. Full keyboard operability and visible focus preserved. Added client JS under about 16kB gz.

**Scale/Scope**: Single user. Up to about 1000 notifications and 100 repositories across 4 pages (inbox, repos, rate-limits, settings) plus command palette and app shell.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

The checked-in constitution at `.specify/memory/constitution.md` is an unratified placeholder template with no enforceable gates. No violations to justify. Applied principles for this plan:

- Simplicity over new abstraction. Query for server state, URL for filters, local state for page-local UI. Zustand only for true globals and never for records.
- Keep tested pure logic stable. `lib/inbox-state.ts`, `lib/view-state.ts`, `lib/filters.ts` keep semantics and become the mutation contract.
- No backend or schema change in this feature. All changes are client fetching, caching, and UI actions.

Post-design re-check: no new gates introduced. Data model adds no storage entities. Contracts add client hook signatures only. No constitution violation.

## Project Structure

### Documentation (this feature)

```text
specs/005-client-state-management/
├── plan.md              # This file (/speckit-plan command output)
├── research.md          # Phase 0 output (/speckit-plan command)
├── data-model.md        # Phase 1 output (/speckit-plan command)
├── quickstart.md        # Phase 1 output (/speckit-plan command)
├── contracts/           # Phase 1 output (/speckit-plan command)
└── tasks.md             # Phase 2 output (/speckit-tasks command - NOT created by /speckit-plan)
```

### Source Code (repository root)

```text
app/
├── page.tsx              # InboxView, heaviest client state today
├── providers.tsx         # client boundary, QueryClientProvider goes here
├── repos/page.tsx
├── settings/page.tsx
├── rate-limits/page.tsx
└── api/
    ├── notifications/route.ts
    ├── repositories/
    ├── thread/
    └── connection/route.ts

components/
├── app-shell.tsx
├── search/command-palette.tsx
└── inbox/

lib/
├── inbox-state.ts        # pure triage math, reused by mutations
├── view-state.ts         # URL filters plus storage helpers
├── filters.ts
├── query-keys.ts         # new, query key factory (planned)
├── queries.ts            # new, query hooks (planned)
└── ui-store.ts           # new, optional zustand UI store (planned)

tests/
├── unit/
├── integration/
└── component/
```

**Structure Decision**: Single Next.js project layout as-is. New client modules live in `lib/` alongside existing pure helpers. No new top-level packages. No `src/` split.

## Complexity Tracking

> **Fill ONLY if Constitution Check has violations that must be justified**

| Violation | Why Needed | Simpler Alternative Rejected Because |
|-----------|------------|-------------------------------------|
| None | No constitution violations. Placeholder constitution has no gates. | N/A |
