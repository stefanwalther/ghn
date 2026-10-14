---
name: speckit-ext-ft
description: Orchestrate specify, plan, and tasks workflow into a single command with readiness assessment
compatibility: Requires spec-kit project structure with .specify/ directory
metadata:
  author: github-spec-kit
  source: ext:commands/speckit.ext.ft.md
---

## User Input

```text
$ARGUMENTS
```

You **MUST** consider the user input before proceeding (if not empty).

## Outline

This extension orchestrates `/speckit.specify`, `/speckit.plan`, and `/speckit.tasks` into a single command. After all phases complete, it provides a readiness assessment recommending either `/speckit.implement` or `/speckit.analyze`.

### Step 0: Parse Arguments and Handle Flags

1. **Check for --help flag**:
   - If `$ARGUMENTS` contains `--help`:

   ```text
   Fast-Track Extension - Rapid Feature Setup

   Usage:
     /speckit.ext.fast-track "<feature-description>"
     /speckit.ext.ft "<feature-description>"

   Options:
     --from=specify   Start from specification phase (default)
     --from=plan      Skip specify, start from planning (requires spec.md)
     --from=tasks     Skip specify+plan, only generate tasks (requires plan.md)
     --help           Show this help message

   Examples:
     /speckit.ext.ft "Add user authentication with OAuth2"
     /speckit.ext.ft --from=plan
     /speckit.ext.ft --from=tasks

   What it does:
     1. Creates feature branch and spec.md (/speckit.specify)
     2. Generates plan.md with architecture (/speckit.plan)
     3. Generates tasks.md with actionable tasks (/speckit.tasks)
     4. Runs readiness assessment
     5. Recommends next step (/speckit.implement or /speckit.analyze)
   ```

   - Exit after showing help

2. **Check for --from flag**:
   - Extract `--from=VALUE` from arguments if present
   - Valid values: `specify`, `plan`, `tasks`
   - Default: `specify` (full workflow)
   - Store remaining arguments as the feature description

3. **Validate starting phase prerequisites**:

   a. If `--from=plan`:
      - Detect current feature from branch: `git rev-parse --abbrev-ref HEAD`
      - Find matching spec directory: `specs/{branch-number}-*`
      - Check `spec.md` exists in that directory
      - If missing: ERROR "Cannot start from plan - spec.md not found. Run without --from flag first."

   b. If `--from=tasks`:
      - Same branch/directory detection as above
      - Check both `spec.md` AND `plan.md` exist
      - If missing: ERROR "Cannot start from tasks - plan.md not found. Run with --from=plan first."

4. **Validate feature description** (only if starting from specify):
   - If no feature description provided and `--from` not specified:
     - ERROR "No feature description provided. Usage: /speckit.ext.ft \"<feature-description>\""

---

### Step 1: Execute Specify Phase (if not skipped)

**Display**: `=== Phase 1/5: Creating Specification ===`

**Skip if**: `--from=plan` or `--from=tasks`

Execute the `/speckit.specify` workflow:

1. **Generate short name** (2-4 words) from the feature description
2. **Fetch remote branches**: `git fetch --all --prune`
3. **Find next feature number**:
   - Check remote branches, local branches, and specs directories
   - Find highest existing number
   - Use N+1 for new feature

4. **Create feature branch and spec file**:
   ```bash
   .specify/scripts/bash/create-new-feature.sh --json --number N --short-name "short-name" "feature description"
   ```
   - Parse JSON output for BRANCH_NAME and SPEC_FILE

5. **Load spec template**: Read `.specify/templates/spec-template.md`

6. **Generate specification**:
   - Extract key concepts: actors, actions, data, constraints
   - Fill in all sections following template structure
   - Make informed guesses for unclear aspects (max 3 [NEEDS CLARIFICATION] markers)
   - Write spec.md

7. **Create requirements checklist**: Generate `FEATURE_DIR/checklists/requirements.md`

8. **Validate specification**:
   - Check all quality criteria
   - If [NEEDS CLARIFICATION] markers remain (max 3):
     - Present questions to user
     - Wait for responses
     - Update spec with answers
   - Re-validate until all items pass

**Checkpoint**: `Specify phase complete: spec.md created at {path}`

---

### Step 2: Execute Plan Phase (if not skipped)

**Display**: `=== Phase 2/5: Creating Implementation Plan ===`

**Skip if**: `--from=tasks`

Execute the `/speckit.plan` workflow:

1. **Setup**: Run `.specify/scripts/bash/setup-plan.sh --json`
   - Parse JSON for FEATURE_SPEC, IMPL_PLAN, SPECS_DIR, BRANCH

2. **Load context**:
   - Read FEATURE_SPEC (spec.md)
   - Read `.specify/memory/constitution.md`
   - Load IMPL_PLAN template

