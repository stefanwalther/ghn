# Development

Stack is Bun, Next.js 15, React 19, Tailwind 4, Drizzle over SQLite.

## Gates

```bash
bun run typecheck
bun run lint
bun test tests/unit
```

All three must pass before a PR is ready. CI runs the same on every push.

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

The database lives at `data/quiet-notifications.db` and is gitignored. Auth shells out to `gh auth token` on each sync, so there are no secret files.

## Layout

- `app/` - inbox (`/`), repos (`/repos`), rate limits (`/rate-limits`)
- `lib/` - sync, digest, filters, GitHub API client
- `db/` - Drizzle schema plus SQLite client
- `specs/` - feature specs and contracts, see `specs/001-quiet-notifications/contracts/`
