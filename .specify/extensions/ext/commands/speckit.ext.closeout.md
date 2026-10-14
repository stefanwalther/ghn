---
description: Pre-PR (optional): create documentation artifacts (COMPLETION.md, HANDOVER.md) for complex features. Run before finalize → pr.
arguments: "[spec-directory] [--skip-validation]"
handoffs:
  - label: Create PR
    agent: speckit.ext.pr
    prompt: Create pull request for this feature
  - label: Finalize
    agent: speckit.ext.finalize
    prompt: Cleanup transient files and update workspace docs
---

## When to Use This Extension

**Use `/speckit.ext.closeout` (this command) for complex features.** This is the heavyweight option (15-20 min) that creates comprehensive documentation including COMPLETION.md (what was delivered, lessons learned) and HANDOVER.md (knowledge transfer for future developers).

**Use `/speckit.ext.finalize` for routine features.** That's the lightweight option (~2-5 min) that just cleans up transient files and updates README/CHANGELOG. Use it for most PRs.

**Use this command when:**
- The feature is complex and someone else will maintain the code
- You want to capture lessons learned (what went well, what could improve)
- You need comprehensive PR descriptions generated
- Knowledge transfer documentation is valuable

**After closeout, continue with** `/speckit.ext.finalize` to clean up transient files, then `/speckit.ext.pr` to create the pull request.

---

## User Input

```text
$ARGUMENTS
```

You **MUST** consider the user input before proceeding (if not empty).

## Outline

This extension orchestrates the complete feature closeout process, ensuring nothing is forgotten before creating a PR. It combines workspace documentation updates, completion documentation, validation, and PR preparation.

**Core Principle**: Systematic closeout with confidence everything is done.

### Execution Steps

1. **Parse Arguments and Detect Feature**

a. **Parse Arguments**:
   - Extract spec directory if provided
   - Check for `--skip-validation` flag
   - If `--help`: Display usage and exit

b. **Auto-detect Feature** (if no directory provided):
   - Get current branch: `git rev-parse --abbrev-ref HEAD`
   - Extract feature number from branch name
   - Find matching spec directory: `specs/{number}-*`

c. **Validate Feature Directory**:
   - Check spec.md, plan.md, tasks.md exist
   - If missing: Report error and exit

d. **Extract Feature Information**:
   - Read spec.md for title and description
   - Get feature number from directory name
   - Get completion date: current date

**Display**:
```
=== Feature Closeout ===

Feature: #{number} - {title}
Branch: {branch-name}
Date: {current-date}

Ready to start closeout? [Y/n]
```

2. **Workflow Position Note**

This step reminds the user of the remaining workflow before creating the PR.

**Display**:
```
Closeout creates COMPLETION.md and HANDOVER.md.

After closeout, continue with:
  1. /speckit.ext.finalize - Cleanup transient files + update docs
  2. /speckit.ext.pr - Create pull request

Continuing with closeout...
```

3. **Prepare Documentation Context (Parallel)**

Gather context for both COMPLETION.md and HANDOVER.md in parallel using sub-agents, then interact with user sequentially.

**Display**:
```
Preparing COMPLETION.md and HANDOVER.md context in parallel...
```

a. **Launch parallel sub-agents** to gather context:

**CRITICAL**: Launch these as PARALLEL Task calls in a single tool call block.

**Agent 1 - COMPLETION.md Context Gatherer**:
Use Task tool with:
- subagent_type: "general-purpose"
- description: "Gather COMPLETION.md context"
- prompt: |
    You are gathering context for a feature completion summary document.

    ## Feature Directory
    {spec_directory_path}

    ## Instructions
    1. Read spec.md to extract:
       - Feature title
       - All functional requirements (FR-001, FR-002, etc.)
       - Success criteria
    2. Read tasks.md to count:
       - Total tasks
       - Completed tasks (marked [X] or [x])
    3. Use git to get:
       - Files changed count: `git diff main...HEAD --name-only | wc -l`
       - Last commit date: `git log -1 --format=%cs`

    ## Output Format (JSON)
    ```json
    {
      "feature_title": "Feature title from spec.md",
      "requirements": [
        {"id": "FR-001", "description": "Requirement text"},
        {"id": "FR-002", "description": "Requirement text"}
      ],
      "success_criteria": ["SC-001: ...", "SC-002: ..."],
      "tasks_total": 15,
      "tasks_completed": 15,
      "files_changed": 23,
      "completion_date": "2026-01-28"
    }
    ```

