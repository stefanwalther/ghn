# Changelog — speckit-ext

All notable changes to the umbrella extension are documented here.
Format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

## [0.6.1] - 2026-09-25

### Added

- Repository lifecycle contract with install, authentication, drift check,
  update, and removal verbs
- Read-only version and source-revision drift detection for local development
  installations
- Dry-run support and focused lifecycle contract tests

### Changed

- Install and update now use Spec Kit's native local force-reinstall command
  without a separate remove-first step
- `scripts/install-all.sh` now delegates to the lifecycle entrypoint

## [0.6.0] - 2026-06-19

### Changed

- Sync `speckit.ext.pr` with upstream c:pr v3.11.0

### Added (speckit.ext.pr)

- `pr:conflict-evaluator` agent for immediate post-creation mergeability analysis and remediation strategies
- CI Monitor & Auto-Fix Loop: auto-investigate, fix, commit, push, and re-monitor on CI failure (up to 3 attempts by default)
- New flags: `--no-auto-fix` / `-F` and `--max-fix-attempts N`
- GitHub API rate-limit handling with reset-time reporting (absolute local time + relative duration)
- Pre-Merge / Post-Merge test plan split in `pr:describer` instructions
- Workflow run tracking in `pr:monitor` (`gh run list --commit`) for sequential CI jobs
- SSH/GPG commit signing diagnostic notes in state-verification steps

## [0.5.1] - 2026-06-09

### Added

- `speckit.ext.post-merge` — new command for post-merge tidy-up: final cleanup, workspace doc update, optional spec directory archival, and worktree teardown prompt. Fills the gap between PR merge and worktree teardown.

### Changed

- `speckit.ext.finalize` — removed the "Optional: Quick Completion Note" step (Step 4). Creating COMPLETION.md is `closeout`'s job. `finalize` now strictly handles cleanup + workspace docs. Descriptions sharpened to make pre-PR sequencing explicit.
- `speckit.ext.closeout` — description updated to clarify this is an optional pre-PR step for complex features, runs before `finalize`.
- `speckit.ext.fast-track` / `speckit.ext.ft` — Final Summary now shows the full post-implement workflow (finalize → pr → post-merge).

### Provided commands (17)

Pre-implementation: `speckit.ext.fast-track`, `speckit.ext.ft`
Mid-implementation: `speckit.ext.scope-change`, `speckit.ext.session-handover`, `speckit.ext.handover`, `speckit.ext.manual-testing`, `speckit.ext.code-review`
Pre-merge: `speckit.ext.validate`, `speckit.ext.closeout`
Pre-PR: `speckit.ext.finalize`, `speckit.ext.pr`
Post-merge: `speckit.ext.post-merge`
Cross-cutting: `speckit.ext.backlog`, `speckit.ext.backlog-add`, `speckit.ext.backlog-sync`, `speckit.ext.cleanup`, `speckit.ext.update-workspace`

## [0.5.0] - 2026-05-28

### Changed — BREAKING (install model only)

Consolidated the previous 13 per-feature extensions (`ext-validate`, `ext-pr`, `ext-fast-track`, …) into a single umbrella extension with `id: ext`. All 16 slash commands are unchanged — only the install model is different.

**Why:** spec-kit's command-namespace validator enforces that the middle segment of `speckit.<id>.<verb>` equals the extension's `id`. The previous layout — 13 extensions each declaring `id: ext-<name>` while shipping commands like `speckit.ext.<name>` — failed validation in current spec-kit releases (≥ 0.8.x). The umbrella `id: ext` aligns with the namespace already used by every command.

**Slash commands users invoke are unchanged.** `/speckit.ext.validate`, `/speckit.ext.pr`, `/speckit.ext.fast-track`, etc. all work exactly as before.

**Migration from previous installs:**

```bash
# Remove the old per-feature extensions
specify extension remove ext-validate ext-pr ext-fast-track ext-session-handover \
  ext-backlog ext-backlog-sync ext-cleanup ext-closeout ext-code-review \
  ext-finalize ext-manual-testing ext-scope-change ext-update-workspace --force

# Install the umbrella
specify extension add /path/to/spec-kit-extensions/extensions/speckit.ext --dev
# or:
/path/to/spec-kit-extensions/scripts/install-all.sh
```

### Provided commands (16)

Pre-implementation: `speckit.ext.fast-track`, `speckit.ext.ft`
Mid-implementation: `speckit.ext.scope-change`, `speckit.ext.session-handover`, `speckit.ext.handover`, `speckit.ext.manual-testing`, `speckit.ext.code-review`
Pre-merge: `speckit.ext.validate`, `speckit.ext.closeout`
Pre-PR: `speckit.ext.finalize`, `speckit.ext.pr`
Cross-cutting: `speckit.ext.backlog`, `speckit.ext.backlog-add`, `speckit.ext.backlog-sync`, `speckit.ext.cleanup`, `speckit.ext.update-workspace`

### Notes

- Per-command versioning is no longer tracked at the manifest level — the umbrella ships a single version. Per-command history before this consolidation is preserved in git under `extensions/speckit.ext.<name>/CHANGELOG.md` (pre-0.5.0 tree).
- The `manifest.yml` descriptive files used in previous extensions were not consumed by `specify` and are not carried forward. Their gap-analysis content remains under `specs/`.
