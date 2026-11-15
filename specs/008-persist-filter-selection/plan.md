# Implementation Plan: Persist Filter Selection

**Branch**: `008-persist-filter-selection` | **Date**: 2026-11-14 | **Spec**: [spec.md](spec.md)

**Input**: Feature specification from `/specs/008-persist-filter-selection/spec.md`

## Summary

Remember the inbox filter set (`repo`, `state`, `type`, `age`) in `localStorage` (`ghn:inbox-filters`, versioned JSON) so a bare visit to `/` restores the last explicit choice with no click. URL stays canonical: any non-empty query string renders verbatim and overwrites memory; restore only fires on empty query via `router.replace`. Pure client change in `lib/view-state.ts` plus wiring in `app/page.tsx`; no API, DB, schema, or URL-format change. Pattern reuses `loadFilterWidth`/`saveFilterWidth` guards.

## Technical Context

**Language/Version**: TypeScript (strict) on Bun; React 19 with Next.js 15 App Router

**Primary Dependencies**: Next.js `useRouter`/`useSearchParams` + `router.replace(..., {scroll:false})`, existing `parseInboxFilters`/`serializeInboxFilters` in `lib/view-state.ts`, TanStack Query (unchanged fetch keyed by filters)

**Storage**: `localStorage["ghn:inbox-filters"]` = `{version: 1, filters: InboxFilters}`; `localStorage` (survives restarts) with try/catch fail-open, same as `ghn:filter-width` / `ghn:filter-sections`

**Testing**: vitest unit (`tests/unit/view-state.test.ts`), vitest component (existing inbox suites), playwright e2e (new `tests/e2e/inbox-filter-persistence.spec.ts`); local gates `typecheck`, `lint`, `test:unit`, `test:integration`, `test:component`

**Target Platform**: Local-first web app; desktop browsers with private-mode storage failures tolerated

**Project Type**: Web application, single project (`app/`, `components/`, `lib/`, `tests/`)

**Performance Goals**: Zero blocking on storage; restore is one `router.replace` on bare entry only. No extra fetch except the single replaced-URL refetch already inherent to changing filters.

**Constraints**: URL is canonical and shareable (constitution III); no new endpoint/store/schema; fail open on blocked/corrupt storage; hydration-safe (server renders defaults, client restores); `repo` not validated against facets at restore.

**Scale/Scope**: Two files changed (`lib/view-state.ts`, `app/page.tsx`), one new e2e spec, unit tests extended. Four-string payload.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

- **I. Local-First, No Secret Files**: PASS. No network surface, no credentials, no secret files. Pure browser preference.
- **II. Test-First With Offline Suite**: PASS with obligation. Unit tests for load/save/validation; e2e for bare-restore, explicit-wins, corrupt-fallback against seeded stand-in. No real GitHub contact.
- **III. Simplicity Over Abstraction**: PASS. Two functions beside existing width/last-opened helpers; wiring is two small effects in the existing inbox component. No store, no backend, no new abstraction. URL remains canonical; storage only supplies bare-entry defaults.
- **IV. Gates Before Merge**: PASS with obligation. `typecheck`, `lint`, `test:unit`, `test:integration`, `test:component` plus e2e separately.
- **V. Small Reviewable Changes**: PASS. One client preference slice; no multi-story split needed.

No violations; Complexity Tracking does not apply.

**Post-design re-check (2026-11-14)**: design confirms all five gates hold. No endpoint, store, or schema added; validation reuses `parseInboxFilters` allow-lists; tests planned at unit + e2e with existing suites as regression net. No new violations introduced.

## Project Structure

### Documentation (this feature)

```text
specs/008-persist-filter-selection/
├── plan.md              # This file (/speckit-plan command output)
├── research.md          # Phase 0 output (/speckit-plan command)
├── data-model.md        # Phase 1 output (/speckit-plan command)
├── quickstart.md        # Phase 1 output (/speckit-plan command)
├── contracts/           # Phase 1 output (/speckit-plan command)
│   └── filter-memory.md
└── tasks.md             # Phase 2 output (/speckit-tasks command - NOT created by /speckit-plan)
```

### Source Code (repository root)

```text
app/
└── page.tsx                      # restore-on-bare-entry effect + persist-on-change effect
lib/
└── view-state.ts                 # add loadInboxFilters/saveInboxFilters + INBOX_FILTERS_KEY
tests/
├── unit/view-state.test.ts       # extend or create: round-trip, validation, corrupt, throw
└── e2e/inbox-filter-persistence.spec.ts  # new: bare restore, explicit wins, corrupt fallback
```

**Structure Decision**: Single-project web app layout; additive change to one lib module plus two effects in the existing inbox client component. No new routes, components, stores, or server code.

## Complexity Tracking

No constitution violations. Nothing to track.
