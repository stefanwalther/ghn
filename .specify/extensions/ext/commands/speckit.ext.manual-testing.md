---
description: User-led manual testing with structured feedback collection
arguments: "[init|status|complete] [spec-directory]"
handoffs:
  - label: Validate Feature
    agent: speckit.ext.validate
    prompt: Run validation checks on the completed feature
  - label: Finalize Feature
    agent: speckit.ext.finalize
    prompt: Cleanup and update workspace docs
---

## User Input

```text
$ARGUMENTS
```

## Core Principle

User tests feature manually and adds issues to Active Issues section. You present issues, recommend, and **wait for approval before fixing**. Document in Solved Issues with: **How fixed**, **Technical**, **Key learning**.

**Parallel workflow**: User continues testing and adding issues while you fix approved items. User owns the queue and approves all fixes.

**CRITICAL - Verification Gate**: After fixing an issue, you MUST wait for user's **explicit confirmation** that the fix works before moving it to Solved Issues. "Looks good", "confirmed", "verified", "that fixed it" = explicit confirmation. Other messages (questions, new issues, general chat) do NOT count as confirmation. Track pending verifications and remind the user until they explicitly confirm.

## Parse Arguments

1. Extract subcommand: `init`, `status`, or `complete`
2. Extract spec-directory if provided
3. If no spec-directory: auto-detect from git branch
   ```bash
   git rev-parse --abbrev-ref HEAD  # e.g., "004-validate"
   # Find matching: specs/004-*/
   ```
4. If no subcommand and `manual-testing.md` exists: show queue status (same as `status`)
5. If no subcommand and no file exists: run `init`

## Commands

### init

1. Read spec directory context: `spec.md`, `plan.md`, `tasks.md`, and other docs
   - Understand what the feature SHOULD do
   - Note any edge cases or specific requirements
2. Create `specs/{feature}/manual-testing.md` with template below
3. Extract After Work tasks from `spec.md` and `plan.md` (look for documentation tasks, post-implementation items)
4. Show welcome message: "Ready for manual testing. I've reviewed the spec - add issues to Active Issues as you find them."

**Template:**
```markdown
---
feature: #{number} - {title}
started: {date}
status: in-progress
---

# Manual Testing

## Active Issues

## Solved Issues

## After Work

- [tasks extracted from spec/plan]
```

### status

Read `manual-testing.md` and present:
```
Ready. Here's where we are:

Active Issues (N):
1. [issue] 
2. [issue]
...

Solved: M issues

**Recommendation**: [which to fix and why]

Which one should I fix next?
```

If no active issues: "No active issues. Add issues to the file or say 'done testing' to complete."

### complete

**Triggers**: `/speckit.ext.manual-testing complete` OR user says "done testing"

1. Check Active Issues section is empty
   - If not empty: "You have N active issues. Resolve them first."
2. Update frontmatter `status: complete`
3. Present After Work tasks:
   ```
   Testing complete. N issues solved.
   
   After Work tasks:
   - [task 1]
   - [task 2]
   ...
   
   Should I execute these now?
   ```
4. **Wait for approval** before executing After Work tasks
5. If approved: Execute tasks one by one, report each completion

## Issue Flow

### How issues get added (by USER)

User adds issues to Active Issues section by directly editing the file while testing.

You do NOT add to Active Issues unless user explicitly asks ("add this to active for me"). This is rare - user normally adds themselves.

### How issues get fixed (by YOU)

When user asks you to look at `manual-testing.md` or work on issues:

1. Read Active Issues section
2. Present the queue with recommendation:
   ```
   You have 5 active issues:

   1. Button doesn't save
   2. Table cells not clickable  
   3. Autocomplete missing entries
   4. Date picker wrong format
   5. Modal doesn't close on ESC

   **Recommendation**: Start with #2 (Table cells) - likely a quick CSS fix 
   that might apply to other tables too.

   Which one should I fix next?
   ```
3. **Wait for user to choose** (do NOT proceed without explicit approval)
4. Only after approval: Fix the selected issue **properly**
   - Follow project constitution, architecture, and design principles
   - No shortcuts or hacks - maintain code quality
   - Add regression test for the fix (default: yes, unless trivial or user declines)
   - Update documentation if affected
5. After fix is implemented, ask user to verify: "Please test and confirm this fix works."
6. **WAIT for explicit confirmation** before moving to Solved Issues
   - Explicit confirmation examples: "looks good", "confirmed", "verified", "that fixed it", "working now"
   - NOT confirmation: new bug reports, questions, general messages, other topics
   - If user sends non-confirmation messages: Continue helping with those, but REMEMBER the pending verification
   - Keep reminding: "By the way, I still need your confirmation on [issue] before I can mark it solved."
7. Only after explicit confirmation: Document in Solved Issues:
   ```markdown
   N. **[Problem description]**
      - **How fixed**: [1-2 sentences]
      - **Technical**: [File paths, code changes]
      - **Key learning**: [Reusable pattern for future]
   ```
8. Present remaining queue again (back to step 2)

**If user reports a bug verbally**: Ask "Should I add this to Active Issues?" If yes, add it. Then present the queue and ask which to fix.

**Recommendation criteria** (in order of priority):
1. Quick wins that unblock testing other features
2. Issues that might apply globally (fix once, benefit everywhere)
3. Critical functionality over cosmetic issues
4. Dependencies (fix A before B if B depends on A)

**Key learning quality**:
- Good: "Link must fill entire cell. Move padding from container to link."
- Bad: "Fixed the bug" (not reusable)

## Behaviors

**Always**:
- Follow constitution, spec, plan, and tasks when fixing (tests, docs, standards)
- Document all three components (How fixed, Technical, Key learning)
- Ask user to verify each fix and **wait for explicit confirmation**
- Track pending verifications across messages - remind user even if conversation shifts topics
- If fix applies globally: apply to all affected features, note in the entry

**Never**:
- Fix anything without user's explicit approval first
- Move issue to Solved without user's **explicit confirmation** that the fix works
- Assume other messages (new issues, questions, chat) count as confirmation - they don't
- "Forget" pending verifications when user changes topics - always track and remind
- Violate architectural or design principles for a quick fix
- Take shortcuts to "make user happy" - quality over speed
- Add issues to Active Issues (that's user's job)
- Execute After Work without asking (even after "done testing", ask first)
- Skip documentation components

## Edge Cases

**No subcommand, file exists**: Enter conversational mode (ready for bug reports)

**No subcommand, no file**: Run `init`

**User adds multiple issues**: Fix them one by one in order, move each to Solved when done

**Fix reveals new bug**: Complete documenting first bug, then address new bug separately

**Issue not in spec**: Ask "I don't see this in the spec. Is this a bug or a new requirement?" If new requirement, suggest: "This looks like a scope change - consider adding to backlog instead."

**Complex fix detected**: Warn before starting: "This looks complex - requires [scope]. Proceed?" Let user decide to continue, defer, or break down.

**Can't reproduce/understand**: Ask for more details: steps to reproduce, browser/environment, error messages, expected vs actual behavior.

**File already exists on init**: Ask user if they want to continue existing session or start fresh

**Active Issues not empty on complete**: Block completion, list remaining issues

**Pending verification when user changes topic**: Continue helping with new topic, but remind: "I still need your confirmation on [issue] - please verify when you can." Repeat reminder if user continues without confirming.
