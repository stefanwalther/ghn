---
name: speckit-ext-session-handover
description: Mid-implementation context handover with proactive monitoring and continuation prompts
compatibility: Requires spec-kit project structure with .specify/ directory
metadata:
  author: github-spec-kit
  source: ext:commands/speckit.ext.session-handover.md
---

## AI Self-Monitoring: Context Awareness

**IMPORTANT**: As the AI assistant, you should proactively monitor context usage during implementation sessions.

### Context Heuristics

Monitor these signals to estimate context usage:
- **Message count**: More than 30-40 exchanges suggests high context usage
- **Large file reads**: Each large file (>500 lines) consumes significant context
- **Cumulative output**: Long responses fill context faster
- **Tool call count**: Each tool call adds overhead

### Warning Thresholds

| Level | Signals | Action |
|-------|---------|--------|
| **Normal** | <30 messages, few large reads | Continue normally |
| **Warning (~80%)** | 30-40 messages, multiple large reads, noticeable slowdown | Proactively suggest: "Context is filling up. Consider running `/speckit.ext.session-handover` to preserve state." |
| **Critical (~90%)** | >40 messages, many file reads, definite slowdown | Strongly recommend: "Context nearly full. I recommend we create a handover now to avoid losing implementation context. Run `/speckit.ext.session-handover --quick`?" |

### Proactive Behavior

When you sense context pressure:
1. **Mention it naturally** in your response: "I notice we've been working for a while and context may be getting full..."
2. **Offer the handover option**: "Would you like me to create a session handover now?"
3. **At critical level**: Auto-suggest quick mode to minimize additional context usage

---

## When to Use This Extension

**Use `/speckit.ext.session-handover` when:**
- Context window is running low (AI warns you or you notice slowdown)
- End of work session (need to pause and continue later)
- Switching to a different task temporarily
- Before auto-compact destroys critical implementation context

**Use `/speckit.ext.closeout` instead when:**
- Feature is COMPLETE and ready for PR
- You want comprehensive COMPLETION.md and HANDOVER.md

**The key difference**: This extension is for PAUSING mid-implementation. Closeout is for FINISHING a complete feature.

---

## User Input

```text
$ARGUMENTS
```

You **MUST** consider the user input before proceeding (if not empty).

## Outline

This extension captures current implementation state and generates a continuation prompt that enables the next session to pick up immediately without re-reading files.

**Core Principle**: The continuation prompt is the primary deliverable. It must be self-contained, copy-paste ready, and actionable.

### Execution Steps

1. **Parse Arguments and Detect Feature**

a. **Parse Arguments**:
   - Extract spec directory if provided
   - Check for `--quick` flag (skip all prompts)
   - Check for `--notes "..."` argument
   - If `--help`: Display usage and exit

b. **Auto-detect Feature** (if no directory provided):
   - Get current branch: `git rev-parse --abbrev-ref HEAD`
   - Extract feature number from branch name (pattern: `###-feature-name`)
   - Find matching spec directory: `specs/{number}-*`

c. **Validate Feature Directory**:
   - Check spec directory exists
   - Check tasks.md exists (primary source of progress)
   - If missing: Use git diff as fallback for state capture

d. **Check if Feature is Complete**:
   - Read tasks.md and count incomplete tasks
   - If all tasks complete: Warn "Feature appears complete. Consider using `/speckit.ext.closeout` instead for full completion documentation."
   - Continue if user wants handover anyway

**Display** (unless --quick):
```
=== Session Handover ===

Feature: #{number} - {name}
Branch: {branch-name}
Spec: specs/{number}-{name}/

This will:
1. Capture current implementation state
2. Create SESSION-{date}.md
3. Generate continuation prompt for next session

Continue? [Y/n]
```

2. **Capture Implementation State**

a. **Parse tasks.md**:
   - Read tasks.md using Read tool
   - Categorize tasks:
     - **Completed**: Lines matching `- [x]` or `- [X]`
     - **In Progress**: First incomplete task after last completed (infer current work)
     - **Pending**: Remaining incomplete tasks `- [ ]`
   - Extract task IDs and descriptions

b. **Capture Git State**:
   - Recent changes: `git diff --name-only HEAD~5..HEAD 2>/dev/null || git diff --name-only`
   - Modified files: `git status --porcelain`
   - Current branch: `git rev-parse --abbrev-ref HEAD`

c. **Extract Feature Context**:
   - Read spec.md for feature title and description
   - Get current date for timestamp

