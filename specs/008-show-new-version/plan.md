# Implementation Plan: Sidebar Update Badge with Inline Release Notes

**Branch**: `008-show-new-version` | **Date**: 2026-11-14 | **Spec**: [spec.md](spec.md)

**Input**: Feature specification from `/specs/008-show-new-version/spec.md`

## Summary

Keep the existing bottom-left update badge exactly where it is and teach the update dialog to show what the new version includes. One server-side projection change (`lib/update-check.ts` reads `name`/`body`/`published_at` from the same `releases/latest` response it already fetches) plus one presentational change (`components/update-popover.tsx` renders a scrolling "What's included" section with the shared `Markdown` component) deliver US2 without new endpoints, new auth, new polling, or schema changes. Badge gating, caching, timeout, quiet failure, position, portal, focus, and command blocks stay byte-identical.

## Technical Context

**Language/Version**: TypeScript 5.7 on Bun; Next.js 15.1 (App Router), React 19.

**Primary Dependencies**: `react-markdown` pipeline via `components/inbox/markdown.tsx` (`remark-gfm`, `remark-emoji`, `rehype-raw` + `rehype-sanitize`), Tailwind 4, existing `Button`/`copyText`/`useDialogFocus`. No new dependencies.

**Storage**: None. Update data is view-time only (6h in-memory cache in `lib/update-check.ts`). No SQLite migration, no seed change.

**Testing**: `vitest` projects `unit` / `integration` / `component` plus `playwright` e2e. Local GitHub stand-in (`tests/support/github-stand-in.ts`) answers `releases/latest`; `GHN_DISABLE_UPDATE_CHECK` / `GHN_RELEASES_API_BASE` overrides keep the suite off real GitHub. New coverage belongs at its layer: unit for projection/coercion, integration for route plus stand-in, component for badge + dialog rendering.

**Target Platform**: Local web app. `make dev` (hot reload) / `make start` (production serve plus open), default port `21120`.

**Project Type**: Web application, single Next.js project.

**Performance Goals**: Zero extra network calls (same one `releases/latest` fetch per 6h window); footer still renders the plain version before the check resolves; notes container capped (`max-h-64`, internal scroll) so long changelogs never push commands off-screen.

**Constraints**: Local-first, no new secrets or bindings (reuse `getStoredToken()` chain, never log); offline/disabled/rate-limited checks degrade to plain version with no toast; sanitized Markdown only, never unsanitized HTML; suite never contacts real GitHub.

**Scale/Scope**: One API-route shape extension, one lib projection, one dialog section, one shared-Markdown reuse. Touches only the footer badge surface; inbox drawer, sync, and seed paths untouched.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

### Pre-research evaluation (2026-11-14)

- **I. Local-First, No Secret Files — PASS.** Reuses the existing `getStoredToken()` chain and `GHN_RELEASES_API_BASE` override; adds no token, file, or binding.
- **II. Test-First With Offline Suite — PASS.** Plan pins unit/integration/component coverage before implementation (see quickstart layers); all remote behavior goes through the extended stand-in fixtures; no seed or production-DB mutation.
- **III. Simplicity Over Abstraction — PASS.** One projection extension plus one presentational section following the inbox `Markdown` precedent; server state stays in React state, no Zustand, no schema change, no new fetch layer; rejected alternatives recorded in `research.md` (second fetch, CHANGELOG parse, compare-view fetch, second modal).
- **IV. Gates Before Merge — PASS.** `make check` (typecheck, lint, unit, integration, component) plus the coverage ratchet stay the gate; e2e stays post-build per policy. No gate skipped or redefined.
- **V. Small Reviewable Changes — PASS.** One surface (footer badge + dialog), additive nullable fields only, conventional commits; release-please owns the changelog. This plan plus its re-check satisfies the before/after requirement.

Gate result: **proceed to Phase 0.**

## Project Structure

### Documentation (this feature)

```text
specs/008-show-new-version/
├── plan.md              # This file (/speckit-plan command output)
├── research.md          # Phase 0 output (/speckit-plan command)
├── data-model.md        # Phase 1 output (/speckit-plan command)
├── quickstart.md        # Phase 1 output (/speckit-plan command)
├── contracts/           # Phase 1 output (/speckit-plan command)
│   └── version-with-notes.md
└── tasks.md             # Phase 2 output (/speckit-tasks command - NOT created by /speckit-plan)
```

### Source Code (repository root)

Single Next.js project. Files this feature touches:

```text
lib/update-check.ts                        # extend UpdateInfo + projection (name/body/published_at)
app/api/version/route.ts                   # unchanged (passes through getUpdateInfo)
components/version-indicator.tsx           # pass new fields into UpdatePopover
components/update-popover.tsx              # NEW "What's included" section via Markdown
components/inbox/markdown.tsx              # reused as-is (no change)
lib/app-meta.ts                            # reused GITHUB_REPO_URL for autolinks (no change)
tests/unit/update-check.test.ts            # projection/coercion/cache cases
tests/integration/version-route.test.ts    # route shape + 404/disabled nulls
tests/component/version-indicator.test.tsx # badge + dialog notes/empty/scroll/close cases
tests/support/github-stand-in.ts           # extended release fixtures (no new routes)
tests/e2e/theme.spec.ts                    # structural footer invariants (no new journey)
```

**Structure Decision**: Single-project web application layout as above. No new top-level directories, no new backend service, no schema migration. The dialog change sits inside the existing popover file, mirroring how `ReleasePreview` reused `Markdown` in 007.

## Complexity Tracking

No constitution violations to justify. No new abstraction, service, store, or schema is introduced; deviations considered were rejected in `research.md`.

> Post-design re-check (2026-11-14): design as documented above keeps all five gates green. No new state, no new secret handling, no test-layer skipping, no scope expansion beyond the one footer surface. **Re-check: PASS, no violations.**
