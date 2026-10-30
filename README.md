<div align="center">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="docs/logo/wordmark-dark.svg">
    <img src="docs/logo/wordmark-light.svg" alt="ghn." width="160">
  </picture>

  # The better GitHub notification UI

  Clear 20 GitHub notifications in under 5 minutes with half the clicks.

  [![CI](https://github.com/stefanwalther/ghn/actions/workflows/ci.yml/badge.svg)](https://github.com/stefanwalther/ghn/actions/workflows/ci.yml)
  [![Release](https://img.shields.io/github/v/release/stefanwalther/ghn)](https://github.com/stefanwalther/ghn/releases)
  [![License](https://img.shields.io/github/license/stefanwalther/ghn)](https://github.com/stefanwalther/ghn/blob/main/LICENSE)
  [![Bun](https://img.shields.io/badge/runtime-Bun-black)](https://bun.sh)
</div>

<br>

Zero friction. Based on the [`gh` CLI](https://cli.github.com/). If `gh` works, ghn works. No tokens, no env files.

## Why ghn

- **Fewer clicks** - bulk select and clear 20 threads in one action. Full keyboard flow, no mouse needed.
- **Quicker insights** - no more jumping to a PR or Action to decide. Thread body, checks, and Dependabot detail show inline in the drawer.
- **Clever filtering** - slice by repo, type, age, and read or done state. The queue narrows to what matters now.
- **Repo rhythms** - define which repos show immediately, weekly, or monthly, plus snooze for an hour, this evening, or next week.
- **No API key wrangling** - reuses your `gh` login. No tokens to copy, no env files to maintain.
- **Self-hosted** - a small app running on your laptop, talking to the GitHub API directly. Your credential never passes through a third-party portal.
- **16 color themes** - pick from Default, GitHub, Dracula, Nord, and more in Settings. Each pairs with light, dark, or system mode.

## Get going

Needs Bun and an authenticated `gh`, nothing else. Tested on macOS and Linux.

```bash
gh auth status || gh auth login
git clone https://github.com/stefanwalther/ghn.git
cd ghn
make start
# builds, serves production in the background and opens http://localhost:21120
```

No Bun, or not on macOS or Linux? Run the published image instead:

```bash
cp .env.example .env # then set GH_TOKEN=... in .env, never commit it
docker compose pull app && docker compose up -d
# app at http://localhost:21120, see docs/docker.md
```

For development with hot reload, use `make dev` instead.

1. Press refresh to sync from GitHub.
2. Clear the queue: filter by repo or reason, select with `x`, press `e` for done.
3. Silence one noisy repo in `/repos` by setting it to weekly.

Trying it out in dev? Run `bun run db:seed` before the first sync.

Alternative: token-based Docker run, see [docs/docker.md](docs/docker.md).

## Screenshots

<picture>
  <source media="(prefers-color-scheme: dark)" srcset="docs/screenshots/inbox-dark.png">
  <img src="docs/screenshots/inbox.png" alt="Inbox with bulk triage and type filters">
</picture>

<picture>
  <source media="(prefers-color-scheme: dark)" srcset="docs/screenshots/inbox-selected-dark.png">
  <img src="docs/screenshots/inbox-selected.png" alt="Three threads selected with bulk Done and Unsubscribe actions">
</picture>

<picture>
  <source media="(prefers-color-scheme: dark)" srcset="docs/screenshots/inbox-drawer-dark.png">
  <img src="docs/screenshots/inbox-drawer.png" alt="Preview drawer with merged PR body and passing checks inline">
</picture>

<picture>
  <source media="(prefers-color-scheme: dark)" srcset="docs/screenshots/repos-dark.png">
  <img src="docs/screenshots/repos.png" alt="Per-repo digest rhythms and snooze">
</picture>

<picture>
  <source media="(prefers-color-scheme: dark)" srcset="docs/screenshots/rate-limits-dark.png">
  <img src="docs/screenshots/rate-limits.png" alt="Live GitHub API rate-limit buckets">
</picture>

## How it works

Three pages, one local SQLite database, all sourced from the GitHub Notifications API.

- `/` - unified inbox with main flow plus collapsed digest section
- `/repos` - per-repo rhythm (immediate, weekly, biweekly, monthly) plus snooze
- `/rate-limits` - live API quota from response headers

Press `?` in the app for all keyboard shortcuts.

Press `Cmd+K` anywhere for search and commands: threads, repos, filters, and navigation in one ranked list.

## ghn vs github.com/notifications

| | GitHub | ghn |
|---|---|---|
| Time to clear 20 items | 10 plus minutes of per-thread opens | Under 5 minutes from one list |
| Watched repo noise | Every update interrupts | Hidden until the digest is due |
| Return from a thread | Filter and scroll position lost | Same filter and position kept |
| Setup and auth | Token hunt and expiry | Existing `gh` login, nothing to store |
| Sync stalls | Silent or cryptic | Labeled stale state plus quota view |

## Development

See [docs/development.md](docs/development.md) for gates, commands, the test layers, and layout.

## Contributing

Issues and small PRs welcome. See [open issues](https://github.com/stefanwalther/ghn/issues) for starters. CI runs typecheck, lint, the unit, integration and component suites, and the end-to-end layer on every PR.

## License

MIT. See [LICENSE](LICENSE).