**Agent 2 - HANDOVER.md Context Gatherer**:
Use Task tool with:
- subagent_type: "general-purpose"
- description: "Gather HANDOVER.md context"
- prompt: |
    You are gathering context for a knowledge transfer handover document.

    ## Feature Directory
    {spec_directory_path}

    ## Instructions
    1. Read spec.md to understand:
       - What the feature does (high-level purpose)
       - Key entities or components involved
    2. Read plan.md to identify:
       - Key files/components created or modified
       - Architecture decisions made
    3. Look for testing hints in:
       - quickstart.md (if exists)
       - spec.md User Scenarios section

    ## Output Format (JSON)
    ```json
    {
      "feature_purpose": "1-2 sentence explanation of what this feature does",
      "key_components": [
        {"file": "path/to/file.ts", "purpose": "What this file does"},
        {"file": "path/to/other.ts", "purpose": "What this file does"}
      ],
      "testing_hints": "How to manually test this feature",
      "config_notes": "Any configuration required, or null if none",
      "architecture_notes": "Key architectural decisions from plan.md"
    }
    ```

b. **Wait for all agents to complete** before proceeding.

c. **Handle agent failures**:
   - If COMPLETION agent fails: Gather context manually (fallback to sequential)
   - If HANDOVER agent fails: Skip to user prompt about whether handover is needed
   - Report errors clearly: "Context gathering failed for {doc}. Proceeding with manual input."

**Display**:
```
Context gathering complete.
- COMPLETION.md: Ready (requirements: X, tasks: Y/Z)
- HANDOVER.md: Ready (components: N identified)
```

4. **Gather User Input and Generate Documents (Sequential)**

Now interact with user to complete the documents using gathered context.

a. **COMPLETION.md User Input**:

Display pre-gathered context and prompt user for subjective information:
```
=== COMPLETION.md ===

Pre-gathered context:
- Requirements found: {count}
- Tasks completed: {completed}/{total}
- Files changed: {count}

Please provide:
```

Prompt user for:
- Summary of what was delivered (2-3 paragraphs)
- Key changes made
- What went well
- What could improve

b. **Generate COMPLETION.md**:
```markdown
# Feature #{number}: {name} - COMPLETE

**Completion Date**: {date}
**Status**: All requirements met
**Quality**: Production-ready

---

## What Was Delivered

{user-provided summary}

---

## Requirements Met

{from Agent 1 context}
- ✅ FR-001: {requirement}
- ✅ FR-002: {requirement}

---

## Key Changes

**Files Changed**: {from Agent 1 context}

**Major Changes**:
{user-provided list}

---

## Lessons Learned

**What went well**:
{user input}

**What could improve**:
{user input}

---

**Ready for PR**: ✅
```

c. **Write COMPLETION.md**:
   - Create `specs/{feature}/COMPLETION.md`

**Output**:
```
Completion Documentation:
✓ Created COMPLETION.md
```

d. **HANDOVER.md User Decision**:
```
Create handover documentation for knowledge transfer? [Y/n]
```

e. **If Yes, gather HANDOVER.md user input**:

Display pre-gathered context and prompt for remaining info:
```
=== HANDOVER.md ===

Pre-gathered context:
- Feature purpose: {from Agent 2}
- Key components: {count} identified
- Testing hints: {available/not found}

Please provide or confirm:
```

Prompt user for:
- Confirm/edit feature explanation
- Additional components to document
- Testing instructions (confirm or expand)
- Configuration notes
- Known issues or limitations
- Tips for future modification