3. **Execute plan workflow**:
   - Fill Technical Context section
   - Complete Constitution Check section
   - Evaluate gates (mark unknowns as NEEDS CLARIFICATION)

4. **Phase 0 - Research** (if needed):
   - If NEEDS CLARIFICATION markers exist:
     - Research unknowns
     - Generate research.md with decisions
   - Skip if no unknowns

5. **Phase 1 - Design**:
   - Generate data-model.md (if entities involved)
   - Generate API contracts (if applicable)
   - Generate quickstart.md (if integration scenarios exist)
   - Run `.specify/scripts/bash/update-agent-context.sh claude`

**Checkpoint**: `Plan phase complete: plan.md created at {path}`

---

### Step 3: Execute Tasks Phase

**Display**: `=== Phase 3/5: Generating Tasks ===`

Execute the `/speckit.tasks` workflow:

1. **Setup**: Run `.specify/scripts/bash/check-prerequisites.sh --json`
   - Parse FEATURE_DIR and AVAILABLE_DOCS

2. **Load design documents**:
   - Required: plan.md, spec.md
   - Optional: data-model.md, contracts/, research.md, quickstart.md

3. **Generate tasks**:
   - Extract tech stack from plan.md
   - Extract user stories with priorities from spec.md
   - Map entities and endpoints to user stories
   - Generate tasks organized by user story:
     - Phase 1: Setup
     - Phase 2: Foundational
     - Phase 3+: User Stories (P1, P2, P3...)
     - Final: Polish & Quality

4. **Write tasks.md** using template structure

**Checkpoint**: `Tasks phase complete: tasks.md created at {path}`

---

### Step 4: Readiness Assessment

**Display**: `=== Phase 4/5: Running Readiness Assessment ===`

Evaluate artifact quality:

1. **Check for [NEEDS CLARIFICATION] markers**:
   ```bash
   grep -r "\[NEEDS CLARIFICATION" FEATURE_DIR/*.md | wc -l
   ```
   - Count should be 0 for PASS

2. **Check requirements checklist**:
   - Read `FEATURE_DIR/checklists/requirements.md`
   - Count incomplete items: `- [ ]`
   - All items should be checked for PASS

3. **Check tasks.md format**:
   - All tasks follow `- [ ] [ID] [P?] [Story?] Description` format
   - Dependencies section exists
   - Implementation strategy section exists

4. **Generate assessment report**:

   ```text
   === Readiness Assessment ===

   | Check | Status | Details |
   |-------|--------|---------|
   | NEEDS CLARIFICATION markers | {PASS/FAIL} | {count} remaining |
   | Requirements checklist | {PASS/FAIL} | {complete}/{total} items |
   | Tasks format | {PASS/FAIL} | {task_count} tasks |
   | Dependencies documented | {PASS/FAIL} | - |

   Overall: {READY/NEEDS REFINEMENT}
   ```

---

### Step 5: Recommendation

**Display**: `=== Phase 5/5: Recommendation ===`

Based on assessment results:

**If all checks PASS** (READY):

```text
All artifacts are complete and validated.

Recommended next step: /speckit.implement

This will execute the implementation plan by processing tasks in order.
Alternative: Run /speckit.analyze first for a deeper consistency check.
```

**If any check FAILS** (NEEDS REFINEMENT):

```text
Some artifacts need attention before implementation.

Issues found:
- {list each failing check with details}

Recommended next step: /speckit.analyze

This will identify specific inconsistencies and suggest fixes.
After fixing, you can run /speckit.ext.ft --from={appropriate phase} to continue.
```

---

### Final Summary

Display completion summary:

```text
=== Fast-Track Complete ===

Feature: {feature-name}
Branch: {branch-name}

Artifacts created:
- spec.md: {path}
- plan.md: {path}
- tasks.md: {path}

Assessment: {READY/NEEDS REFINEMENT}
Next step: {/speckit.implement or /speckit.analyze}

Full workflow after /speckit.implement:
  Routine features:   /speckit.ext.finalize → /speckit.ext.pr
  Complex features:   /speckit.ext.closeout → /speckit.ext.finalize → /speckit.ext.pr
  After PR merges:    /speckit.ext.post-merge
```

---

## Error Handling

- **Empty feature description**: Display usage and exit
- **Missing prerequisites for --from**: Display specific error and suggest fix
- **Script failures**: Report which phase failed and how to retry
- **Clarification pauses**: Stop at phase, present questions, resume after answers
- **Validation failures**: Report issues, suggest fixes, allow manual retry

## Notes

- **Duration**: Varies based on feature complexity and clarification needs
- **Goal**: Single command from idea to implementation-ready
- **Integration**: Uses spec-kit core scripts for consistency
- **Workflow Position**: First step in spec-kit workflow