---
description: Process and clean development backlog by resolving items one-by-one
arguments: "--init-only"
handoffs:
  - label: Create Feature Spec
    agent: speckit.specify
    prompt: Create specification for promoted idea
  - label: Process Another Item
    agent: speckit.ext.backlog
    prompt: Continue processing remaining backlog items
  - label: Sync to Notion
    agent: speckit.ext.backlog-sync
    prompt: Push backlog items to Notion database
---

## User Input

```text
$ARGUMENTS
```

## Outline

Process the development backlog at `specs/BACKLOG.md` - resolve each item to empty the backlog.

**Core Principle**: Empty backlog discipline - every item gets resolved, nothing lingers.

### Execution Steps

#### Phase 1: Infrastructure Check

**ALWAYS run these checks first** before processing backlog items.

1. **Check Backlog File**

Use Glob tool to check for `specs/BACKLOG.md`.

**If exists**: Continue to step 2

**If missing**: Create using Write tool with this structure:

```markdown
# Project Backlog

**Purpose**: Capture ideas, improvements, questions, and small fixes during development without interrupting coding flow.

**How to Use**:
- Add items anytime with `/speckit.ext.backlog-add "description"`
- Process items with `/speckit.ext.backlog` during triage sessions
- **Goal: Keep backlog EMPTY** - everything properly resolved

**AI Instructions**:
- Unless explicitly directed, ignore this file during coding sessions
- When cleaning backlog: resolve each item, then DELETE it
- Don't leave "moved to X" notes - just delete after handling

---

## Quick Capture

---

## By Feature

---

## General / Cross-Cutting

---

## Questions to Resolve

---

**Last Cleaned**: Never
**Items Count**: 0
```

2. **Check Ideas Directory**

Use Glob tool to check for `ideas/README.md`.

**If exists**: Continue to step 3

**If missing**:
- Use Bash tool: `mkdir -p ideas`
- Create `ideas/README.md` using Write tool:

```markdown
# Ideas Directory

Detailed specifications for **future features** that have been identified but not yet prioritized.

## Purpose

Ideas files preserve context for features that are:
- **Parked**: Deferred from current implementation
- **Under Consideration**: Being evaluated
- **Ready to Build**: Approved, waiting for capacity

## Flow

```
Quick thought --> specs/BACKLOG.md
    | (if substantial)
    v
Detailed idea --> ideas/{name}.md
    | (when ready)
    v
Feature spec --> /speckit.specify
```

## Current Ideas

(Add idea files as they're created)

---

**Pattern Established**: {today's date}
```

3. **Check Constitution**

Read `.specify/memory/constitution.md` using Read tool.

Search for `### Development Backlog` section.

**If exists**: Continue to Phase 2

**If missing**: Add the section:

a. **Find insertion point**: Locate `### Tracking Future Ideas` section
   - If found: Insert new section immediately after it
   - If not found: Add at end of "Development Workflow" section or before "## Governance"

b. **Insert new section** using Edit tool:

```markdown
### Development Backlog

For quick capture during active development without disrupting flow:

**Location**: `specs/BACKLOG.md` (single global backlog for entire repository)

**Purpose**:
- Capture thoughts during development that would derail current work
- Quick one-liners for bugs, improvements, questions
- Temporary holding area - **goal is to keep it EMPTY**

**Pattern**:
1. **During Development**: `/speckit.ext.backlog-add "description"`
2. **Regular Cleanup**: `/speckit.ext.backlog` (daily or weekly)
3. **Resolution**: For each item:
   - Complete immediately (if quick)
   - Promote to `ideas/{name}.md` (if substantial)
   - Document in appropriate spec (if clarification)
   - Discard (if no longer relevant)
4. **Delete After Handling**: Remove from backlog once resolved

**AI Behavior**:
- Ignore backlog during implementation unless explicitly asked
- When cleaning backlog: resolve each item, then DELETE it
- Backlog should be empty after cleanup session

**Backlog vs Ideas Directory**:
- **Backlog**: Quick capture, temporary, one-liners, emptied regularly
- **Ideas**: Detailed specs, permanent, comprehensive, long-term
- **Flow**: Backlog item -> (if substantial) -> ideas/ -> (when ready) -> /speckit.specify
```

