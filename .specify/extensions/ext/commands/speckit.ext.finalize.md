---
description: Pre-PR: clean up transient files and update workspace docs (README, CHANGELOG). Run after implement (or closeout), before pr.
arguments: "spec-directory --dry-run --skip-docs"
handoffs:
  - label: Create PR
    agent: speckit.ext.pr
    prompt: Create pull request for this feature
  - label: Full Closeout
    agent: speckit.ext.closeout
    prompt: Create full COMPLETION.md and HANDOVER.md for context preservation
---

## When to Use This Extension

**Use `/speckit.ext.finalize` (this command) for routine features.** This is the lightweight, fast option (~2-5 min) that cleans up transient files and updates workspace docs. Use it for most PRs.

**Use `/speckit.ext.closeout` for complex features.** That's the heavyweight option (15-20 min) that creates COMPLETION.md and HANDOVER.md for knowledge transfer. Use it when someone else will maintain the code or you need to document lessons learned.

**Quick decision**: If you're not sure, use this command. You can always run closeout later via the handoff if you decide you need more documentation.

---

## User Input

```text
$ARGUMENTS
```

You **MUST** consider the user input before proceeding (if not empty).

## Outline

This extension finalizes a feature before PR creation by cleaning up transient files and updating workspace documentation. It combines cleanup and update-workspace into a single streamlined command.

**Core Principle**: One command to polish the deliverable before PR.

### Execution Steps

1. **Parse Arguments and Detect Feature**

a. **Parse Arguments**:
   - Extract spec directory if provided
   - `--dry-run`: Preview changes without applying
   - `--skip-docs`: Skip workspace documentation updates
   - If `--help`: Display usage and exit

b. **Auto-detect Feature** (if no directory provided):
   - Get current branch: `git rev-parse --abbrev-ref HEAD`
   - Extract feature number from branch name
   - Find matching spec directory: `specs/{number}-*`

c. **Validate Feature Directory**:
   - Check directory exists
   - Check spec.md exists (minimum requirement)

**Display**:
```
=== Feature Finalization ===

Feature: #{number} - {title}
Branch: {branch-name}
Spec: specs/{number}-{name}/

This will:
1. Remove transient files (SESSION*.md, PR_*.md, etc.)
2. Update workspace docs (README, roadmap)

Continue? [Y/n]
```

2. **Cleanup: Remove Transient Files**

Remove files that are noise in the final PR.

a. **Identify Transient Files**:
   Use Glob to find in spec directory:
   - `SESSION*.md` - Session handovers
   - `*-NEXT-SESSION*.md` - Session prompts
   - `STATUS-*.md` - Status snapshots
   - `PR_*.md`, `PR-*.md` - PR descriptions (will be in GitHub)
   - `*-draft-*.md` - Draft versions
   - `COMPLETION-PHASE*.md` - Interim completions
   - `GREEN-STATUS.md`, `REBASE-COMPLETE.md` - One-time markers

b. **Content Review** (for safety):
   For each file found:
   - Read content briefly
   - Check for red flags: "IMPORTANT", "CRITICAL", "DECISION", "ARCHITECTURE"
   - If red flags found: Mark as KEEP with warning

c. **Preserve Core Files**:
   Never delete:
   - `spec.md`, `plan.md`, `tasks.md`
   - `COMPLETION.md`, `HANDOVER.md`
   - `research.md`, `data-model.md`
   - `checklists/`, `decisions/`, `contracts/`

d. **Execute Cleanup** (unless --dry-run):
   - Delete identified transient files
   - Report what was removed

**Output**:
```
Cleanup:
✓ Removed 5 transient files:
  - SESSION1.md
  - SESSION2.md
  - STATUS-2026-01-14.md
  - PR_DESCRIPTION.md
  - draft-api-design.md
✓ Preserved 4 core files
```

3. **Update Workspace Documentation**

Update README.md and roadmap with the completed feature.

a. **Extract Feature Information**:
   From spec.md:
   - Feature title
   - Description/summary
   - Status

   From git:
   - Completion date: `git log -1 --format=%cs`
   - Files changed: `git diff --stat main...HEAD`

b. **Discover Documentation Files**:
   Use Glob to find:
   - `README.md` (repository root)
   - `docs/*.md`, `doc/*.md`
   - `CHANGELOG.md`, `ROADMAP.md`

c. **Prompt for Feature Description**:
   Use AskUserQuestion:
   ```
   Brief description of this feature for README/roadmap (1-2 sentences):
   ```

d. **Update Files** (unless --skip-docs or --dry-run):

   For README.md with milestone section:
   - Find "## Completed" or similar section
   - Add row: `| **{title}** | Done | {date} | {description} |`

   For CHANGELOG.md:
   - Add entry under `## [Unreleased]` or create section
   - Format: `### Added\n- {feature title}: {description}`

e. **Create Backups**:
   Before editing: `cp {file} {file}.backup`

**Output**:
```
Documentation:
✓ Updated README.md (added milestone)
✓ Updated CHANGELOG.md (added entry)
  Backups created: README.md.backup, CHANGELOG.md.backup
```

4. **Present Summary**

```
=== Finalization Complete ===

Feature: #{number} - {title}

Cleanup:
✓ Removed {N} transient files
✓ Preserved {M} core files

Documentation:
✓ README.md updated
✓ CHANGELOG.md updated

Next Steps:
1. Review changes: git diff
2. Create PR: /speckit.ext.pr

Need documentation artifacts? Run /speckit.ext.closeout first (creates COMPLETION.md + HANDOVER.md)
```

## Usage Examples

```bash
# Finalize current feature (auto-detect)
/speckit.ext.finalize

# Finalize specific feature
/speckit.ext.finalize specs/004-validate/

# Preview without changes
/speckit.ext.finalize --dry-run

# Skip documentation updates (cleanup only)
/speckit.ext.finalize --skip-docs
```

## Notes

- **Combines**: cleanup + update-workspace into one command
- **Standalone components**: `/speckit.ext.cleanup` and `/speckit.ext.update-workspace` remain available for granular control
- **Context preservation**: For full COMPLETION.md and HANDOVER.md, use `/speckit.ext.closeout`
- **Idempotent**: Safe to run multiple times
- **Backups**: Always creates .backup files before editing
