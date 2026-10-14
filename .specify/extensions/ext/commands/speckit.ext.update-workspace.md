---
description: Update workspace documentation after feature completion
arguments: "spec-directory --dry-run"
handoffs:
  - label: Create PR
    agent: speckit.ext.pr
    prompt: Create pull request for this feature
  - label: Commit Changes
    agent: commit
    prompt: Commit the documentation updates
---

## User Input

```text
$ARGUMENTS
```

You **MUST** consider the user input before proceeding (if not empty).

## Outline

This extension updates workspace-level documentation (README.md, roadmap, learnings) after a feature is completed. It extracts feature information from spec.md and git, prompts for subjective details, discovers documentation files by convention, and applies validated updates with backup support.

**Core Principle**: Convention over configuration - discover docs by pattern, user confirms selection.

### Execution Steps

1. **Parse Arguments**

Parse `$ARGUMENTS` to extract:
- Target directory (required, first argument) - the spec directory (e.g., `specs/003-feature-name/`)
- Flags: `--dry-run` (preview mode without modifications)
- If `--help` or no arguments: Display usage and exit

**Default behavior**: If no target provided, attempt to detect from current git branch name:
```bash
git rev-parse --abbrev-ref HEAD
```
Parse branch name for pattern `{number}-{name}` and look for matching `specs/{number}-{name}/` directory.

2. **Extract Feature Information**

**From spec.md** (using Read tool):
- Read `{target}/spec.md`
- Extract feature title: First `# ` heading
- Extract status: `**Status**:` field value
- Extract created date: `**Created**:` field value

**From directory name**:
- Parse `specs/{number}-{name}/` pattern
- Extract feature number (e.g., "003")
- Extract feature name (e.g., "update-workspace-docs")

**From git** (using Bash tool):
```bash
# Completion date (last commit on feature)
git log -1 --format=%cs

# Files changed compared to main
git diff --name-only main...HEAD | wc -l

# Current branch name
git rev-parse --abbrev-ref HEAD
```

**Display extracted info**:
```
=== Feature Information ===
Number:      003
Name:        update-workspace-docs
Title:       Update Workspace Documentation
Status:      Draft
Created:     2025-12-31
Completed:   2025-12-31
Files:       15 files changed
Branch:      003-update-workspace-docs
```

**Validation**:
- If spec.md not found: ERROR "No spec.md found in {target}"
- If feature number cannot be parsed: WARN and prompt user for manual input

3. **Discover Documentation Files**

Use Glob tool to find documentation files by convention:

**Priority 1 (Always check)**:
```
README.md                    # Repository root
```

**Priority 2 (Common patterns)**:
```
docs/*.md                    # Most common docs directory
doc/*.md                     # Alternative spelling
CHANGELOG.md                 # Version history at root
ROADMAP.md                   # If at root
```

**Discovery execution**:
```
Glob: README.md
Glob: docs/*.md
Glob: doc/*.md
Glob: CHANGELOG.md
Glob: ROADMAP.md
```

**Present discovered files**:
```
=== Documentation Files Found ===
[1] README.md
[2] docs/roadmap.md
[3] docs/learnings.md
[4] CHANGELOG.md

Which files should be updated? (comma-separated numbers, or 'all'):
```

Use AskUserQuestion tool to let user select which files to update.

**If no files found**: Ask user to specify paths manually.

4. **Gather Subjective Information**

Prompt user for information that cannot be automatically extracted:

**4.1 Feature Description**

Use AskUserQuestion:
```
Describe the capabilities delivered by this feature (1-2 sentences, stakeholder-friendly):

Examples:
- "LLM-driven extension for updating workspace docs after feature completion"
- "Automated milestone tracking and learnings capture"

Your description:
```

**4.2 Breaking Changes**

Use AskUserQuestion:
```
Are there any breaking changes? (yes/no)
```

If yes, prompt for details:
```
Describe the breaking changes:
```

**4.3 Dependencies Resolved**

Use AskUserQuestion:
```
Did this feature unblock other work? (yes/no)
```

If yes, prompt for details:
```
Which features/milestones were unblocked:
```

**4.4 Patterns/Learnings Identified**

Use AskUserQuestion:
```
Did this feature reveal any patterns, anti-patterns, or lessons worth documenting? (yes/no)
```

If yes, prompt for details:
```
Briefly describe the pattern/learning:
```

5. **Analyze Target Files (Parallel)**

**Threshold Check**: If selected file count ≤ 2, process sequentially (skip parallelization).

For 3+ selected documentation files, analyze in parallel using sub-agents:

