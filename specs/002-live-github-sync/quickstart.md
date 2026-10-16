# Quickstart: Live GitHub Sync

Validates the real inbox end to end against the spec and success criteria. Implementation code lives in `tasks.md` and source files, not here.

## Prerequisites

- Bun 1.2 or later (`bun --version`)
- An authenticated `gh` CLI session on the machine running the server (`gh auth status` shows an active account)
- The prototype repository rhythms you want to carry over (first sync snapshots them)
- Empty-or-prototype `data/` directory (gitignored); first sync migrates it, it never mixes seed with live

## Setup and run

```bash
bun install
bun run db:push
bun run dev
```

Open the inbox. The first load triggers the one-way migration (deletes `n_*` seed rows, keeps repository rhythms, discovers live repos) and then a full `all=true` sync. Confirm the header shows a last-synced time.

Useful API probes (read-only except where noted):

```bash
gh auth status
bun run typecheck && bun run lint && bun test
curl -s 'http://localhost:21120/api/connection'
curl -s -X POST 'http://localhost:21120/api/sync' -H 'Content-Type: application/json' -d '{}'
```

Port `21120` is the repo's configured dev port (`bun run dev`); adjust if overridden.

## Validation scenarios

### 1. Live inbox replaces mock data (SC-001, SC-002)

1. Connect via `gh auth login` if needed, load the inbox with 20+ real notifications across 3+ repos.
2. Confirm every row shows repository, subject, reason, and age without opening threads, and repo/type/age/state filters plus counts behave as in the prototype. See [sync-api](./contracts/sync-api.md) for the response shape.
3. Filter to unread, select 20 items, press Done once. Confirm all 20 leave the main flow in one round-trip.
4. Expected: triage completes in under 5 minutes at half the GitHub-website clicks. Seed rows are gone; the Reseed button is hidden.

### 2. Write-back keeps GitHub in agreement (SC-003)

1. Mark 5 live items done, 2 unread, 1 read in the inbox.
2. Within minutes, confirm the GitHub website shows the done/read states and a re-sync plus reload does not resurrect done items. See [data-model](./data-model.md) for the transition rules.
3. Disconnect the network, attempt a Done action, confirm the prior state stays visible with a retry notice and the action lands in the queue depth reported by `POST /api/sync`.
4. Expected: done/read agree with GitHub in 95% of trials; unread rows carry the documented local-only hint because GitHub offers no mark-unread endpoint.

### 3. Digests stay quiet on live data (SC-004, SC-005)

1. Open `/repos`, confirm carried-over rhythms are unchanged and newly discovered watched repos default to weekly.
2. Reload the inbox. Confirm non-due repos sit dimmed and collapsed with pending counts and next due dates, outside the main flow.
3. Set one digest repo to immediate, reload, confirm its group promotes with a due indicator and the next-due date is statable without guidance.
4. Expected: non-due items never enter the main flow; due groups promote within a day of due.

### 4. Stale, limited, and disconnected states (SC-006)

1. With a previously synced inbox, revoke or expire access (or throttle the network), then refresh.
2. Confirm the cached inbox stays readable with a distinct stale/disconnected/limited message, last-synced time, and a retry or reconnect path. Confirm `GET /api/connection` reports `connected: false` with a `gh auth login` hint.
3. Reconnect, refresh, confirm fresh data returns and the queue drains.
4. Expected: 100% of trials show an explicit state with last-synced time, never silent stale-as-fresh.

## Gates

```bash
bun run typecheck
bun run lint
bun test
```

Playwright smoke (fixture mode, no live calls in CI) covers inbox load, bulk Done with queued write-back, digest collapse/promotion on live-shaped rows, and filter persistence. All three commands plus the smoke spec must pass before implementation is accepted.