c. **Update version**: Find `**Version**: X.Y.Z` line, increment MINOR (e.g., 1.4.0 -> 1.5.0)

d. **Update date**: Change `**Last Amended**: YYYY-MM-DD` to today's date

e. **Report**:
```
Added "Development Backlog" section to constitution
Updated version: X.Y.Z -> X.Y+1.Z
```

4. **Handle --init-only Flag**

If `$ARGUMENTS` contains `--init-only`:

Report infrastructure status and exit:
```
Backlog infrastructure ready:
  specs/BACKLOG.md exists
  ideas/ directory exists
  Constitution includes "Development Backlog" section
```

**Stop here** - do not proceed to Phase 2.

#### Phase 2: Backlog Processing

5. **Read Backlog**

Read `specs/BACKLOG.md` using Read tool.

Count items (lines matching `- [ ]` pattern, excluding `- [x]` checked items).

Report:
```
Found {N} items in backlog.
```

**If 0 items**: Report "Backlog is empty. Nothing to process." and exit.

6. **Process Each Item**

For each unchecked item (`- [ ]`), work through one at a time:

a. **Present the item**:
```
Item: {description}

Resolution options:
  [A] Complete immediately (< 5 min task)
  [B] Promote to ideas/ (substantial future feature)
  [C] Document in spec (clarification/decision for existing feature)
  [D] Discard (no longer relevant)
```

b. **Get user choice** using AskUserQuestion tool with options A, B, C, D.

c. **Execute resolution**:

**Resolution A - Complete Immediately**:
- Ask: "What needs to be done to complete this?"
- Execute the task using appropriate tools
- Confirm completion with user
- Delete item from backlog using Edit tool
- Report: "Completed and removed: {description}"

**Resolution B - Promote to Ideas**:
- Ask: "Feature name for ideas file (e.g., 'csv-export'):"
- Check if `ideas/{name}.md` already exists (warn if so, ask for alternative)
- Create `ideas/{name}.md` using Write tool:

```markdown
# {Feature Title (from description)}

**Status**: Parked
**Source**: Backlog capture on {today's date}
**Builds On**: (To be determined)

## Overview

{original description}

## Dependencies

(To be determined)

## When to Implement

(To be determined)

---

*Promoted from backlog via /speckit.ext.backlog*
```

- Delete item from backlog using Edit tool
- Report: "Promoted to ideas/{name}.md"

**Resolution C - Document in Spec**:
- Ask: "Which spec directory? (e.g., specs/003-feature/)"
- Ask: "Which file? (spec.md/plan.md/other)"
- Ask: "What should be added?"
- Use Edit tool to append content to specified file
- Delete item from backlog using Edit tool
- Report: "Documented in {path} and removed from backlog"

**Resolution D - Discard**:
- Delete item from backlog using Edit tool (remove the `- [ ] {description}` line)
- Report: "Discarded: {description}"

7. **Update Metadata**

After all items processed:

a. Update "Last Cleaned" date:
- Find line starting with `**Last Cleaned**:`
- Replace with `**Last Cleaned**: {today's date}`

b. Update "Items Count":
- Count remaining `- [ ]` items (should be 0)
- Find line starting with `**Items Count**:`
- Replace with `**Items Count**: {count}`

8. **Summary Report**

Display completion summary:

```
Backlog Processing Complete
---------------------------
Items processed: {N}
  - Completed: {count}
  - Promoted to ideas/: {count}
  - Documented in specs: {count}
  - Discarded: {count}

Current backlog items: 0
Last cleaned: {date}

Run /speckit.ext.backlog-add to capture new items.
```

## Usage

```bash
/speckit.ext.backlog              # Full processing (init + triage)
/speckit.ext.backlog --init-only  # Just set up infrastructure
```

## Notes

**Empty backlog discipline**: The goal is zero items after processing. Every item must be resolved.

**No "moved to" notes**: Delete items completely after resolution. Don't leave breadcrumbs like "moved to ideas/foo.md".

**Interactive by design**: Each item requires user decision. This is intentional - it forces review and prevents automatic categorization errors.

**Constitution modification**: Safe because we're adding a section, not modifying existing content. Version bump ensures traceability.

**Workflow position**: Orthogonal to main pipeline. Use `/speckit.ext.backlog-add` anytime; use `/speckit.ext.backlog` between features or during dedicated triage sessions.
