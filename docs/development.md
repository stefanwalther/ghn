# Development

Stack is Bun, Next.js 15, React 19, Tailwind 4, Drizzle over SQLite.

## Gates

```bash
bun run typecheck
bun run lint
bun run test:unit
bun run test:integration
bun run test:component
```

All five must pass before a PR is ready. CI runs the same on every push.

## Tests

The suite has four layers. The first three run on Node with Vitest, and the
end-to-end layer drives the built app with Playwright.

```bash
make test              # the unit layer, the fast one
make test-integration  # request handlers, database and GitHub client together
make test-component    # React client components in a DOM
make test-all          # every layer
make test-e2e          # the end-to-end layer, needs a build
make test-coverage     # the fast layers with the merged coverage view
make coverage-check    # compare the coverage against the merge base
```

The end-to-end layer runs the production build, so `make build` has to have
run first. It stays out of `make check` on purpose, because it needs a
browser and a build.

### The layers

| Layer | What it exercises |
|---|---|
| `unit` | Individual rules and functions, every collaborator supplied as a parameter |
| `integration` | The request handlers, the database and the GitHub client together |
| `component` | React client components rendered in a DOM |
| `e2e` | The assembled application driven through its user journeys |

### The GitHub stand-in

The suite never contacts the real GitHub. Every remote call goes to a local
stand-in that serves the same dataset the database is seeded with, so a sync
against it leaves the data unchanged.

`tests/support/github-stand-in.ts` is the stand-in. It runs in-process for
the integration layer and as a standalone process for the end-to-end layer,
so both exercise the same behaviour. It can be scripted to produce the
failure modes the application has to handle: an unauthorized answer, an
exhausted rate limit, a missing thread, a server error and a timeout.

### Adding a check

Put the file in the directory of the layer it belongs to. That is the only
registration step.

```
tests/unit/         -> the unit layer
tests/integration/  -> the integration layer
tests/component/    -> the component layer
tests/e2e/          -> the end-to-end layer
```

A check should be independent of every other check: no shared mutable state,
no ordering dependency, no leftover from the previous check. Use the
fixtures in `tests/support/` rather than copying setup.

For a check that needs a database, use `createMemoryDb()` or `makeTestDb()`
from `tests/support/fixtures.ts`. For a check that needs an HTTP server, use
`serve()` from `tests/support/http-stub.ts`.

### Coverage

`make test-coverage` writes the merged view to `coverage/`. Every source
file appears, including the ones with no check, so the remaining gap is
visible rather than hidden.

`make coverage-check` compares the coverage against the merge base. It fails
when coverage drops and reports when there is no baseline to compare
against. The first pull request that introduces a suite has no baseline, and
that is reported rather than failed.

## Useful commands

```bash
bun run dev      # local inbox on http://localhost:21120
bun run db:seed  # load demo data
bun run db:push  # explicit schema push, also runs automatically on boot
make web-open    # start server if down, then open it (bash only)
```

## Configuration

| Var | Default | Purpose |
|-----|---------|---------|
| `PORT` | `21120` | Dev and prod server port |
| `GHN_API_BASE` | `https://api.github.com` | Override for GitHub Enterprise or mocks |
| `GHN_DB_PATH` | `./data/ghn.db` | Database location, highest precedence |
| `GHN_CONFIG_PATH` | `$XDG_CONFIG_HOME/ghn/config.json` | Override the config file location |
| `GHN_TOKEN` | unset | Override the GitHub credential. An empty value means no credential at all, and never falls back to the local `gh` helper |
| `GHN_NOW` | unset | Freeze the instant the application reads as "now" |

The database path also reads `databasePath` (or `dbPath`) from the config file, which supports `~`, `$VAR`, and `${VAR}` expansion. Parent directories are created automatically. SQLite allows one writer at a time, so let Dropbox finish syncing before opening the app on another machine. Auth prefers `GH_TOKEN` (fallback `GITHUB_TOKEN`) and otherwise shells out to `gh auth token` on each sync, so there are no secret files.

`GHN_TOKEN` and `GHN_NOW` exist for the test suite. `GHN_TOKEN` is what
guarantees that no check can reach a real account on a machine where `gh` is
authenticated, and `GHN_NOW` is what makes the dataset and the age filters
reproducible.

## Layout

- `app/` - inbox (`/`), repos (`/repos`), rate limits (`/rate-limits`)
- `lib/` - sync, digest, filters, GitHub API client
- `db/` - Drizzle schema plus SQLite client
- `tests/` - the test layers, `tests/support/` holds the shared fixtures
- `specs/` - feature specs and contracts, see `specs/001-quiet-notifications/contracts/`
