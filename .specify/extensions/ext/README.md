# speckit-ext

Umbrella extension bundling all 17 spec-kit workflow commands under the `/speckit.ext.*` namespace.

> This extension supersedes the previous layout of 13 separate per-feature extensions. Slash command names are unchanged — only the install model is consolidated. See [CHANGELOG.md](CHANGELOG.md) for migration notes.

## Provided Commands

### Pre-implementation

| Command | Purpose |
| --- | --- |
| `/speckit.ext.fast-track` | Orchestrate `specify`, `plan`, and `tasks` in one go |
| `/speckit.ext.ft` | Shorthand alias for `fast-track` |

### Mid-implementation

| Command | Purpose |
| --- | --- |
| `/speckit.ext.scope-change` | Document scope changes during implementation |
| `/speckit.ext.session-handover` | Hand over mid-implementation context to a new session |
| `/speckit.ext.handover` | Shorthand alias for `session-handover` |
| `/speckit.ext.manual-testing` | User-led manual testing with structured feedback |
| `/speckit.ext.code-review` | Multi-agent code review before PR creation |

### Pre-merge

| Command | Purpose |
| --- | --- |
| `/speckit.ext.validate` | Pre-merge validation and quality gate |
| `/speckit.ext.closeout` | Complete closeout with docs and PR prep |

### Pre-PR finalization

| Command | Purpose |
| --- | --- |
| `/speckit.ext.finalize` | Clean up transient files and update workspace docs (README, CHANGELOG) |
| `/speckit.ext.pr` | Create pull request via agent-based workflow |

### Post-merge

| Command | Purpose |
| --- | --- |
| `/speckit.ext.post-merge` | Final cleanup, workspace doc update, and worktree teardown prompt |

### Cross-cutting

| Command | Purpose |
| --- | --- |
| `/speckit.ext.backlog` | Resolve backlog items one-by-one |
| `/speckit.ext.backlog-add` | Quick-add item to development backlog |
| `/speckit.ext.backlog-sync` | Sync local backlog items to Notion |
| `/speckit.ext.cleanup` | Clean completed feature spec directories |
| `/speckit.ext.update-workspace` | Update workspace-level documentation |

## Installation

From a local clone (current distribution model):

```bash
git clone https://github.com/stefanwalther/spec-kit-extensions.git
cd /path/to/your-spec-kit-project          # must contain .specify/
/path/to/spec-kit-extensions/scripts/speckit-ext.sh install --target "$PWD"
```

Or invoke `specify` directly:

```bash
specify extension add /path/to/spec-kit-extensions/extensions/speckit.ext --dev --force
```

Use the repository lifecycle entrypoint to check, update, or remove the local
development installation:

```bash
/path/to/spec-kit-extensions/scripts/speckit-ext.sh check --target "$PWD"
/path/to/spec-kit-extensions/scripts/speckit-ext.sh update --target "$PWD"
/path/to/spec-kit-extensions/scripts/speckit-ext.sh remove --target "$PWD"
```

`check` is read-only. It exits `0` when up to date, `10` when an update is
available, `11` when not installed, and `1` on errors. `--dry-run` prints a
mutating action without running it. Authentication is an explicit no-op for
this extension.

## Multi-Agent Support

Commands register with whichever AI coding agents are active in the target project (Claude Code, Cursor, Codex, Gemini, Copilot, …) via spec-kit's native `CommandRegistrar`. No per-agent copies needed.

## License

MIT — see repository root for full text.
