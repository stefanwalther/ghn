# Contract: Shared Test Support

**Feature**: [004-test-suite](../spec.md) | **Date**: 2026-10-20

The reusable scaffolding the layers share, so that adding a check does not mean copying setup (FR-027).

---

## 1. Layout

```text
tests/support/
├── github-stand-in.ts     # the GitHub stand-in (see github-stand-in.md)
├── stand-in-server.ts     # standalone entry point for the end-to-end layer
├── db-client.node.ts      # node:sqlite + Drizzle proxy driver
├── dom-setup.ts           # browser API stubs the DOM environments lack
├── fixtures.ts            # database factory, thread factory, clock pinning
└── test-env.ts            # the environment seam helpers
```

`tests/support/` is not a test directory. No file in it matches the `*.test.ts` pattern, so no file in it is ever collected as a check.

---

## 2. `test-env.ts`

Helpers for reading and setting the environment seams.

```ts
function withEnv(vars: Record<string, string | undefined>): () => void;
function pinnedNow(ms: number): void;
function tempDbPath(label: string): string;
```

| Function | Contract |
|---|---|
| `withEnv` | Sets the given variables, returns a function that restores the previous values. Used to scope a seam to one check without leaking it. |
| `pinnedNow` | Sets `GHN_NOW` and the fake timers to the same instant, so the application's clock and the test's clock agree. |
| `tempDbPath` | Returns a path under the system temporary directory for a labelled database. Never inside the repository (FR-021). |

---

## 3. `db-client.node.ts`

A Drizzle client over `node:sqlite`, for the tests that need a real database.

```ts
function createDb(path: string): { db: Db; sqlite: DatabaseSync };
function createMemoryDb(): { db: Db; sqlite: DatabaseSync };
```

| Function | Contract |
|---|---|
| `createDb` | Opens the file at `path`, creating it if absent, and applies the same pragmas as production. |
| `createMemoryDb` | The same over an in-memory database, for checks that do not need persistence across a restart. |

**Constraints**

- The schema is created with the existing `scripts/push.ts` `ensureSchema`, so there is one definition of the schema and not two.
- The Drizzle proxy driver expects **positional** rows, not objects. The session maps each result row through the statement's column list. This is the single most common source of a broken shim.
- `muted_subjects` has no primary key and no unique index, so `onConflictDoNothing` cannot deduplicate. A check that inserts into it must not rely on deduplication.

---

## 4. `fixtures.ts`

```ts
function makeTestDb(): { db: Db; sqlite: DatabaseSync; cleanup(): void };
function makeThread(overrides?: Partial<Thread>): Thread;
function makeRepo(overrides?: Partial<Repository>): Repository;
function seedTestDataset(db: Db, now: number): { repositories: number; notifications: number };
```

| Function | Contract |
|---|---|
| `makeTestDb` | An isolated database with the full schema, and a cleanup that removes it. Each call returns a fresh instance. |
| `makeThread` | A GitHub-shaped thread with sensible defaults. Overrides are merged field by field. |
| `makeRepo` | A repository with sensible defaults. |
| `seedTestDataset` | Loads the shared dataset from `lib/seed-data.ts` at the given instant. Returns the counts so a check can assert them. |

**Constraints**: every fixture is fresh per check and holds no state between checks (FR-012).

---

## 5. `dom-setup.ts`

Stubs for the browser APIs that neither `happy-dom` nor `jsdom` implements, applied to the component project's setup file.

| Stub | Why |
|---|---|
| `window.matchMedia` | The inbox page reads `prefers-reduced-motion` on every "back to top" click. `matchMedia` is called on a render path, not only on interaction. |
| `Element.prototype.scrollIntoView` | The inbox page calls it as soon as the status becomes ready, so a check fails at mount without it. |
| `window.open` | The drawer opens the source in a new window. The DOM environments log "not implemented" and return `null`. |
| `window.scrollTo` | Same. |
| `navigator.clipboard` | The copy-link action needs it. `lib/clipboard.ts` falls back to `document.execCommand`, which the DOM environments also lack. |

**Constraints**: the stubs are installed once per test file, in the setup file, and are restored between checks. They must not leak into the unit or integration layers.

---

## 6. `github-stand-in.ts` and `stand-in-server.ts`

Specified in full in [github-stand-in.md](./github-stand-in.md). The summary:

| Module | Role |
|---|---|
| `github-stand-in.ts` | Exports `startGitHubStandIn(options)`, which returns the controller described in the stand-in contract. Runs on `node:http` so it works in-process under Vitest and as a Bun process. |
| `stand-in-server.ts` | The standalone entry point. Starts the stand-in with the shared dataset and prints the base URL. Invoked by the end-to-end runner. |

---

## 7. The end-to-end fixture

`tests/e2e/fixtures.ts` extends Playwright's `test` with a per-check database reset.

```ts
import { test as base, expect } from "@playwright/test";

export const test = base.extend({
  // ...
});

test.beforeEach(() => {
  // reset the isolated database in place
});

export { expect };
```

**Constraints**

- The reset **drops and recreates the tables in place**. It MUST NOT unlink the database file, because the running application server holds an open handle and would keep serving the stale file (D6).
- The reset runs before every check, so no check can depend on another's leftovers and the order of execution does not matter (FR-012).
- The reset path is the temporary one, never the maintainer's database (FR-021).

---

## 8. The shared dataset

`lib/seed-data.ts` exports the one dataset.

```ts
export const SEED_REPOS: Repository[];
export function buildSeedThreads(apiBase: string, now: number): Thread[];
```

| Property | Contract |
|---|---|
| Repository identifiers | Derived from the full name by the same function the sync path uses, so the seed and the sync agree |
| `subjectType` | Always set, so the pull-request filter and the `PR` badge have a population |
| `subjectState` | Set, so the closed filter has a population |
| `prMerged` | Set only on pull-request items, because that is the only case the sync path records |
| Age distribution | An explicit ladder, with the recent items in the repositories that are due, so every age filter has a known non-zero count in the visible set |
| Instants | Relative to the frozen instant, so the age buckets are stable |

**Constraints**: the same dataset feeds the database seeder and the stand-in, so the application under test and the API it calls always agree. This is what makes a sync preserve the dataset rather than destroy it (D5).

---

## 9. Change impact

| Change | Breaking for |
|---|---|
| A new fixture | Nothing, but check whether it belongs in an existing one first |
| A change to the dataset | Every end-to-end assertion that counts items, and every integration check that seeds |
| A change to the DOM stubs | The component layer, if a check depended on the old behaviour |
| A change to the schema creation | Every layer, since `ensureSchema` is the single source |
