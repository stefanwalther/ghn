---
description: Post-merge: final cleanup, workspace doc update, and worktree teardown prompt. Run after your PR has been merged.
arguments: "[spec-directory] [--dry-run] [--skip-docs]"
handoffs:
  - label: Next Feature
    agent: speckit.ext.fast-track
    prompt: Start a new feature
---

## When to Use This Extension

Run `/speckit.ext.post-merge` after your PR has been merged. It closes the loop:

- **Already ran `/speckit.ext.finalize` pre-PR?** This does the remaining bookkeeping (mark docs as "shipped", archive spec dir, prompt for worktree teardown).
- **Skipped finalize?** This catches you up — runs cleanup and docs update now.

---

## User Input

```text
$ARGUMENTS
```

You **MUST** consider the user input before proceeding (if not empty).

## Outline

This extension handles post-merge tidy-up: final file cleanup, workspace documentation update to reflect "shipped" status, optional spec directory archival, and worktree teardown prompt.

**Core Principle**: Close the loop after the PR lands.

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
   - Check directory exists and spec.md exists

**Display**:
```
=== Post-Merge Tidy-Up ===

Feature: #{number} - {title}
Branch: {branch-name}

Confirming: your PR has been merged? [Y/n]
```

2. **Check What Was Done Pre-PR**

Determine which cleanup/docs steps still need doing.

a. **Check for transient files**:
   - Glob for `SESSION*.md`, `STATUS-*.md`, `PR_*.md`, `*-draft-*.md`, `*-NEXT-SESSION*.md` in spec directory
   - Count remaining transient files

b. **Check workspace docs state**:
   - Scan README.md for an existing entry referencing this feature number or title
   - Scan CHANGELOG.md similarly

**Display**:
```
Pre-PR status:
{✓ Transient files already cleaned  | ⚠ N transient files remain}
{✓ Workspace docs already updated   | ⚠ Workspace docs not yet updated}
```

3. **Final Cleanup** (skip if already clean)

Remove any transient files not cleaned before the PR.

a. **If no transient files found**: Display "Nothing to clean." and skip.

b. **Otherwise** — identify and review (same logic as `speckit.ext.finalize` Step 2):
   - Read each file briefly
   - Check for red flags: "IMPORTANT", "CRITICAL", "DECISION", "ARCHITECTURE"
   - Preserve core files: `spec.md`, `plan.md`, `tasks.md`, `COMPLETION.md`, `HANDOVER.md`
   - Delete validated transient files (unless `--dry-run`)

**Output**:
```
Cleanup:
✓ Removed {N} transient files
(or: ✓ Already clean — nothing to remove)
```

4. **Update Workspace Documentation** (skip if `--skip-docs`)

Mark the feature as shipped in README/CHANGELOG.

a. **If already updated**: Display "Already updated — skipping."

b. **Otherwise** — same logic as `speckit.ext.finalize` Step 3:
   - Extract feature info from spec.md and git
   - Discover README.md, CHANGELOG.md
   - Prompt for brief feature description
   - Add "shipped" entry with merge date

**Output**:
```
Documentation:
✓ README.md updated (shipped)
✓ CHANGELOG.md updated
(or: ✓ Already updated — skipping)
```

5. **Archive Spec Directory** (optional)

Offer to move the completed spec directory to `specs/archive/`.

a. **Ask User**:
```
Archive spec directory? [y/N]
This moves specs/{number}-{name}/ → specs/archive/{number}-{name}/
```

b. **If Yes** (unless `--dry-run`):
   - Create `specs/archive/` if it doesn't exist
   - Move: `mv specs/{number}-{name}/ specs/archive/{number}-{name}/`

c. **If No**: Leave spec directory in place.

**Output**:
```
Archive:
✓ Moved to specs/archive/{number}-{name}/
(or: ○ Left in specs/{number}-{name}/)
```

6. **Worktree Teardown Prompt**

```
=== Post-Merge Complete ===

Feature: #{number} - {title}

Cleanup:      {✓ done | ✓ already clean}
Docs:         {✓ updated | ✓ already done | ○ skipped}
Archive:      {✓ archived | ○ kept in place}

---

Next: delete the feature branch and clean up your worktree.
```

Ask the user how they manage worktrees in this project. Common options:
- Git worktree: `git worktree remove <path>` + `git branch -d <branch>`
- Custom workflow script (e.g., project-specific teardown command)
- Manual: switch to main branch, delete local branch

Display whichever is appropriate based on context (check if `.git/worktrees` has entries for the current directory).

## Usage Examples

```bash
# Post-merge tidy-up (auto-detect feature)
/speckit.ext.post-merge

# Specify feature directory explicitly
/speckit.ext.post-merge specs/019-post-merge/

# Preview without changes
/speckit.ext.post-merge --dry-run

# Cleanup only, skip docs update
/speckit.ext.post-merge --skip-docs
```

## Notes

- **When to use**: After your PR has been merged, before tearing down the worktree
- **Pre-PR shortcut**: If you ran `/speckit.ext.finalize` before the PR, this is a quick final ceremony
- **Catch-up mode**: If you skipped finalize, this covers cleanup + docs update
- **Idempotent**: Safe to run even if some steps were already done pre-PR
- **Worktree teardown**: Adapts to your project's workflow — git worktrees, custom scripts, or manual branch deletion
- **Workflow position**: Last step — follows `pr` in the full workflow