**Display**:
```
Analyzing {count} documentation files in parallel...
```

a. **Launch parallel sub-agents** for each selected file:

**CRITICAL**: Launch these as PARALLEL Task calls in a single tool call block.

For each file, use Task tool with:
- subagent_type: "general-purpose"
- description: "Analyze documentation file"
- prompt: |
    You are analyzing a documentation file to find update locations.

    ## File to Analyze
    {file_path}

    ## Feature Context
    Feature Number: {feature_number}
    Feature Title: {feature_title}

    ## Instructions
    1. Read the file using the Read tool
    2. Find sections matching these patterns:
       - Milestone: "## Completed Milestones", "## Completed", "## Done", "## Changelog", "## History", "## What's New"
       - Status: "## Current Status", "## Project Status", "## Roadmap", "## Progress"
       - Learnings: "## Learnings", "## Patterns", "## Lessons Learned", "## Notes"
    3. For milestone sections, detect table format:
       - Look for `|` characters indicating markdown table
       - Parse header row to understand column structure
       - Note whether newest entries are first or last
    4. Check for duplicates:
       - Search for feature number or title in existing content
       - Report if feature appears already documented

    ## Output Format (JSON)
    ```json
    {
      "file": "README.md",
      "sections": [
        {
          "name": "Completed Milestones",
          "line": 45,
          "type": "milestone",
          "header_pattern": "## Completed Milestones"
        }
      ],
      "table_format": {
        "found": true,
        "columns": ["Feature", "Status", "Date", "Description"],
        "order": "newest_first",
        "header_line": 46,
        "separator_line": 47
      },
      "duplicate_found": false,
      "duplicate_context": null
    }
    ```

b. **Wait for all agents to complete** before proceeding.

c. **Aggregate results**:
   - Parse JSON from each agent
   - Merge all file analyses into unified structure
   - Flag any files with duplicates or issues

d. **Error handling**:
   - If an agent fails: Skip that file with warning, continue with others
   - If all agents fail: Fall back to sequential processing with warning
   - Report errors clearly: "Analysis failed for {file}. Skipping."

**Display progress**:
```
Analyzing documentation files in parallel...
✓ README.md (1 section found)
✓ docs/roadmap.md (2 sections found)
✓ CHANGELOG.md (1 section found)
All files analyzed. Proceeding with update generation.
```

**For ≤2 files (sequential processing)**:

For each selected documentation file:

a. **Read the file** using Read tool

b. **Identify relevant sections** by searching for common markers:

**Milestone/Completed sections**:
```
## Completed Milestones
## Completed
## Done
## Changelog
## History
## What's New
```

**Status sections**:
```
## Current Status
## Project Status
## Roadmap
```

**Learnings sections**:
```
## Learnings
## Patterns
## Lessons Learned
## Notes
```

c. **Detect table format** (if milestone section found):
- Look for `|` characters indicating markdown table
- Parse header row to understand column structure
- Note whether newest entries are first or last

d. **Check for duplicates**:
- Search for feature number or title in existing content
- If found: WARN "Feature may already be documented"

6. **Generate Updates**

Based on gathered information and detected file formats:

**6.1 Milestone Table Row** (for roadmap/README with milestone table):

Detect existing format and match it. Common formats:

Format A (with status emoji):
```markdown
| **Feature Title** | Status | Date | Description |
```

Format B (simple):
```markdown
| Feature | Date | Notes |
```

Generate row matching detected format:
```markdown
| **{feature_title}** | Done | {completion_date} | {description} |
```

Insert as first data row after header (newest first) or last row (oldest first) based on detected pattern.

**6.2 Learnings Entry** (if learnings captured):

```markdown
### {Learning Title}

**Context**: Feature #{number} - {feature_name}

**Problem**: {problem description from user input}

**Lesson**: {lesson from user input}

**Date**: {completion_date}
```

**6.3 Status Update** (if status section found):

Update status indicators if applicable:
```markdown
- [x] Feature #{number}: {feature_title} (Completed {date})
```

7. **Validate Updates**

Before presenting to user, validate generated content:

**Markdown Syntax**:
- Table rows have correct number of columns
- No unclosed formatting (**, *, etc.)
- Links are properly formatted

**Duplicate Check**:
- Verify feature not already in milestone table
- If duplicate found: Offer to skip or replace

**Date Format**:
- Ensure dates are consistently formatted (YYYY-MM-DD or Mon YYYY)

**Show validation results**:
```
=== Validation Results ===
[PASS] Markdown syntax valid
[PASS] No duplicate entries
[PASS] Date formats consistent
[WARN] Link to specs/003/ may not resolve (verify after merge)

Ready to proceed.
```