f. **Generate HANDOVER.md**:
```markdown
# Handover: Feature #{number} - {name}

**Completed**: {date}
**For**: Future developers

---

## What This Feature Does

{from Agent 2 context, refined by user}

---

## Key Components

| Component | Purpose |
|-----------|---------|
{from Agent 2 context, expanded by user}

---

## How to Test

{from Agent 2 hints, expanded by user}

---

## Configuration

{user input, or "None required"}

---

## Known Issues/Limitations

{user input, or "None identified"}

---

## Tips for Modification

{user input}

---

## Quick Start

1. Read spec.md (10 min)
2. Review plan.md architecture (5 min)
3. Read this handover (5 min)
```

g. **Write HANDOVER.md**:
   - Create `specs/{feature}/HANDOVER.md`

**Output**:
```
Handover Documentation:
✓ Created HANDOVER.md
(or: Skipped - user opted out)
```

5. **Run Validation**

Execute validation checks (delegate to `/speckit.ext.validate`).

a. **Check Skip Flag**:
   - If `--skip-validation`: Skip this step with warning

b. **Ask User**:
```
Run validation checks?

Options:
a) Full validation - Run all checks
b) Quick validation - Tasks and code standards only
c) Skip - Already validated or will validate separately
```

c. **Execute Validation**:
   - If Full: Run `/speckit.ext.validate`
   - If Quick: Run `/speckit.ext.validate --quick`
   - Parse results for pass/fail verdict

d. **Handle Results**:
   - If PASS: Continue to Step 6
   - If FAIL: Display issues, ask if user wants to continue anyway

**Output**:
```
Validation:
✅ PASSED - 7/7 checks
(or: ⚠️ WARNINGS - 2 issues found)
(or: ❌ FAILED - 3 blocking issues)
```

6. **Generate PR Description**

Create comprehensive PR description for copy/paste.

a. **Gather PR Information**:
   - Ask for GitHub issue number (if applicable)
   - Ask for any reviewer notes

b. **Generate Description**:
```markdown
## Feature #{number}: {title}

### What & Why

{from spec.md or COMPLETION.md}

**Problem**: {what problem this solves}
**Solution**: {how it solves it}

### Changes

**Major Changes**:
{from COMPLETION.md}

**Files Changed**: {count}

**Breaking Changes**: {yes/no}

### Testing

- ✅ All tests passing
- ✅ Manual validation complete

### Documentation

- spec.md - Feature specification
- COMPLETION.md - Completion summary
- HANDOVER.md - Knowledge transfer

### Checklist

- [ ] Code follows project standards
- [ ] Tests are comprehensive
- [ ] Documentation is complete
- [ ] No security issues

---

Closes #{issue-number} (if applicable)
```

c. **Display to User**:
   - Show generated PR description
   - User can copy for PR creation

**Output**:
```
PR Description:
✓ Generated (shown above)
  Copy and use when creating PR
```

7. **Present Final Checklist**

Show comprehensive closeout summary.

```
=== Feature Closeout Complete ===

Feature: #{number} - {title}
Branch: {branch}
Date: {date}

Documentation:
✅ COMPLETION.md created
✅ HANDOVER.md created (or skipped)

Validation:
✅ All checks passed (or status)

PR Preparation:
✅ Description generated

---

Files Created:
- specs/{feature}/COMPLETION.md
- specs/{feature}/HANDOVER.md

---

## Next Steps

1. Finalize: `/speckit.ext.finalize` (cleanup + update docs)
2. Create PR: `/speckit.ext.pr`

---

Feature closeout complete!
```

## Usage Examples

```
# Full closeout workflow (auto-detect feature)
/speckit.ext.closeout

# Closeout specific feature
/speckit.ext.closeout specs/004-validate/

# Skip validation (already validated)
/speckit.ext.closeout --skip-validation
```

## Notes

- **Duration**: 15-20 minutes for thorough closeout
- **Goal**: Nothing forgotten before PR
- **Integration**: Delegates to `/speckit.ext.validate` for Step 5
- **Workflow Position**: After implementation, before finalize
- **Output**: COMPLETION.md, HANDOVER.md, PR description
