---
description: Quick-add item to development backlog without interrupting flow
arguments: "<description>"
---

## User Input

```text
$ARGUMENTS
```

## Outline

Quick-capture an idea to `specs/BACKLOG.md` without interrupting your workflow.

**Core Principle**: Complete in < 2 seconds. Minimal output. Non-blocking.

### Execution Steps

1. **Extract Description**

Parse `$ARGUMENTS`:
- If argument provided: Use it as description
- If empty: Use AskUserQuestion tool to prompt: "What do you want to capture?"

2. **Ensure Backlog Exists**

Check if `specs/BACKLOG.md` exists using Glob tool.

**If file exists**: Continue to step 3

**If missing**: Create it using Write tool with this structure:

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

3. **Append Item to Quick Capture Section**

Use Edit tool to append the item immediately after the `## Quick Capture` heading.

Find this pattern in the file:
```
## Quick Capture
```

Insert after it (before the next `---` or `##`):
```
- [ ] {description}
```

4. **Confirm** (minimal output)

Report **only**:
```
+ {description}
```

**No additional output**. Return user to their previous context immediately.

## Usage

```bash
/speckit.ext.backlog-add "Add dark mode to HTML briefings"
/speckit.ext.backlog-add "Button alignment broken on mobile"
/speckit.ext.backlog-add "Should we support multiple profiles?"
```

## Notes

**Speed is paramount**: This command exists to capture thoughts without breaking flow. Every operation must be fast.

**No categorization**: Items always go to "Quick Capture" section. Categorization happens during `/speckit.ext.backlog` triage.

**Location**: Always `specs/BACKLOG.md` (global backlog for entire repository).

**Minimal output**: Only `+ {description}` on success. No decorations, no summaries.
