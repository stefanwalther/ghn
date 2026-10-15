# Research: Quiet Notifications Prototype

**Feature**: specs/001-quiet-notifications/spec.md
**Date**: 2026-10-15

All Technical Context unknowns resolved. No NEEDS CLARIFICATION remains.

## R1: Next.js App Router + Bun + TypeScript monolith

- Decision: Next.js 15 App Router with React 19 and TypeScript 5, run and installed via Bun, single project with Route Handlers for local API.
- Rationale: Matches user stack preference and keeps pages plus SQLite access in one unit. Server Components render the inbox fast, small client islands own checkbox selection and collapsed digest state.
- Alternatives considered: Separate Vite frontend plus Bun server (rejected, two processes for a single-user local tool), Next.js pages router (rejected, App Router is current and fits list/detail streaming).

## R2: SQLite access via drizzle-orm + bun:sqlite

- Decision: drizzle-orm with the bun:sqlite driver, file at `data/quiet-notifications.db`, schema in `db/schema.ts`, migrations or push for MVP.
- Rationale: Type-safe queries, zero native build step under Bun, file persists digest settings across restarts as required by FR-009. Single-user writes avoid concurrency concerns.
- Alternatives considered: better-sqlite3 directly (rejected, extra native binding under Bun), Prisma SQLite (rejected, heavier codegen for 3 tables), localStorage only (rejected, cannot hold 200 seeded items cleanly nor query by repo and due date).

## R3: w5r-design token application

- Decision: Mirror tweakcn w5r CSS variables verbatim into `app/globals.css` (`:root` and `.dark`), Tailwind v4 `@theme inline` mapping, semantic classes only in components (`bg-card`, `text-muted-foreground`, `bg-primary`, `bg-muted`).
- Rationale: Foundation and tokens references require verbatim tokens, scarce lime primary (one solid primary per region), quiet `muted` count badges, `accent` nav selection, `cursor-pointer` plus subtle hover and `focus-visible` ring on every clickable.
- Alternatives considered: Stock shadcn theme (rejected, violates w5r identity and blue-primary rule), raw hex per component (rejected, causes dark-mode drift).

## R4: Digest due-date math and promotion rule

- Decision: Store `rhythm` (immediate, weekly, biweekly, monthly) plus `lastPromotedAt` and `nextDueAt` per repo in local time. Weekly adds 7 days, biweekly 14 days, monthly adds one calendar month from last promotion. `lib/digest.ts` computes `isDue(now)` and groups inbox into `mainFlow` (immediate plus due digests) and `collapsedSection` (non-due digests). Changing a repo to immediate sets `nextDueAt` to now so pending promotes on next load.
- Rationale: Implements FR-007, FR-008, FR-013 as decided in Q2 Option C with one testable function. Local timezone keeps week boundaries explainable and displayable as SC-003 requires.
- Alternatives considered: Cron-driven promotion (rejected, overkill for local MVP, compute on load instead), UTC week buckets (rejected, harder to explain next-due dates to the user).

## R5: Inbox view-state round-trip

- Decision: Filter (repo, state) lives in URL search params so back navigation and reload restore it. Checkbox selection lives in ephemeral client state and clears after bulk action. Scroll position restores via `history.scrollRestoration` plus anchor to last-opened item id. Source links open in a new tab (`target=_blank`), prototype tab keeps state untouched, satisfying FR-005 and FR-011 without fragile window messaging.
- Rationale: Simplest reliable "Back to notifications" for MVP with mock data. No postMessage bridge needed until live GitHub embed arrives.
- Alternatives considered: Full view-state in localStorage only (rejected, breaks shareable filtered URLs), same-tab navigation with manual stack (rejected, loses position more often).

## R6: Mock seed shape

- Decision: `lib/seed.ts` generates 3 owned immediate repos plus 7 watched repos across weekly, biweekly, monthly rhythms, 200 notifications with subject, reason (mention, review_requested, ci_failed, assign), age spread over 45 days, read/done flags, and stable fake source URLs (`https://github.com/<owner>/<repo>/pull/<n>#discussion_r<k>`).
- Rationale: Proves SC-001, SC-002, SC-004 deterministically and gives the digest section real pending counts on first run.
- Alternatives considered: Hand-written fixture JSON (rejected, tedious to reach 200 items with date spread), live GitHub fetch in MVP (rejected by Q3 decision, explicit follow-up).

## R7: Testing approach

- Decision: `bun test` for `lib/digest.ts` (due boundaries, monthly edge like Jan 31, rhythm switch to immediate) plus bulk transition unit tests. Playwright single smoke spec for inbox load, bulk select and done, digest collapse and promote. `tsc --noEmit` and eslint as gates.
- Rationale: Covers the two riskiest logics (dates and bulk) with fast unit tests, proves the click-reduction claim manually via quickstart without a heavy suite for a prototype.
- Alternatives considered: Vitest only (rejected, Bun test is native to chosen runtime), full coverage gate (rejected, prototype scope).
