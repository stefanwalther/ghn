# Implementation Plan: Quiet Notifications Prototype

**Branch**: `001-quiet-notifications` | **Date**: 2026-10-15 | **Spec**: [specs/001-quiet-notifications/spec.md](./spec.md)

**Input**: Feature specification from `/specs/001-quiet-notifications/spec.md`

## Summary

Build a local single-user web inbox that mirrors GitHub Notifications triage but cuts clicks: one list with bulk Done/Unread, per-repo digest rhythms (immediate, weekly, biweekly, monthly) rendered as a dimmed collapsed section until due, and a back path that preserves filter and position. MVP uses mocked seed data only, persists digest settings in local SQLite, and follows w5r-design list/detail layout with scarce lime primary, quiet badges, and full light/dark support.

## Technical Context

**Language/Version**: TypeScript 5.x, Bun 1.2+ as runtime and package manager

**Primary Dependencies**: Next.js 15 App Router + React 19, Tailwind CSS v4 with CSS variables, shadcn/ui local primitives (Button, Checkbox, Badge, Card, Collapsible, Select, Separator), lucide-react icons, drizzle-orm with bun:sqlite driver

**Storage**: Local SQLite file `data/quiet-notifications.db` via drizzle-orm. Tables for repositories, digest settings, seeded notifications. No server DB, no sync in MVP.

**Testing**: `bun test` for digest due-date logic and bulk-state transitions, Playwright smoke for inbox load and bulk triage, `bun run typecheck` and `bun run lint` as gates

**Target Platform**: Local dev on macOS, modern Chromium/Safari/Firefox, light/dark/system theme

**Project Type**: Web application, Next.js monolith (App Router pages + Route Handlers for local API)

**Performance Goals**: Inbox first paint with 200 seeded items under 1s on local Bun, bulk action on 20 items applies in one round-trip under 500ms, digest grouping computed server-side per load

**Constraints**: Single-user local only, mocked data in MVP (no GitHub token handling), offline-capable after seed, keyboard operable triage with visible focus rings, semantic w5r tokens only (no raw hex in components)

**Scale/Scope**: 1 user, ~10 repos, ~200 seeded notifications, 2 pages (inbox, repositories), 1 collapsed digest section, 5 Route Handlers

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

Constitution at `.specify/memory/constitution.md` is an unratified placeholder template with no enforceable principles, so there are no gates to violate. Plan proceeds with project-level guards instead:

- [x] Single-user local scope holds, no auth or multi-tenant complexity added
- [x] Mock-only MVP holds, no second live-data path in this cut
- [x] w5r-design token and primary-scarcity rules adopted as UI gates (see research.md)
- [x] Digest logic isolated and unit-tested, UI stays thin

Post-design re-check: PASS, no new violations introduced. No Complexity Tracking entries required.

## Project Structure

### Documentation (this feature)

```text
specs/001-quiet-notifications/
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
├── layout.tsx                 # w5r shell, theme provider, globals.css tokens
├── page.tsx                   # inbox list/detail + collapsed digest section
├── repos/page.tsx             # per-repo digest settings
└── api/
    ├── notifications/route.ts # GET inbox, POST bulk done/unread
    ├── notifications/seed/route.ts # POST reseed mock data (dev only)
    └── repositories/route.ts  # GET list
    └── repositories/[id]/route.ts # PATCH digest rhythm

components/
├── inbox/                     # notification-list, bulk-bar, digest-section
├── repos/                     # digest-select, repo-row
└── ui/                        # shadcn primitives (button, checkbox, badge, etc.)

lib/
├── digest.ts                  # due-date math, grouping, promotion rules
├── seed.ts                    # mock repos + notifications generator
└── view-state.ts              # URL + localStorage inbox state

db/
├── schema.ts                  # drizzle sqlite schema
└── client.ts                  # bun:sqlite connection

data/
└── quiet-notifications.db     # local sqlite file (gitignored)

tests/
├── unit/digest.test.ts
└── e2e/inbox.spec.ts
```

**Structure Decision**: Single Next.js App Router project at repo root. No separate backend/frontend split. Route Handlers own SQLite access, pages stay server-first with small client islands for selection and collapsed state. This matches the existing stack preference and keeps the MVP to one deployable unit.

## Complexity Tracking

> No violations to justify. Single project, no extra patterns.

| Violation | Why Needed | Simpler Alternative Rejected Because |
|-----------|------------|-------------------------------------|
| — | — | — |
