---
name: speckit-ext-cleanup
description: Clean up completed feature spec directories with intelligent content review
compatibility: Requires spec-kit project structure with .specify/ directory
metadata:
  author: github-spec-kit
  source: ext:commands/speckit.ext.cleanup.md
---

## User Input

```text
$ARGUMENTS
```

You **MUST** consider the user input before proceeding (if not empty).

## Outline

This extension performs intelligent cleanup of completed feature specification directories. Unlike blind pattern matching, it **reviews file contents** before deletion to ensure truly transient files are removed while preserving any unique information.

**Core Principle**: Pattern-guided content review - patterns suggest candidates, LLM validates safety.

### Execution Steps

1. **Parse Arguments**

Parse `$ARGUMENTS` to extract:
- Target directory (required, first argument)
- Flags: `--dry-run` (preview mode), `--force` (skip git warning)
- If `--help` or no arguments: Display usage and exit

2. **Workspace CHANGELOG Check** (if exists)

Check if workspace has CHANGELOG.md in repository root:

a. **Detect Workspace CHANGELOG**:
   - Use Glob to check for `<repo-root>/CHANGELOG.md`
   - If found: Suggest updating it with this feature's completion
   - If not found: Continue (workspace CHANGELOG optional)

b. **Suggest Entry** (if CHANGELOG exists):
   - Read feature spec.md summary
   - Suggest CHANGELOG entry format:
     ```
     ## [Unreleased] or [Version]
     ### Added
     - [Feature name from spec.md]
     ```
   - Prompt: "Update workspace CHANGELOG.md with this feature? [Y/n]"
   - If yes: Provide entry text, user adds it manually (or use Edit tool)
   - If no: Continue to cleanup

3. **Safety Checks**

Before file analysis:

