# Phase 0 Research: Automated Test Suite

**Feature**: [004-test-suite](./spec.md) | **Branch**: `t3/specify-comprehensive-testing` | **Date**: 2026-10-20

All decisions below were verified against this repository by reading the source and by executing the existing suite. No decision rests on assumption alone.

---

## D1: Unit and integration test runner

**Decision**: Vitest 5.0.5 running on the Node runtime, replacing `bun test` as the unit and integration runner. Playwright remains the end-to-end runner.

**Rationale**: Three of the spec's MUST requirements are not reachable with Bun's built-in runner, and each failure is structural rather than a tuning problem.

| Requirement | Bun 1.3.10 | Vitest 5 on Node |
|---|---|---|
| FR-016 / SC-005: coverage names every source file, including ones with no checks | **Fails.** `bun test --coverage` lists only the 18 files that were loaded. Verified locally: 18 of 58 source files appeared at the time, out of 58. `app/page.tsx`, all 11 `app/api/**/route.ts` handlers, 14 of 17 `components/**` files, `db/client.ts` and `lib/clipboard.ts` are absent, because Bun only instruments imported modules. There is no "include untested files" option; `coveragePathIgnorePatterns` only subtracts. | **Passes.** `coverage.include` globs define the file set and the v8 provider enumerates every one of them, tested or not. (`coverage.all` existed in Vitest 4 and was removed in Vitest 5, where `include` alone does the job.) Verified: every source file listed, with the untested ones explicitly at 0% lines. |
| FR-009 / FR-007: never shell out to a real credential helper | **Fails.** `mock.module("bun", ...)` does not intercept the `await import("bun")` inside `lib/github.ts:48-55`. Verified: the real `gh auth token` subprocess ran and returned a live token. Documented Bun limitation (oven-sh/bun#26591). | **Passes.** `vi.mock("bun", ...)` intercepts the dynamic import. Verified working on both runtimes. |
| FR-012 / SC-003: per-file isolation, order-independent | **Fails.** The ESM module registry is shared across test files in every mode (`--isolate` and `--parallel` included). Verified: a module-level array read `["first","second"]` in the second file. This directly hits `lib/github.ts`, which holds two module-level `Map` caches (`prMergedByApiUrl`, `subjectStateByApiUrl`) with no reset function. | **Passes.** Vitest resets the module registry per test file by default. Verified: the second file saw a fresh module. |

Two further points favour Vitest. Per-file isolation protects the module-level caches in `lib/github.ts` and `lib/sync.ts` without needing production-code reset hooks. And `coverage.thresholds.autoUpdate` gives the ratchet its upward half directly.

**Alternatives considered**:

- *Stay on `bun test` and accept partial coverage reporting.* Rejected: it cannot satisfy FR-016, which is a stated MUST, and the coverage view is what makes the remaining gap visible.
- *Stay on `bun test` and add a hand-rolled coverage file lister.* Rejected: it duplicates the coverage tool's job, reports a different metric than the tool does, and still leaves FR-012 and FR-009 broken.
- *Run Vitest on the Bun runtime.* Verified working (111 of 111 tests pass), but undocumented, its v8 provider silently reports 0% for everything, and jsdom fails during environment setup. Node is the supported path and the v8 provider works natively.
- *Move to Jest.* Rejected: slower, no coverage that enumerates untested files by default, and no native multi-environment projects.

**Consequences**: 14 import lines change from `bun:test` to `vitest`. One existing test needs a body change for correctness rather than tooling (`tests/unit/sync.test.ts` builds `new Response("[]", { status: 304 })`, which Node's undici rejects with a body; the body must be `null` for 304). The `tsconfig.json` sets `"jsx": "preserve"` for Next.js, which breaks Vite's transform of `.tsx`; the Vitest config overrides it with `oxc.jsx.runtime: "automatic"`. Vite 8 uses Rolldown/oxc, so the older `esbuild.jsx` knob is silently ignored.

**Migration cost**: measured at 111 of 111 tests passing under Vitest with two small shims (D2, D10).

---

## D2: SQLite access under the Node runtime

**Decision**: `node:sqlite` plus the `drizzle-orm/sqlite-proxy` driver, which already ships inside the installed `drizzle-orm`, for every test that needs a database. The application keeps using `bun:sqlite` in production.

**Rationale**: `db/client.ts:1` imports `bun:sqlite`, and every API route does `await import("@/db/client")` at request time, so any integration test that exercises a route fails to load under Node. The proxy driver lets the same Drizzle schema and the same query code run on `node:sqlite`.

The proxy expects **positional** rows rather than objects. The session must therefore map each result row through the statement's column list. Verified: insert, select, update and delete all work through the proxy and the row objects map correctly onto the Drizzle schema.

`scripts/push.ts:ensureSchema(sqlite)` is the reusable seam that creates the full schema in any handle, including an in-memory one, and it already backs the existing `tests/unit/sync.test.ts` factory.

**Alternatives considered**:

- *`better-sqlite3` with `drizzle-orm/better-sqlite3`.* A genuine drop-in: the two Drizzle drivers are direct ports of each other. Rejected because it needs a native prebuild download on every machine and in CI, which is a new failure mode for a suite whose whole point is to run anywhere.
- *Keep `bun:sqlite` and run the database-backed tests under `bun test` alongside Vitest.* Rejected: two runners means two coverage reports, and the coverage requirement is one merged view.

---

## D3: Environment seams in production code

**Decision**: Four environment variables become the test seams. Each is a small, additive change that has a sensible production default.

| Variable | Default | Effect | Touches |
|---|---|---|---|
| `GHN_TOKEN` | unset | Overrides the credential lookup. An explicitly empty value means **no token at all**, not "fall back to `gh`". | `lib/github.ts` `readToken` |
| `GHN_API_BASE` | `https://api.github.com` | Base URL for every GitHub call. Empty string is treated as unset. | `lib/github.ts`, `lib/rate-limits.ts` |
| `GHN_DB_PATH` | `./data/quiet-notifications.db` | Database file path. The `globalThis` cache is keyed on the resolved path so a changed path cannot hand back a handle to a different file. | `db/client.ts`, `scripts/push.ts` |
| `GHN_NOW` | unset (real clock) | Frozen instant for every time-dependent decision. | new `lib/clock.ts` |

**Rationale for `GHN_TOKEN` living in `readToken` rather than `getStoredToken`**: `probeConnection` (`lib/github.ts:68`) calls `readToken` directly. Overriding only the exported wrapper would make the connection probe disagree with the sync path. The override must sit at the single point where the credential is read.

**Rationale for "empty means no token"**: `gh` is authenticated on the maintainer's machine. A suite that shells out to `gh auth token` on that machine reaches the real account. The override has to be able to express "no credential", otherwise the guarantee in FR-007 cannot be made at all. Without the override, a connected `POST /api/sync` performed a live read of the real account and wrote 1637 notifications and 59 repositories into a throwaway database.

`lib/contributions.ts` is the one path the token override does not cover, because `getViewerLogin` and `fetchDayCount` shell out to `gh api user` and `gh api graphql` and so bypass `lib/github.ts` entirely. It also reached the real account. It must be refactored to `fetch` against `apiBase()` and `graphqlUrl()`, which both the stand-in and `GHN_API_BASE` then cover.

**Rationale for `GHN_NOW`**: the dataset, the API's "now" and the browser's clock must agree. Pinning only the seed is not enough. The API filters with `matchAge(row.createdAt, Date.now(), ageFilter)` at request time, so a dataset seeded at a frozen instant and read 24 hours later shifts every age bucket: the 24h bucket drops from 4 rows to 0. The seed also sets `nextDueAt` relative to the seed instant, so the set of visible rows changes as the seeded database ages. Both sides have to be pinned.

The override belongs in a new `lib/clock.ts` exporting `nowMs()`, so there is exactly one place that reads the clock and every call site is explicit about it. `Date.now()` is replaced with `nowMs()` in the six routes that compute filters or due dates, plus `lib/seed.ts` and `lib/contributions.ts`.

**Alternatives considered**:

- *Inject the token as a function parameter through every call chain.* Rejected: it touches a large number of call sites for a value that is genuinely ambient.
- *Set `GH_TOKEN` or a `GH_HOST` variant.* Rejected: the `gh` CLI's own variables mean different things, and reusing them invites a mismatch between what the test thinks it configured and what the CLI does.

---

## D4: The GitHub stand-in

**Decision**: One stand-in module on `node:http`, used two ways: in-process by Vitest integration tests, and as a standalone process by Playwright.

**Rationale**: The same behaviour has to be reachable from both layers, and duplicating the scripted responses would mean the two layers test different things. `node:http` runs unchanged under Vitest on Node and as a Bun process.

The stand-in must script the full endpoint surface the application calls. Verified inventory, with the response shapes the app parses:

| Method | Path | Response needed |
|---|---|---|
| GET | `/user` | `{ login }` |
| GET | `/notifications` | thread array, plus `last-modified`, `x-poll-interval`, and a `link` header with `rel="next"` for pagination |
| GET | `/notifications/threads/{id}` | one thread object |
| PATCH | `/notifications/threads/{id}` | 200/204/205 |
| DELETE | `/notifications/threads/{id}` | 200/204/205 |
| PUT | `/notifications/threads/{id}/subscription` | 200, `{ ignored: true }` |
| GET | `/repos/{owner}/{repo}` | 200 or 404 |
| GET | `/repos/{owner}/{repo}/pulls/{n}`, `/issues/{n}` | `{ title, body, state, draft, merged, user: { login }, html_url, head: { sha } }` |
| GET | `/repos/{owner}/{repo}/issues/{n}/comments` | `[{ user: { login }, body, created_at }]` |
| GET | `/repos/{owner}/{repo}/actions/runs` | `{ workflow_runs: [...] }` |
| GET | `/repos/{owner}/{repo}/commits/{sha}/status` | `{ statuses: [{ state }] }` |
| GET | `/repos/{owner}/{repo}/commits/{sha}/check-runs` | `{ check_runs: [{ status, conclusion }] }` |
| GET | `/search/repositories` | any 200 JSON |
| POST | `/graphql` | `{ data: { viewer: { login } } }` or the contributions calendar |

Every response carries the four `x-ratelimit-*` headers, because `lib/rate-limits.ts:68-87` reads nothing else.

The `link` pagination header must be built from the request's `Host` header, not from a reconstructed origin. The stand-in binds an ephemeral port, and building the origin without the port sends the follow-up request to port 80, where it fails as a network error rather than a test assertion.

**Scripted failure modes** (FR-008): success, 401, 403 with `x-ratelimit-remaining: 0` (rate limited), 403 without it (auth error), 404, 500, and a delayed response for the timeout path. `lib/github.ts:37-46` `classifyStatus` already distinguishes these, so the stand-in only has to produce them.

**Alternatives considered**:

- *Record and replay real GitHub responses.* Rejected: it needs a real credential to record, leaks real account data into the repository, and cannot produce the failure modes on demand.
- *Mock at the `fetch` level instead of running a server.* Rejected for the e2e layer: the browser process talks to the application server, which talks to GitHub. The stand-in has to be reachable over HTTP for that path. For the unit layer, the existing `Bun.serve` stubs already work and are cheaper.

---

## D5: Deterministic dataset

**Decision**: One dataset, expressed once in `lib/seed-data.ts` in GitHub thread shape, consumed by both the database seeder and the stand-in.

**Rationale**: The current seed and a live sync disagree about repository identifiers. `lib/sync.ts:8-10` `repoIdForFullName("acme/web")` produces `"acme--web"`, while `lib/seed.ts:14` hardcodes `"acme-web"`. A database that was seeded and then synced therefore hits `UNIQUE constraint failed: repositories.full_name` and `POST /api/sync` returns 500. That is a latent production bug, not just a test problem, and it surfaces the moment the suite drives a real sync.

The same investigation found that a connected sync destroys the seeded dataset: `migrateSeedToLive` (`lib/sync.ts:79-86`) deletes every row whose id starts with `n_`, `pruneEmptyRepositories` (`lib/sync.ts:88-97`) then deletes the now-empty seed repositories, and the live repositories come back with different ids and a `weekly` rhythm for every watched repository. Measured: 51 visible rows and 10 repositories before the sync, 1 row and 1 repository after.

Both problems have one fix: derive the seed's repository ids from `repoIdForFullName`, and express the dataset in the thread shape the sync path already consumes. Verified after the fix: a full sync against the stand-in leaves the dataset byte-identical, and the repository table is unchanged.

The dataset also needs an explicit age ladder. Measured against the current seed with a frozen instant of 2026-01-15T12:00:00Z and `TZ=UTC`: the 24h and 48h filters show **zero** rows, because all four recent items land in repositories that are not due. An e2e assertion of "the 24h filter shows N rows" would then be satisfied by an empty list and prove nothing. The ladder places a known, non-zero number of items in each age bucket, and places the recent ones in the three `immediate` repositories so they are visible.

`subjectType` must also be set. `lib/seed.ts` never sets it, so the `pull_request` filter matches nothing, and the `PR` badge in `components/inbox/notification-list.tsx:172-174` never renders. The existing e2e assertion at `tests/e2e/inbox.spec.ts:143` expects `total > 0` for that filter and therefore fails against a seeded database. It passes today only because the maintainer's live database holds real GitHub rows. `pr_merged` must be set only on `PullRequest` items, because `lib/github.ts:550-552` records the merged flag only for that subject type, and a seed that disagrees with the sync path cannot survive a sync.

**Frozen instant**: `2026-01-15T12:00:00Z` with `TZ=UTC`. Mid-month, mid-year, and clear of the year boundary. The `year` filter uses `startOfYear` (`lib/filters.ts:101-104`), which is local-time based, so `TZ=UTC` is required: the boundary shifts by 8 hours in `America/Los_Angeles` and by minus one hour in `Europe/Vienna`, and an item near the boundary would flip between `year` and `older`.

**Alternatives considered**:

- *Freeze the clock only in the browser.* Rejected: the API computes the age buckets server-side, so a browser-only freeze changes nothing.
- *Keep the seeded dataset and skip the sync path in e2e.* Rejected: sync is one of the five core journeys, and skipping it leaves the largest write path untested.

---

## D6: End-to-end execution

**Decision**: Playwright drives a production build on a dedicated port, against an isolated database that is reset in place before every test.

**Rationale for a production build**: `next build` measured 8.4 seconds on this machine (2.9 seconds of compilation, six static pages, fourteen routes). The cost is negligible and it buys three things. `NODE_ENV=production` exercises the 403 on `POST /api/notifications/seed` (`app/api/notifications/seed/route.ts:7-9`), which proves the script-based seeding path is the one that works. The dev server compiles routes on first request, so the port accepts connections before `/api/notifications` is ready, which is a classic source of first-test flakes. And the build doubles as a compile gate.

**Rationale for dedicated ports**: 21120 is the maintainer's dev server port, and the current `playwright.config.ts` has `reuseExistingServer: true`. Locally that silently points the e2e at the real database. The e2e uses 21140 for the application and 21141 for the stand-in, the same locally and in CI, which is what FR-025 requires.

**Rationale for resetting in place rather than deleting the file**: the running Next server holds an open handle on the database file. Unlinking it leaves the server reading the old inode and it keeps serving stale data. Resetting by dropping and recreating the tables in place is visible to the running server immediately, because WAL mode makes the cross-process write visible. Verified working against a live server: seed, mutate through `POST /api/notifications/bulk`, reset from a second process, and the server served the fresh dataset.

**Rationale for seeding by script rather than through the API**: the seed route returns 403 in production, so a production-mode e2e run must seed by script. `scripts/e2e-reset.ts` does this, and a Playwright fixture runs it before every test so no spec can forget it.

**Trace and artifact settings**: `trace: "retain-on-failure"` rather than `on-first-retry`. With one retry in CI, `on-first-retry` records nothing on the first failure, which is the failure a developer actually reads.

**Alternatives considered**:

- *Run the e2e against the dev server.* Rejected for the first-request compilation race and the loss of the production-mode seed-route check.
- *Run the e2e in parallel.* Rejected: the shared database means parallel specs would reset each other's data. `fullyParallel: false` and `workers: 1` cost little at this suite size.

---

## D7: Coverage ratchet

**Decision**: The merge-time run computes the merge base's coverage in a second worktree inside the same job, and compares the two `coverage-summary.json` files.

**Rationale**: For a solo-maintainer project the alternatives all trade reliability for a small amount of CI time.

- *Committing a baseline JSON to `main`* needs a bot with push rights or a chore commit on every merge, and the baseline lags `main` by one commit.
- *Downloading the last successful `main` run's artifact* depends on artifact retention and on a second workflow run existing, and needs an action that is not in the repository today.
- *Computing the base coverage in a worktree* needs no bot, no push, and no artifact dependency. The baseline is recomputed from source every time, so it can never drift from the code it describes. The extra cost is one `bun install` against a warm cache and one extra test run, well under a minute.

The comparison is the arithmetic on `total.lines.pct` from each summary file. Istanbul already rounds to two decimals, so comparing the rounded values is exact and no epsilon is needed.

**Three outcomes, not two**: `pass`, `fail`, and `not evaluable`. The not-evaluable case is expected and common, not an edge case. The first pull request that introduces the suite has a merge base with no Vitest configuration and no coverage output, so there is nothing to compare against. The spec requires that to be reported, not failed.

**What the ratchet catches, and what it does not**: measured against the merge base's coverage computed with the merge base's own tests, it catches a pull request that deletes tests or adds uncovered code. It does not catch a pull request that adds a large amount of well-tested code alongside a smaller amount of uncovered code, because the added tests push the head figure above the base figure. The stricter variant measures the base with the head's test suite against the base's source. That is a different and more expensive job, and the spec's wording does not require it. The literal reading ships.

---

## D8: Testing `app/page.tsx`

**Decision**: Extract the pure decision logic out of the 628-line page into `lib/`, test those functions directly, and add a small number of React Testing Library tests for the wiring the extraction cannot cover.

**Rationale**: the behaviour that matters is mostly pure decision logic that currently lives inside closures over component state. That code is impossible to test in isolation and, through the DOM, requires a full render that fires eleven effects, a one-second interval, three fetches, and clipboard and scroll interactions at once. Every assertion would be timing-dependent, and a failure would point at "the inbox page" rather than at a behaviour. FR-014 and SC-007 require a failure to name the broken behaviour and its location.

The extraction candidates, with current line numbers:

| Current location | Proposed function | Target module |
|---|---|---|
| `app/page.tsx:142-147` | `syncErrorMessage(reason)` | `lib/sync-errors.ts` |
| `app/page.tsx:208-246` | `selectByQuickFilter(items, reason)` | `lib/filters.ts` |
| `app/page.tsx:310-322` | `applyLocalAction(items, ids, action)` | `lib/inbox-state.ts` |
| `app/page.tsx:192-206` | `nextSelection(items, selected)` | `lib/inbox-state.ts` |
| `app/page.tsx:340-355` | `nextFocusIndex(count, current, delta)` | `lib/inbox-state.ts` |
| `app/page.tsx:184-186` | `pollWindow(lastSyncAt, pollSecs, nowMs)` | `lib/inbox-state.ts` |

The remaining wiring tests: the page fetches and renders the list, a filter click calls `router.replace` with the right query string, Escape closes the drawer, and a bulk action posts to the right endpoint. Each needs a stubbed `fetch`, a mocked `next/navigation` (`useRouter` and `useSearchParams` are the only two used), and stubs for `window.matchMedia`, `Element.prototype.scrollIntoView`, `window.open`, `window.scrollTo` and `navigator.clipboard`. `app/page.tsx` does not import `next-themes`, so a page-level test needs no `ThemeProvider`.

The keydown effect at `app/page.tsx:380-458` has no dependency array and re-registers its listener on every render. Adding dependencies or wrapping the handler in `useCallback` is a small fix that also makes the effect testable.

**Layer boundary**:

| Layer | Owns |
|---|---|
| `lib/` unit tests | the extracted pure functions and the existing `lib/filters.ts`, `lib/digest.ts`, `lib/sync.ts`, `lib/queue.ts` rules |
| RTL component tests | the page's fetch-then-render contract, the router calls, the keyboard handlers, the drawer lifecycle |
| Playwright e2e | the five core inbox journeys, the three views, the write journeys |

**Alternatives considered**:

- *Test the page component only.* Rejected for the timing and attribution reasons above.
- *Extract only.* Rejected: it leaves the wiring untested, and the wiring is what broke in the past. The e2e layer covers the journey end to end; the component layer covers the seams the e2e cannot reach cheaply.

---

## D9: Component DOM environment

**Decision**: `happy-dom` for the component project, with `jsdom` as the fallback.

**Rationale**: happy-dom is verified working with React Testing Library and React 19, and is materially faster than jsdom, which matters for the component layer that will hold the most checks. Under Node both work; under the Bun runtime only happy-dom works, because jsdom fails during environment setup with `TypeError: 'addEventListener' called on an object that is not a valid instance of EventTarget`. Choosing happy-dom keeps the door open on the runtime question in D1 without reopening it.

**Consequences**: `environmentMatchGlobs` was deprecated in Vitest 3 and removed in Vitest 4, so the node and DOM environments are split with `test.projects` rather than globs. This is verified working.

---

## D10: Layer naming and the local command surface

**Decision**: Three layers, named `unit`, `integration` and `component`, plus `e2e` as a fourth runner that is invoked separately. The Makefile exposes a `test` target for the full suite and one target per layer.

**Rationale**: FR-003 asks for three distinct layers by what they exercise. `unit` covers the extracted pure rules. `integration` covers the service and storage layers together: routes, the database, the write-back queue, the sync orchestration. `component` covers React client components in a DOM. `e2e` is not a fourth kind of check but a fourth way to run: it is the assembled application, so it stays with Playwright and is invoked by its own target.

This split is what makes FR-004 satisfiable. Each layer runs on its own, and every run reports which layers it executed, so a partial run is never mistaken for a full one.

The layer boundaries also decide the environment per layer: `unit` and `integration` run in the `node` environment, `component` runs in `happy-dom`.

---

## Open items carried into the implementation phase

These are not design questions. They are spikes to run first, because the plan depends on their outcome.

1. **Verify happy-dom with React 19 and React Testing Library under Vitest on Node.** D9 rests on happy-dom working with React 19, which was verified under `bun test` rather than under Vitest on Node. If it fails there, fall back to jsdom, which was verified working under Node.
2. **Verify the `node:sqlite` plus `drizzle-orm/sqlite-proxy` shim against the full schema.** D2 was verified with insert, select, update and delete. It has not been exercised against every table, every index, or the `onConflictDoNothing` call in `lib/seed.ts`, which matters because `muted_subjects` has no primary key and no unique index, so `onConflictDoNothing` cannot actually deduplicate.
3. **Verify the coverage provider reports the `globalThis`-cached database client.** `db/client.ts` caches on `globalThis`, and the `globalThis` object is not reset between Vitest test files in the same worker. The database path cache key added in D3 addresses the wrong-database problem, but the coverage instrumentation of a module evaluated only once per worker needs confirming.

---

## Defects found during research

These are production bugs surfaced by the investigation. They are not test-suite scope, and each needs its own decision about whether to fix in this feature or separately.

| Defect | Location | Effect |
|---|---|---|
| Seeded repository ids disagree with sync-derived ids | `lib/seed.ts:14` uses `"acme-web"`, `lib/sync.ts:8-10` produces `"acme--web"` | A seeded-then-synced database raises `UNIQUE constraint failed: repositories.full_name` and `POST /api/sync` returns 500. |
| `subjectApiUrlFromHtml` and `subjectCommentsUrlFromHtml` hardcode `https://api.github.com` | `lib/github.ts:283-288`, `:338-341` | These two ignore `GHN_API_BASE`, so they cannot be pointed at the stand-in. |
| `parsePullCoords` hardcodes `api.github.com` | `lib/github.ts:458-462` | Check summaries stay `null` under the stand-in. |
| The keydown effect has no dependency array | `app/page.tsx:380-458` | The listener is removed and re-added on every render. |
| `collapsedSection[].items` is always empty | `app/api/notifications/route.ts` | Both branches of the expression evaluate to `[]`. |
| `muted_subjects` has no primary key and no unique index | `db/schema.ts` | `onConflictDoNothing` cannot deduplicate, so the table can accumulate duplicates. |
| `data/` is not created by any script | `db/client.ts:5`, `scripts/push.ts:86` | A fresh clone fails to open the database because `bun:sqlite` creates the file but not the missing parent directory. |

---

## What the implementation changed

The design above was the plan. Building it produced a few corrections, recorded here so the plan is not mistaken for a description of the finished thing.

### Corrections to the plan

| Plan said | Reality | Why |
|---|---|---|
| `coverage.all` defaults to true | The option was removed in Vitest 5 | `coverage.include` alone enumerates every file, tested or not. Verified: every source file listed, the untested ones explicitly at 0%. |
| The source tree holds 58 files | 70 | Eight files were added: `lib/clock.ts`, `lib/inbox-state.ts`, `lib/sync-errors.ts`, `lib/seed-data.ts`, plus `scripts/compare-coverage.ts` and `scripts/e2e-reset.ts`, and two more that `main` had already grown since the branch started. |
| `lib/clock.ts` exports `now()` | It exports `nowMs()` | The routes bind the result to a local `now`, and the name would have shadowed it in every one of them. |
| The frozen instant is `2026-06-15T12:00:00Z` | `2026-01-15T12:00:00Z` | Every other part of the suite was already pinned to January, and two hundred verified checks depended on it. The cost is that the dataset keeps seven items in the band between the application's two calendar filters. That band is the application's own behaviour rather than a fixture defect, so it is now pinned by a check instead of avoided. |
| The reset script drops the tables and reseeds | It also writes `seedReposPruned` | Without it, the one-shot prune deletes every seeded repository and the sync recreates them all as watched, which collapses the whole inbox. With it, a sync against the stand-in leaves the dataset unchanged. Verified end to end: the inbox shows the same thirty rows after a full sync. |
| The stand-in answers one subject payload | It answers one payload per item | The sync reads the merged flag and the state out of those payloads and writes them into the database. A single default payload silently reset both. |

### The rebase onto main

The work was built on an older commit. When it came time to publish, `main`
had moved on by eleven commits, and several of them solved parts of this
feature better than the branch did. The branch was rebased onto `main` and
adapted rather than merged, because a merge would have left the branch
reverting eleven commits of features.

| The branch had | `main` had | What the rebase did |
|---|---|---|
| `GHN_DB_PATH` in `db/client.ts` | `lib/config.ts` with `GHN_DB_PATH`, a config file, `~` and `$VAR` expansion, and automatic parent directory creation | Dropped the branch's version. The branch's path-keyed global cache was kept, because `main`'s cache was keyed on nothing. |
| `db/schema-sql.ts` | `db/ensure-schema.ts` | Dropped the branch's copy. `main`'s was made runtime agnostic, so one schema definition serves both the Bun client and the Node test client. |
| `make test` runs every layer | `make test` runs the unit suite only, and `make check` is the gate | Kept `main`'s meanings. `make test-all` runs every layer, and the new fast layers joined `make check`. |
| `package.json` `start` takes a port | `scripts/serve.sh` with per-workspace ports | Dropped the branch's change. The end-to-end layer sets `PORT` and the script honours it. |
| Fixed end-to-end ports 21140 and 21141 | A per-workspace port resolver over 21120-21219 | The end-to-end pair moved a hundred above the workspace's dev port, so it never lands on a dev port and two worktrees never land on each other. |
| A separate `lib/api-base.ts` | `apiBases()` in `lib/github.ts` | Dropped the branch's module. `apiBase()` now delegates to `apiBases()`, so the two agree on an empty override and on an enterprise host. |
| `lib/contributions.ts` always used the API | An API path with a `gh` helper fallback | Kept the fallback for production and added `tokenDisabled()`, so an empty `GHN_TOKEN` stops the fallback. Without it the suite would have reached the real GitHub. |
| The unit suite ran under `bun test` | The unit suite ran under `bun test`, with four newer files still importing `bun:test` | The runner moved to Vitest and the four newer files were migrated with it. |

Two of `main`'s own test files needed adapting: the dependabot checks used
`Bun.serve`, and the shortcut list grew a row, so the component checks that
matched the old wording were updated to the current one.

### Defects found and fixed

| Defect | Fix |
|---|---|
| `fetchCheckSummary` and `fetchWorkflowRuns` hardcoded `https://api.github.com` | They use the shared base. Before the fix, opening the drawer for a pull request made a real request to the real GitHub with the stand-in's credential. |
| `lib/github.ts` called the number counter twice per item in the seed | The subject path and the source URL disagreed, so the preview drawer read the payload of a different item. |
| `lib/rate-limits.ts` and `lib/github.ts` resolved the base URL differently | One resolver now serves both, including the enterprise host. |
| The clipboard fallback left its textarea behind when the copy command threw | The removal is in a `finally`. |
| The keydown listener was removed and re-added on every render | The handler lives in a ref, so the listener is registered once and still sees the current state. |

### Defects found by the review of the finished suite

A review of the suite itself, with mutations applied to the implementation to see which checks noticed, found five checks that passed without proving anything. All five are fixed and each fix is verified against the mutation that used to slip through.

| Defect | Fix |
|---|---|
| The disconnected-banner check resolved before the connection answer was applied | It waits for the banner to appear and requires that it never does, because a count of zero is true before the application has applied anything. |
| The rate-limit refresh check asserted a value that is identical before and after | It counts the probes and requires the refresh to produce a second one. |
| The drawer stub answered every request with one canned payload | The stub refuses any id other than the one the drawer was given, and a check renders the second item so a drawer that always opens the first one fails. |
| Two integration files left the sync state behind between checks | The state is cleared with the other tables, so the files no longer depend on the order they run in. |
| The "Sync this item" action was only asserted to exist | It is now clicked, and the posted id is checked. |

The stand-in's default subject also returned a web url in the API shape (`/pulls/12` instead of `/pull/12`), which the application would not be able to turn back into an API url. It now returns the shape GitHub uses.

One production defect is parked as [issue 35](https://github.com/stefanwalther/ghn/issues/35): unsubscribing two notifications that share a repository and a subject ignores only one GitHub thread. It needs a decision about what the response count means, so it was not fixed in place.

### Defects found and left

These need a decision that is not the test suite's to make.

| Defect | Where | Why it was left |
|---|---|---|
| A failed thread fetch renders "No preview for this item type" instead of an error | `components/inbox/item-drawer.tsx:240` | A user whose token expired sees an empty state rather than a failure. Fixing it is a user-facing change, not a testing change. |
| The drawer reads `content.comments.length` without checking that the payload has one | `components/inbox/item-drawer.tsx:305` | Latent. The current route returns a flat shape that always has the array. |
| The monthly digest rhythm clamps to midnight on the last day of the month | `lib/digest.ts:19` | It makes a repository due a few hours earlier than the same-time-of-day rule would. Changing it alters when digests arrive. |
| The repository facets ignore the repository filter while the type facets honour it | `app/api/notifications/route.ts:101` | Deliberate for a sidebar, but surprising enough to be worth a comment. |
| `muted_subjects` has no primary key and no unique index | `db/schema.ts` | `onConflictDoNothing` cannot deduplicate, so the table can accumulate duplicates. |
| The `data/` directory is not created by any script | `db/client.ts:5` | A fresh clone fails to open the database. |

### What the review of the finished suite found

A review of the merged work, with mutations applied to the implementation to see which checks noticed, found nine mutations that nothing caught, spread over six files. The ones that mattered were the guarantees the suite advertises.

| Gap | Why it mattered | Fix |
|---|---|---|
| The end-to-end reset compared a raw path against a resolved one, so the guard did not block the application's own database | A relative path or a redundant segment walked past the guard, and the script drops tables in the real inbox | Both sides are resolved before they are compared |
| The unit layer had no setup file, so it inherited `GH_TOKEN` from the environment | A machine with the documented production variable exported would hand the suite a real credential | The unit layer clears the credential variables the way the integration layer already did |
| Nothing checked that an empty token never falls back, or that `tokenDisabled()` does anything | The fallback would find a real credential on a machine that has one | Checks for both, with the helper mocked so the difference is observable |
| The coverage gate failed open on every baseline problem | A flaky baseline silently turned the gate off | A missing baseline is reported, and a broken baseline is an error |
| The gate compared the two runs' whole totals | A file that went from fully covered to not covered at all passed, and a change to the coverage list moved the number on its own | The comparison is over the files both runs measured, matched by their path relative to the repository |
| The CI passed the base branch's head where the script wanted the merge base | The baseline was measured at a different commit than the gate is named after | The script resolves the merge base itself |
| The gate's exit path was never executed, and the npm script pointed at the wrong thing | The gate would have exited zero without comparing anything, and the script always printed usage | The direct run is detected by comparing paths, and the exit path is checked by running the command |
| The rate limit clock, the read branch of the optimistic triage, the dataset's read balance and the collapsed ages were not pinned | The suite claims every count is predictable, and these were not | Checks for each |

Two more were left alone as cleanups rather than defects: an unused parameter on the seed subject builder, and the three separate runner invocations in `make check`.

The review also found that the production database client cannot run under the Node runtime the suite uses, because it speaks `bun:sqlite`. The rule it exists for, that a handle is cached per resolved path, moved into a small helper that both clients use, so it is covered.

### The coverage gate is advisory, not enforced

FR-006 says a failing automated run must block the merge of the pull request
that triggered it. The workflow satisfies the first half of that. It runs on
every pull request and a failing run shows red on the pull request.

The second half is not in place. `main` carries no required status checks, so
GitHub still offers the merge button when the run is red. The gate is
advisory until the two check contexts from the workflow are required on the
branch protection rule:

| Check | Context name |
|---|---|
| Type check, lint and the fast suites | `typecheck, lint, tests` |
| The end-to-end layer | `end-to-end (playwright)` |

Enabling that is a repository setting change, which is outside what the
feature work is allowed to touch. It is recorded here so the next session does
not read the finished task list and assume the gate is already hard.

---

## Credential exposure during research

While probing how the credential lookup behaves, a research agent ran `gh auth token` on the maintainer's machine and the live token appeared in that agent's raw output. The token was not written to any file in this repository and the repository is unmodified, but it should be treated as exposed and rotated.