8. **Present Changes for Review**

Show all proposed changes in diff-style format:

```
=== Proposed Updates ===

FILE: README.md
SECTION: ## Completed Milestones
ACTION: Add row
----------------------------------------
+ | **Update Workspace Documentation** | Done | 2025-12-31 | LLM-driven extension for updating workspace docs |
----------------------------------------

FILE: docs/learnings.md
SECTION: ## Patterns
ACTION: Add entry
----------------------------------------
+ ### Convention Over Configuration
+
+ **Context**: Feature #003 - update-workspace-docs
+
+ **Lesson**: Discovering files by convention reduces config overhead...
----------------------------------------
```

**In dry-run mode**:
```
=== DRY RUN MODE ===
No files will be modified.

To apply these changes, re-run without --dry-run flag:
  /speckit.ext.update-workspace specs/003-update-workspace-docs/
```
Stop execution here.

**In normal mode**:
Use AskUserQuestion:
```
Apply these updates? (yes/no/edit)
```

If "edit": Allow user to modify content before applying.

9. **Apply Updates**

For each file to be modified:

a. **Create backup**:
```bash
cp {file} {file}.backup
```

b. **Apply edit** using Edit tool:
- Find the insertion point (section marker + table header or section end)
- Insert generated content

c. **Track results**:
- Success: Note file updated
- Failure: Note error, continue with other files

**Rollback preparation**:
Track all backup files for potential rollback.

10. **Task Completion Marking** (Optional)

Check for incomplete tasks in the feature's tasks.md:

```bash
grep -c '^\- \[ \]' {target}/tasks.md
```

If incomplete tasks found:

Use AskUserQuestion:
```
Found {count} incomplete tasks in tasks.md.
Mark all tasks as complete? (yes/no)
```

If yes:
- Read tasks.md
- Use Edit tool with `replace_all=true` to replace `- [ ]` with `- [X]`
- Verify all tasks marked complete

If no:
- WARN "Remember to update tasks.md manually"

11. **Summary Report**

Display final summary:

```
=== UPDATE SUMMARY ===

Files Updated:
  - README.md (1 milestone added)
  - docs/learnings.md (1 pattern added)
  - specs/003-update-workspace-docs/tasks.md (12 tasks marked complete)

Backups Created:
  - README.md.backup
  - docs/learnings.md.backup

Suggested Commit Message:
  docs: update workspace docs for feature #003

To rollback changes:
  git restore README.md docs/learnings.md
  # Or use backup files:
  mv README.md.backup README.md
  mv docs/learnings.md.backup docs/learnings.md

Next Steps:
  - Review changes: git diff
  - Commit: git add . && git commit -m "docs: update workspace docs for feature #003"
  - Or run: /commit
```

## Section Detection Patterns

### Milestone Tables

Common patterns to search for (case-insensitive):
```
## Completed Milestones
## Completed
## Done
## Delivered
## Released
## Changelog
## What's New
```

Table indicators:
- Line starting with `|`
- Header separator `|---|`

### Status Sections

```
## Current Status
## Project Status
## Status
## Roadmap
## Progress
```

### Learnings Sections

```
## Learnings
## Patterns
## Lessons
## Notes
## Retrospective
```

## Usage

```bash
# Update docs for specific feature
/speckit.ext.update-workspace specs/003-update-workspace-docs/

# Preview changes without applying
/speckit.ext.update-workspace specs/003-update-workspace-docs/ --dry-run

# Auto-detect feature from branch name
/speckit.ext.update-workspace
```

## Notes

**Workflow Position**: This extension is part of the pre-PR completion pipeline:
1. `/speckit.ext.closeout` - Create COMPLETION.md, HANDOVER.md
2. `/speckit.ext.cleanup` - Remove transient files
3. `/speckit.ext.update-workspace` - Update documentation (this extension)
4. `/speckit.ext.pr` or manual PR creation

**Independence**: Can run independently without cleanup. Does not require cleanup to run first.

**Convention Over Configuration**: No config files needed. Discovers documentation by standard patterns. User confirms file selection.

**Portability**: Works on any spec-kit project. No project-specific scripts or dependencies.

**Safety**:
- Always creates .backup files before modifying
- Dry-run mode for preview
- Git restore available for rollback
- Validates content before applying

**LLM-Driven**: Pure markdown instructions executed by Claude. Uses built-in tools only: Read, Edit, Write, Glob, Grep, Bash, AskUserQuestion.
