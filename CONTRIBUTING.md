# Contributing

Issues and small PRs welcome. This is a hobby project, so reviews
happen on a best-effort basis.

## Local setup

```bash
git clone https://github.com/stefanwalther/ghn.git
cd ghn
make start
```

Needs Bun and an authenticated `gh`. See
[docs/development.md](docs/development.md) for the full guide.

## Before opening a PR

Run the local gate:

```bash
make check
```

All five checks (typecheck, lint, unit, integration, component) must
pass. CI runs the same plus the end-to-end layer on every PR.

Keep PRs small and focused, one logical change each. Use
[Conventional Commits](https://www.conventionalcommits.org/) for
commit messages (`feat:`, `fix:`, `docs:`, `chore:`, `ci:`), the
release notes are generated from them.
