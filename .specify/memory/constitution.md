# ghn Constitution

## Core Principles

### I. Local-First, No Secret Files

Every feature runs locally with SQLite and reuses the existing `gh` login.
No tokens to copy, no secret files to maintain. Auth prefers `GH_TOKEN`
(fallback `GITHUB_TOKEN`) and otherwise shells out to `gh auth token` on
each sync. `GHN_TOKEN` empty-means-disabled exists for tests only and MUST
never fall back to a real credential. Production code MUST NOT read another
checkout's bindings and MUST NOT log credentials.

### II. Test-First With Offline Suite (NON-NEGOTIABLE)

TDD is mandatory: tests written, then fail, then implement. The suite never
contacts real GitHub and never mutates a real account or the maintainer's
real database. Every remote call goes to the local stand-in serving the
seeded dataset. New behavior needs coverage at the layer it belongs to:
unit for pure rules, integration for handlers plus DB plus GitHub client,
component for React in a DOM, e2e for user journeys on the built app.

### III. Simplicity Over Abstraction

Start simple, keep pure logic stable, justify every new abstraction. Server
state goes through query, filters live in the URL, page-local UI stays
local. Zustand is for true globals only and never for records. No new
backend or schema change when client fetching plus caching plus UI actions
suffice. Complexity MUST be recorded with rejected alternatives.

### IV. Gates Before Merge

All five gates MUST pass before a PR is ready: `typecheck`, `lint`,
`test:unit`, `test:integration`, `test:component`. CI runs the same gates
on every push plus the merge-base coverage ratchet, which fails on
coverage drops. End-to-end stays out of the fast gate because it needs a
build plus a browser, and runs separately.

### V. Small Reviewable Changes

One feature per PR, small diffs, conventional commits, release-please owns
the changelog and tags (`ghn-vX.Y.Z`). Issues and small PRs are welcome.
Every plan records a Constitution Check gate before research and re-checks
after design; a vacuous PASS is a defect to report, not a silent pass.

## Additional Constraints

Stack is Bun, Next.js 15, React 19, Tailwind 4, Drizzle over SQLite. Port
defaults to `21120`. Config precedence is `GHN_DB_PATH` over config file
`databasePath` over `~/.local/share/ghn/ghn.db` (`$XDG_DATA_HOME/ghn/ghn.db`
when set), with `~`, `$VAR`, `${VAR}` expansion
and auto-created parents. Overrides `GHN_API_BASE`, `GHN_NOW`,
`GHN_RELEASES_API_BASE`, `GHN_DISABLE_UPDATE_CHECK` exist for Enterprise,
deterministic tests, and mocks. Seed endpoint is disabled in production
and refuses reseed over live rows without explicit force.

## Development Workflow

Local entry points are `make start` for production serve plus open and
`make dev` for hot reload. `make check` is the local gate without e2e;
`make test-all` plus `make test-e2e` cover everything after `make build`.
Coverage output includes untested files so gaps stay visible. Docs live in
`docs/development.md` for gates, `docs/docker.md` for token-based runs,
specs under `specs/` with contracts. README onboarding MUST stay
clone plus `make start` plus sync.

## Governance

This constitution supersedes ad-hoc practice. Amendments require a PR that
updates this file, bumps the version per semver, and refreshes the Sync
Impact Report: MAJOR for removed or redefined principles, MINOR for new
principles or expanded guidance, PATCH for wording fixes. All plans and
reviews MUST verify compliance in their Constitution Check and call out
any vacuous pass. Use `docs/development.md` for runtime guidance.

**Version**: 1.0.0 | **Ratified**: 2026-10-24 | **Last Amended**: 2026-10-24
