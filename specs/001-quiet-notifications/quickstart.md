# Quickstart: Quiet Notifications Prototype

Validates the MVP end to end against the spec and success criteria. Implementation code lives in `tasks.md` and source files, not here.

## Prerequisites

- Bun 1.2 or later (`bun --version`)
- macOS or Linux with a modern browser
- Empty `data/` directory (gitignored, created on first seed)

## Setup and run

```bash
bun install
bun run db:push
bun run db:seed
bun run dev
```

Open [http://localhost:3000](http://localhost:3000) for the inbox and [http://localhost:3000/repos](http://localhost:3000/repos) for digest settings.

## Validation scenarios

### 1. Bulk triage cuts clicks (SC-001, SC-002)

1. Load the inbox with 200 seeded items across 10 repos.
2. Filter to unread, select 20 items via checkboxes, press Done once.
3. Confirm all 20 leave the main flow, selection clears, and the action took one round-trip.
4. Expected: full pass finishes in under 5 minutes without opening source threads. See [inbox-api](./contracts/inbox-api.md) for the bulk shape.

### 2. Digest collapse and promote (SC-003, SC-004)

1. Open `/repos`, set one watched repo to weekly and one to monthly.
2. Reload the inbox. Confirm both repos sit in the dimmed collapsed section with pending counts and next due dates, outside the main flow.
3. Advance the digest clock or set rhythm to immediate, reload, confirm the group promotes with a due indicator.
4. Expected: non-due items never enter the main flow in seeded runs. See [digest-api](./contracts/digest-api.md) and [data-model](./data-model.md) for grouping rules.

### 3. Back to notifications keeps place (FR-005, FR-011)

1. Apply a repo filter, open a source link (new tab), return to the prototype tab.
2. Confirm the same filter, collapsed state, and scroll position remain.
3. Expected: no lost filter or position across three round-trips.

### 4. w5r-design and empty states

1. Toggle light and dark mode. Confirm hover and focus rings stay visible, lime primary appears at most once per region, counts stay muted.
2. Mark everything done. Confirm the explicit empty state, not a blank page.
3. Expected: matches list/detail, badge, and affordance rules in `research.md` R3.

## Gates

```bash
bun run typecheck
bun run lint
bun test
```

All three must pass before `$speckit-tasks` output is accepted for implementation.
