# Implementation Plan: Repository Multi-Select with Bulk Context Menu

**Branch**: `007-repo-multi-select` | **Date**: 2026-11-08 | **Spec**: [spec.md](spec.md)

**Input**: Feature specification from `/specs/007-repo-multi-select/spec.md`

## Summary

Add standard multi-select (Ctrl/Cmd-toggle, Shift-range) to the inbox filter sidebar repository rows, plus one combined context menu that applies the existing per-repository actions (snooze, rhythm, mark done/read, copy link) to the whole selection. No new server endpoint: bulk actions fan out through the existing per-repository mutations with the existing confirmation threshold (`BULK_CONFIRM_THRESHOLD = 25`) applied to combined totals. Selection state is page-local UI state owned by `FilterSidebar`; one new pure range helper joins the existing selection helpers in `lib/inbox-state.ts`.

## Technical Context

**Language/Version**: TypeScript (strict) on Bun; React 19 with Next.js 15 App Router

**Primary Dependencies**: TanStack Query (server state + optimistic mutations), Tailwind 4, existing `RepoSnoozeMenu` menu shell/positioning in `components/inbox/repo-snooze-menu.tsx`

**Storage**: N/A (selection is ephemeral client state; repository settings persist through the existing repositories API, unchanged)

**Testing**: vitest unit (`tests/unit/`), vitest component (`tests/component/`), playwright e2e (`tests/e2e/`); local gates `typecheck`, `lint`, `test:unit`, `test:integration`, `test:component`

**Target Platform**: Local-first web app; desktop browsers (mouse + keyboard) plus touch fallback via the existing per-row trigger

**Project Type**: Web application, single project (`app/`, `components/`, `lib/`, `tests/`)

**Performance Goals**: Selection gestures update in the same frame (pure local state, no fetch); bulk fan-out issues one existing request per selected repository in parallel, comfortable for typical sidebar sizes (tens of repos)

**Constraints**: No new server endpoint or schema change; reuse `BULK_CONFIRM_THRESHOLD` for combined totals; full keyboard operability with `aria-pressed` toggle semantics; mobile/touch must not require right-click

**Scale/Scope**: One sidebar component, one menu component, one pure helper, inbox-page fan-out wiring; selection is a client-side `Set<string>` so scale is trivial

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

- **I. Local-First, No Secret Files**: PASS. No new network surface; reuses existing `PATCH /api/repositories/:id` and repo-wide bulk calls. No credentials touched.
- **II. Test-First With Offline Suite**: PASS with obligation. New pure helper gets unit tests; selection + bulk menu get component tests; end-to-end journey gets a playwright spec against the seeded stand-in. No real GitHub contact.
- **III. Simplicity Over Abstraction**: PASS. Selection state is page-local UI state (explicitly allowed), not a store. Bulk menu is a second export in the existing menu file sharing its private helpers, not a new abstraction. One new pure function next to the existing selection helpers. No backend or schema change.
- **IV. Gates Before Merge**: PASS with obligation. All five gates (`typecheck`, `lint`, `test:unit`, `test:integration`, `test:component`) must run; e2e separately.
- **V. Small Reviewable Changes**: PASS. Shaped as two small slices: (1) selection state + gestures + visuals, (2) combined menu + fan-out + confirmations.

No violations; Complexity Tracking does not apply.

**Post-design re-check (2026-11-08)**: design confirms all five gates hold. No new endpoint, store, or schema; selection is page-local state; tests planned at unit, component, and e2e layers. No new violations introduced.

## Project Structure

### Documentation (this feature)

```text
specs/007-repo-multi-select/
├── plan.md              # This file (/speckit-plan command output)
├── research.md          # Phase 0 output (/speckit-plan command)
├── data-model.md        # Phase 1 output (/speckit-plan command)
├── quickstart.md        # Phase 1 output (/speckit-plan command)
├── contracts/           # Phase 1 output (/speckit-plan command)
│   └── sidebar-selection.md
└── tasks.md             # Phase 2 output (/speckit-tasks command - NOT created by /speckit-plan)
```

### Source Code (repository root)

```text
app/
└── page.tsx                      # inbox page: bulk fan-out wiring, combined confirmations
components/inbox/
├── filter-sidebar.tsx            # selection state, modifier click handling, visuals
├── repo-snooze-menu.tsx          # add RepoBulkMenu export sharing existing shell
└── digest-section.tsx            # unchanged (out of scope, see research.md)
lib/
├── inbox-state.ts                # add range-selection pure helper
└── bulk.ts                       # unchanged (threshold reused)
tests/
├── unit/inbox-state.test.ts      # extend: range helper cases
├── component/repo-list-filter.test.tsx  # extend: selection + bulk menu
└── e2e/triage.spec.ts (or new)  # multi-select journey
```

**Structure Decision**: Single-project web app layout; all changes are additive extensions of existing files except the fan-out wiring in `app/page.tsx`. No new directories, stores, routes, or endpoints.

## Complexity Tracking

No constitution violations. Nothing to track.