**Internal State** (don't display, use for generation):
```
completed_tasks: [T001, T002, ...]
in_progress_task: T00X
pending_tasks: [T00Y, T00Z, ...]
recent_files: [file1.md, file2.py, ...]
branch: 012-session-handover
feature_name: Session Handover Extension
```

3. **Gather Developer Notes** (unless --quick)

a. **Check for --notes argument**:
   - If provided: Use the notes value directly
   - If not provided and not --quick: Prompt for notes

b. **Interactive Notes Prompt** (if not --quick and no --notes):
   ```
   Add any notes for the next session? (blockers, decisions, context)
   
   Press Enter to skip, or type your notes:
   > 
   ```

c. **Capture "What I Was Working On"**:
   - AI should describe in its own words what it was actively working on
   - Be specific: "Adding the 90% threshold warning" not "implementing features"
   - Include any pending decisions or open questions

4. **Generate SESSION-{date}.md**

Create the handover document in the spec directory.

**File**: `specs/{number}-{name}/SESSION-{YYYY-MM-DD}.md`

**If file exists**: Append timestamp to make unique: `SESSION-{YYYY-MM-DD}-{HHMM}.md`

**Content**:
```markdown
# Session Handover - {DATE}

**Feature**: #{number} - {name}
**Branch**: {branch-name}
**Paused**: {timestamp}

---

## Progress Summary

**Completed**: {count} tasks
**In Progress**: {count} tasks
**Remaining**: {count} tasks

### Completed Tasks
{list of completed tasks with IDs}

### In Progress
- [ ] {current task ID}: {description} ← CURRENT

### Next Up
{list of next 3-5 pending tasks}

---

## Recent Changes

Files modified in this session:
{list of recently modified files}

---

## What I Was Working On

{AI-generated description of current work - specific and actionable}

---

## Key Decisions Made This Session

{Bullet list of any decisions made, or "None documented"}

---

## Developer Notes

{user-provided notes or "None"}

---

## Blockers / Questions

{Any unresolved issues, or "None"}

---

## Continuation Prompt

{The formatted continuation prompt - see Step 5}
```

5. **Generate Continuation Prompt**

This is the PRIMARY DELIVERABLE. Generate a self-contained prompt that enables immediate pickup.

**Format**:
```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
📋 CONTINUATION PROMPT - Copy everything below this line
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Continue implementing {feature name} (#{number}).

## Context
- **Branch**: `{branch}` (already checked out)
- **Spec**: `specs/{number}-{name}/spec.md`
- **Handover**: `specs/{number}-{name}/SESSION-{date}.md`

## Progress
- ✅ Completed: {task range or count}
- 🔄 In Progress: {current task ID} - {description}
- ⏳ Remaining: {count} tasks

## What I Was Working On
{specific description of current work}

## Key Decisions Made
{bullet list of decisions, or "See handover document"}

## Next Action
{specific, actionable instruction for what to do next}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
```

**Critical Requirements for Continuation Prompt**:
- **Self-contained**: Next session should NOT need to read spec.md or tasks.md to understand context
- **Specific Next Action**: Not "continue implementation" but "Add the 90% warning threshold in line 45"
- **Copy-paste ready**: Clear delimiters, user copies verbatim
- **Actionable**: AI can take action in first response, not "let me read the files first"

6. **Write and Display**

a. **Write SESSION-{date}.md**:
   - Use Write tool to create the file in spec directory
   - Include the continuation prompt in the document

b. **Display Summary** (unless --quick):
   ```
   === Session Handover Complete ===
   
   Feature: #{number} - {name}
   Branch: {branch}
   Paused: {timestamp}
   
   Progress:
   ✅ Completed: {count} tasks
   🔄 In Progress: {current task}
   ⏳ Remaining: {count} tasks
   
   Created:
   📄 specs/{number}-{name}/SESSION-{date}.md
   
   ---
   ```

c. **Display Continuation Prompt**:
   - Show the formatted continuation prompt prominently
   - This is what the user copies for the next session

d. **Final Note**:
   ```
   Copy the continuation prompt above to start your next session.
   The next AI will have full context to continue immediately.
   ```

## Quick Mode Behavior

When `--quick` flag is used OR at critical context threshold:

1. **Skip all prompts**: No confirmation, no interactive notes
2. **Minimal output**: Write file, display only the continuation prompt
3. **Fast execution**: Minimize token usage
4. **Still capture state**: Full state capture, just no interaction

**Quick mode output**:
```
Session handover created: specs/{number}-{name}/SESSION-{date}.md

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
📋 CONTINUATION PROMPT
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
{continuation prompt}
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
```

## Usage Examples

```bash
# Standard handover (auto-detect feature)
/speckit.ext.session-handover

# Quick mode - no prompts, minimal output
/speckit.ext.session-handover --quick

# With notes
/speckit.ext.session-handover --notes "Was debugging the threshold logic"

# Specific feature directory
/speckit.ext.session-handover specs/012-session-handover/

# Combine flags
/speckit.ext.session-handover --quick --notes "Context critical"
```

## Edge Cases

- **No tasks.md**: Use git diff as primary state source, warn user
- **No git changes**: Still create handover with tasks state
- **All tasks complete**: Warn and suggest closeout instead
- **Multiple sessions same day**: Append timestamp to filename
- **Auto-compact already happened**: Capture what's available, warn about potential context loss

## Notes

- **Primary Deliverable**: The continuation prompt, not the SESSION file
- **Goal**: Next session acts immediately, no "let me read the files first"
- **Context Efficiency**: Quick mode uses minimal tokens
- **Preservation**: SESSION-{date}.md files should be kept (valuable for project history)
- **Platform**: Works on Claude Code and Cursor (AI self-monitoring)