a. **Git Status Check** (unless --force):
   - Use Bash tool: `git status --porcelain <target-dir>`
   - If uncommitted changes found: Display warning with file list
   - Show recommendation: "Run 'git add . && git commit' first"
   - Continue (don't block, just warn)

b. **Tasks Completion Check**:
   - Read `<target-dir>/tasks.md` using Read tool
   - Count unchecked tasks: `grep -c '^\- \[ \]'`
   - If unchecked tasks found: Warn "Feature appears incomplete (X unchecked tasks)"
   - Continue (don't block, just warn)

c. **Directory Validation**:
   - Use Glob to check for spec.md, plan.md, or tasks.md
   - If none found: Warn "No spec files found"
   - Continue if at least one exists

3. **File Discovery and Pattern Matching**

Use Glob tool to find all files in target directory:
```
Glob: <target-dir>/*
```

Categorize each file by pattern:

**KEEP Patterns** (Always preserve):
- Core: `spec.md`, `plan.md`, `tasks.md`
- Learning: `COMPLETION.md`, `HANDOVER.md`, `research.md`, `data-model.md`, `quickstart.md`, `CHANGELOG.md`
- Active work: `BACKLOG-*.md`
- Directories: `checklists/`, `contracts/`, `decisions/`

**DELETE Pattern Candidates** (Review content before deletion):
- Session noise: `SESSION*.md`, `*-NEXT-SESSION*.md`, `STATUS-*.md`
- Phase tracking: `COMPLETION-PHASE*.md`, `HANDOVER-PHASE*.md`, `*-COMPLETE.md`, `GREEN-STATUS.md`, `REBASE-COMPLETE.md`
- PR artifacts: `PR_*.md`, `PR-*.md`, `PRs-CREATED.md`
- Drafts: `*-draft-*.md`, `archive/` directories

**Unknown** (Review and prompt user):
- Any file not matching KEEP or DELETE patterns

4. **Intelligent Content Review for DELETE Candidates (Parallel)**

**Threshold Check**: If DELETE candidate count ≤ 2, process sequentially (skip parallelization).

For 3+ DELETE candidate files, analyze in parallel using sub-agents:

a. **Group files into batches** of 3-5 files each

b. **Launch parallel sub-agents** for each batch:

**CRITICAL**: Launch these as PARALLEL Task calls in a single tool call block.

For each batch, use Task tool with:
- subagent_type: "general-purpose"
- description: "Analyze files for cleanup"
- prompt: |
    You are analyzing files for cleanup decisions.

    ## Files to Analyze
    {list of 3-5 file paths from this batch}

    ## Instructions
    For each file:
    1. Read the file using the Read tool
    2. Analyze content for:
       - Is it truly transient? (handover, status snapshot, draft)
       - Does it contain unique information not in other files?
       - Is it superseded by other documents?
       - Are there red flags? (words like "IMPORTANT", "CRITICAL", "ARCHITECTURE", "DECISION")
    3. Return decision: SAFE_TO_DELETE, KEEP, or UNCERTAIN

    ## Output Format (JSON)
    Return your findings as JSON:
    ```json
    {
      "files": [
        {
          "path": "filename.md",
          "pattern": "Why it matched DELETE pattern",
          "content_summary": "1-2 sentence summary",
          "unique_info": true/false,
          "red_flags": ["list of any red flag words found"],
          "decision": "SAFE_TO_DELETE|KEEP|UNCERTAIN",
          "reasoning": "Brief explanation of why this decision is safe"
        }
      ]
    }
    ```

c. **Wait for all agents to complete** before proceeding.

d. **Aggregate results**:
   - Parse JSON from each agent
   - Merge all file decisions into unified list
   - Group by decision: SAFE_TO_DELETE, KEEP, UNCERTAIN

e. **Error handling**:
   - If an agent fails: Mark its files as UNCERTAIN (user decides)
   - If all agents fail: Fall back to sequential processing with warning
   - Report errors clearly: "Agent failed for batch N. Files marked for manual review."

**Display progress** during execution:
```
Analyzing files in parallel (batch 1 of 3)...
Analyzing files in parallel (batch 2 of 3)...
Analyzing files in parallel (batch 3 of 3)...
All batches complete. Aggregating results...
```

**Provide reasoning** for each decision with format:
```
[Filename]
  Pattern: [Why it matched DELETE pattern]
  Content: [1-2 sentence summary of what's in the file]
  Unique info: [Yes/No - is there information not elsewhere?]
  Decision: [DELETE/KEEP/UNCERTAIN]
  Reasoning: [Why this decision is safe]
```

**Example**: `SESSION1.md` → Pattern match (SESSION*) → Read content → "Generic handover duplicated in COMPLETION.md" → SAFE TO DELETE

5. **Display Categorization with Reasoning**

Show complete analysis grouped by decision with brief reasoning:

```
WILL KEEP (X): spec.md, plan.md, tasks.md, COMPLETION.md, SESSION-ARCH.md*
  *Contains unique decisions, suggest moving to decisions/

WILL DELETE (Y): SESSION1.md (duplicated), PR_123.md (in GitHub), STATUS.md (superseded)

UNCERTAIN (Z): custom-notes.md [K/D?]
```

6. **User Confirmation**

- In dry-run mode: Skip to summary (no confirmation needed)
- In normal mode: Single confirmation for all deletions
  ```
  Proceed with deletion of Y files? [y/N]:
  ```
- If user confirms: Continue to deletion
- If user cancels: Exit with "Cleanup cancelled"

7. **Execute Deletion** (if not dry-run and confirmed)

Use Bash tool to delete validated files:
```bash
rm -rf <file1> <file2> ...
```

Track:
- Files successfully deleted
- Files that failed to delete (permission errors, etc.)
- Report errors clearly

8. **Link Maintenance**

After deletion, fix broken markdown links in kept files:

a. **Identify deleted filenames**
b. **For each kept .md file**:
   - Read file using Read tool
   - Search for links to deleted files: `[text](deleted-file.md)`
   - If found: Use Edit tool to remove link (convert to plain text)
   - Track how many links fixed

9. **Summary Report**

Display final summary:
```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
📊 CLEANUP SUMMARY
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Files kept:      X
Files deleted:   Y (after content review)
Links fixed:     Z
Errors:          N (if any)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Content Review Highlights:
- X files validated as safe to delete
- Y files kept due to unique information
- Z files moved user decision

Next: git add . && git commit -m "Clean up spec directory"
```

### Batch Mode

If target contains `###-*/` subdirectories: process all with content review, consolidate display, single confirmation.

## File Categorization Patterns

### KEEP (Always preserve)

**Core Blueprint**:
- `spec.md` - Feature specification
- `plan.md` - Implementation plan
- `tasks.md` - Task breakdown

**Valuable Learnings**:
- `COMPLETION.md` - Final summary and learnings
- `HANDOVER.md` - Operational knowledge
- `research.md` - Discovery and constraints
- `data-model.md` - Schema documentation
- `quickstart.md` - Usage guide
- `CHANGELOG.md` - Version history (required by constitution)

**Active Work**:
- `BACKLOG-*.md` - Deferred work items

**Structural Directories**:
- `checklists/` - Requirements validation
- `contracts/` - API/schema contracts
- `decisions/` - Architectural decision records

### DELETE Candidates (Review content before deletion)

**Session Noise**:
- `SESSION*.md` - Session handovers (usually transient)
- `*-NEXT-SESSION*.md` - Session prompts
- `STATUS-*.md` - Point-in-time status snapshots

**Phase Tracking**:
- `COMPLETION-PHASE*.md` - Interim phase completions
- `HANDOVER-PHASE*.md` - Phase handovers
- `*-COMPLETE.md` - Completion markers
- `GREEN-STATUS.md`, `REBASE-COMPLETE.md` - One-time events

**PR Artifacts**:
- `PR_*.md`, `PR-*.md` - PR descriptions (already in GitHub)
- `PRs-CREATED.md` - Transient tracking

**Superseded Drafts**:
- `archive/` - Archived old versions
- `*-draft-*.md` - Draft versions

### Unknown Files

Any file not matching KEEP or DELETE patterns:
- Read content
- Analyze purpose and value
- Prompt user for decision

## Usage

```bash
/speckit.ext.cleanup specs/001-feature/              # Single directory
/speckit.ext.cleanup specs/001-feature/ --dry-run    # Preview first
/speckit.ext.cleanup specs/                          # Batch mode
/speckit.ext.cleanup specs/001-feature/ --force      # Skip git warning
```

## Notes

**Content Review**: Never blindly delete by filename. Read file contents and validate: truly transient, information captured elsewhere, no unique decisions/context.

**Red flags** (KEEP): Words like IMPORTANT/CRITICAL/ARCHITECTURE/DECISION, unique technical details, detailed rationale.

**Safe to DELETE**: Generic handovers, status snapshots, duplicate info, superseded versions.

**Workflow**: Complete tasks → **Update workspace CHANGELOG** (if exists) → Commit → Run cleanup → Confirm → Commit cleaned spec

**CHANGELOG Integration**: Cleanup detects workspace CHANGELOG.md and prompts to add feature entry before cleanup. Ensures shipped features are documented.

**Patterns**: Case-sensitive glob (SESSION*.md matches SESSION1.md, not session.md). Patterns suggest, content validates.

**Dry-run**: Shows full content review without executing deletions.

**Errors**: Report but continue with other files.