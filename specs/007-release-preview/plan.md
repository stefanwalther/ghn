# Implementation Plan: Release Preview in Inbox Drawer

**Branch**: `007-release-preview` | **Date**: 2026-11-08 | **Spec**: [spec.md](spec.md)

**Input**: Feature specification from `/specs/007-release-preview/spec.md`

## Summary

Render release notifications inline in the existing preview drawer instead of the "No preview for releases" fallback. One new view-time fetch helper (`fetchRelease` in `lib/github.ts`) plus one new presentational component (`ReleasePreview`) plug into the established thread-route → React Query → drawer pipeline: the route resolves the release via the live thread URL with a `releases/tag/{tag}` fallback, projects only the spec fields (title/tag, badges, author/date, notes body, assets), and the drawer renders them with the reused `Markdown` treatment. No schema change, no new routes, no new dependencies.

## Technical Context

**Language/Version**: TypeScript 5.7 on Bun; Next.js 15.1 (App Router), React 19.

**Primary Dependencies**: TanStack Query 5 (shared `useThreadDetails` cache), Drizzle ORM, `react-markdown` pipeline (`Markdown`), Tailwind 4, Radix tooltips. No new dependencies.

**Storage**: SQLite via Drizzle (`notifications` table, read-only for this feature). No migration: release data is fetched at view time, never persisted.

**Testing**: `vitest` projects `unit` / `integration` / `component` plus `playwright` e2e. Local GitHub stand-in (`tests/support/github-stand-in.ts`) answers every remote call; `GHN_TOKEN` empty-means-disabled plus the loopback fetch guard keep the suite off the real GitHub. New coverage belongs at its layer: unit for tag/size/format rules, integration for route plus client plus stand-in, component for drawer rendering, e2e for the triage journey.

**Target Platform**: Local web app. `make dev` (hot reload) / `make start` (production serve plus open), default port `21120`.

**Project Type**: Web application, single Next.js project.

**Performance Goals**: One release fetch per thread open (same budget as the existing subject fetch, 10s write-bound / 30s read-bound helpers); React Query `keepPreviousData` skeleton behaviour unchanged; 30-asset lists scroll inside the existing drawer container with no layout break.

**Constraints**: Local-first, no new secrets or bindings (reuse `gh` login / `GH_TOKEN` chain); no new backend state; offline/deleted/forbidden releases show the existing unavailable-plus-link state; suite never contacts real GitHub and never mutates a real account.

**Scale/Scope**: One drawer surface, one API-route branch, one fetch helper, one preview component, additive `release` field on the thread payload. Seeded dataset (~200 notifications across 10 repos) untouched; release rows are per-test fixtures.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

### Pre-research evaluation (2026-11-08)

- **I. Local-First, No Secret Files — PASS.** Design reuses the existing `getStoredToken()` chain and adds no token, file, or binding. `fetchRelease` takes the same `token` parameter as its neighbours and logs nothing.
- **II. Test-First With Offline Suite — PASS.** Plan pins unit/integration/component/e2e coverage before implementation (see quickstart layers); all remote behaviour goes through the extended stand-in; no seed or production-DB mutation.
- **III. Simplicity Over Abstraction — PASS.** One helper plus one presentational component following the `SecurityAlertPreview` precedent; server state stays in React Query, no Zustand, no schema change, rejected alternatives recorded in `research.md` (GraphQL, persisted API URL, commit-resolution fetch, asset pagination).
- **IV. Gates Before Merge — PASS.** `make check` (typecheck, lint, unit, integration, component) plus the coverage ratchet stay the gate; e2e stays post-build per policy. No gate is skipped or redefined.
- **V. Small Reviewable Changes — PASS.** One feature, one route branch, one component; conventional commits; release-please owns the changelog. This plan plus its re-check satisfies the "Constitution Check before research and after design" requirement.

Gate result: **proceed to Phase 0.**

## Project Structure

### Documentation (this feature)

```text
specs/007-release-preview/
├── plan.md              # This file (/speckit-plan command output)
├── research.md          # Phase 0 output (/speckit-plan command)
├── data-model.md        # Phase 1 output (/speckit-plan command)
├── quickstart.md        # Phase 1 output (/speckit-plan command)
├── contracts/           # Phase 1 output (/speckit-plan command)
│   └── thread-release.md
└── tasks.md             # Phase 2 output (/speckit-tasks command - NOT created by /speckit-plan)
```

### Source Code (repository root)

Single Next.js project. Files this feature touches:

```text
app/api/thread/route.ts              # add Release branch (resolve + fetch + project)
lib/github.ts                        # add fetchRelease + release URL parsers
lib/queries.ts                       # ThreadDetailsResponse gains release field
components/inbox/item-drawer.tsx     # derived memo + render branch for release
components/inbox/release-preview.tsx # NEW presentational component (badges, meta, body, assets)
lib/view-state.ts                    # fallback copy update (releases now render)
tests/support/github-stand-in.ts     # serve releases/* subject paths
tests/unit/                          # tag/size/format/unavailable-mapping tests
tests/integration/thread-route.test.ts # resolution order + projection + errors
tests/component/components.test.tsx  # drawer release rendering + triage intact
tests/e2e/                           # built-app release triage journey
```

**Structure Decision**: Single-project web application layout as above. No new top-level directories, no new backend service, no schema migration. The new component sits beside `security-alert-preview.tsx`, the pattern it mirrors.

## Complexity Tracking

No constitution violations to justify. No new abstraction, service, store, or schema is introduced; deviations considered were rejected in `research.md`.

> Post-design re-check (2026-11-08): design as documented above keeps all five gates green. No new state, no new secret handling, no test-layer skipping, no scope expansion beyond the one drawer surface. **Re-check: PASS, no violations.**
