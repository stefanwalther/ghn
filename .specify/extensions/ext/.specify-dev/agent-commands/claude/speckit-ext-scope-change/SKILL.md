---
name: speckit-ext-scope-change
description: Document scope changes and ad-hoc additions during feature implementation
compatibility: Requires spec-kit project structure with .specify/ directory
metadata:
  author: github-spec-kit
  source: ext:commands/speckit.ext.scope-change.md
---

## User Input

```text
$ARGUMENTS
```

You **MUST** consider the user input before proceeding (if not empty).

## Outline

This extension documents scope changes that occur during implementation - expansions, reductions, or pivots. It keeps specification documents honest and current by updating spec.md, plan.md, and tasks.md to reflect what was actually built.

**Core Principle**: Documentation reflects reality, not fiction.

### Execution Steps

1. **Parse Arguments and Detect Feature**

a. **Parse Arguments**:
   - Extract spec directory if provided
   - If `--help`: Display usage and exit

b. **Auto-detect Feature** (if no directory provided):
   - Get current branch: `git rev-parse --abbrev-ref HEAD`
   - Extract feature number from branch name
   - Find matching spec directory: `specs/{number}-*`

c. **Validate Feature Directory**:
   - Check spec.md exists
   - Check plan.md exists
   - Check tasks.md exists
   - If missing: Report error and exit

2. **Analyze Current State**

a. **Read Original Scope**:
   - Read spec.md to understand original requirements
   - Read plan.md to understand original approach
   - Read tasks.md to see original task breakdown

b. **Extract Key Information**:
   - Feature title and description
   - Original requirements list
   - Original success criteria
   - Planned deliverables

**Display to User**:
```
=== Current Feature ===

Feature: #{number} - {title}
Branch: {branch-name}

Original Scope:
- {requirement 1}
- {requirement 2}
- ...

Planned Deliverables:
- {deliverable 1}
- {deliverable 2}
```

3. **Gather Scope Change Information**

Use AskUserQuestion tool to gather context:

a. **What Changed?**
```
What was built beyond/different from the original plan?
(Describe in bullet points)
```

b. **Why Did It Change?**
```
Why did scope change during implementation?

Options:
a) Discovered additional value during work
b) Found better approach than planned
c) Original plan was incomplete
d) Technical constraints required changes
e) User/stakeholder requested changes
f) Other: [describe]
```

c. **Change Type Assessment**:
```
What type of change is this?

Options:
a) Scope Expansion - Built MORE than planned
b) Scope Reduction - Built LESS than planned (deferred items)
c) Scope Pivot - Built DIFFERENT than planned
```

d. **Impact Assessment**:
```
Estimate the impact:

Time impact: [same / slightly more / significantly more]
Complexity: [same / simpler / more complex]
Value delivered: [same / less / more]
```

4. **Update spec.md**

Add a "Scope Changes" section to document what changed:

a. **Check if Section Exists**:
   - Read spec.md
   - Search for "## Scope Changes"
   - If exists: Append to existing section
   - If not: Add new section before Success Criteria

b. **Generate Scope Changes Content**:
```markdown
## Scope Changes

### {Date} - {Change Type}

**Original Scope**:
{summarize from spec requirements}

**Actual Deliverables**:
{list from user input}

**Rationale**:
{reason from user input}

**Impact Assessment**:
- Time: {impact}
- Complexity: {impact}
- Value: {impact}

**Decision**: Approved on {date}
```

c. **Apply Update**:
   - Use Edit tool to add section to spec.md
   - Preserve existing content

5. **Update plan.md**

Add an "Implementation Changes" section:

a. **Check if Section Exists**:
   - Search for "## Implementation Changes"
   - If exists: Append
   - If not: Add new section

b. **Generate Content**:
```markdown
## Implementation Changes

### {Date}

**Original Approach**:
{summarize from plan.md}

**Actual Approach**:
{describe based on user input}

**Why Different**:
{rationale}

**Validation**:
- Constitutional compliance: {assessment}
- Complexity impact: {assessment}
- Value impact: {assessment}
```

c. **Apply Update**:
   - Use Edit tool to add section

6. **Update tasks.md**

Add ad-hoc tasks for work not in original plan:

a. **Check for Ad-Hoc Section**:
   - Search for "## Ad-Hoc Tasks"
   - If not exists: Add at end of file

b. **Generate Task Entries**:
```markdown
## Ad-Hoc Tasks (Added {Date})

- [x] T{next-number} [AD-HOC] {task description}
- [x] T{next-number} [AD-HOC] {task description}

**Reason**: {scope change summary}
```

c. **Apply Update**:
   - Use Edit tool to add section
   - Mark tasks as complete if already done

7. **Create Decision Record** (Optional)

For significant scope changes, create a decision record:

a. **Ask User**:
```
This appears to be a significant scope change.
Create a decision record? [Y/n]
```

b. **If Yes, Create File**:
   - Create directory if needed: `specs/{feature}/decisions/`
   - Create file: `scope-{type}-{date}.md`

c. **Decision Record Template**:
```markdown
# Scope {Type}: {Brief Title}

**Date**: {date}
**Decision**: {Expand/Reduce/Pivot} feature scope
**Status**: Implemented

## Context

**Original Scope**:
{from spec.md}

**New Scope**:
{from user input}

**Trigger**:
{what caused the change}

## Decision

**What**: {describe the change}

**Why**: {rationale}

**Alternatives Considered**:
1. Stick to original plan - {assessment}
2. Defer to separate feature - {assessment}
3. {Chosen option} - SELECTED

## Consequences

**Positive**:
- {benefits}

**Negative**:
- {costs/risks}

**Mitigation**:
- {how to address negatives}

## Approval

**Approved by**: {user}
**Date**: {date}
```

8. **Present Summary**

Display comprehensive summary of changes made:

```
=== Scope Change Summary ===

Feature: #{number} - {title}
Change Type: {Expansion/Reduction/Pivot}
Date: {date}

Files Updated:
✓ spec.md - Added "Scope Changes" section
✓ plan.md - Added "Implementation Changes" section
✓ tasks.md - Added {N} ad-hoc tasks
✓ decisions/scope-{type}-{date}.md - Created (if applicable)

Original vs. Actual:
- Original requirements: {count}
- Actual deliverables: {count}
- Ad-hoc tasks added: {count}

Impact:
- Time: {assessment}
- Complexity: {assessment}
- Value: {assessment}

Next Steps:
- Continue implementation: /speckit.implement
- Validate feature: /speckit.ext.validate
- Close out feature: /speckit.ext.closeout
```

## Usage Examples

```
# Document scope change for current feature (auto-detect)
/speckit.ext.scope-change

# Document scope change for specific feature
/speckit.ext.scope-change specs/004-validate/
```

## Notes

- **When to Use**: During implementation when you realize you're building more/less/different than planned
- **Best Practice**: Document scope changes as they happen, not after the fact
- **Scope Expansion**: Not always bad - discovering more value is good!
- **Scope Creep**: Be honest about whether expansion is justified
- **Integration**: Run before closeout to ensure docs reflect reality