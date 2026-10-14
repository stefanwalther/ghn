---
description: Pre-merge validation and quality gate for feature completion
arguments: "[spec-directory] [--quick] [--fix]"
handoffs:
  - label: Fix Issues
    agent: speckit.implement
    prompt: Fix the validation issues identified
  - label: Finalize
    agent: speckit.ext.finalize
    prompt: Cleanup transient files and update workspace docs
  - label: Closeout
    agent: speckit.ext.closeout
    prompt: Full context preservation with COMPLETION.md and HANDOVER.md
  - label: Create PR
    agent: speckit.ext.pr
    prompt: Create pull request for the feature
---

## User Input

```text
$ARGUMENTS
```

You **MUST** consider the user input before proceeding (if not empty).

## Outline

This extension runs comprehensive validation checks before merging a feature. It provides a clear pass/fail verdict with specific recommendations.

**Core Principle**: Automated quality gate with actionable feedback.

### Execution Steps

1. **Parse Arguments**

Parse `$ARGUMENTS` to extract:
- Target spec directory (optional, auto-detect from branch if not provided)
- Flags: `--quick` (fast mode), `--fix` (auto-fix issues)
- If `--help`: Display usage and exit

**Auto-detection**:
```bash
# Get current branch name
git rev-parse --abbrev-ref HEAD

# Extract feature number (e.g., "004" from "004-validate")
# Find matching spec directory
```

2. **Environment Check**

Verify execution environment:

a. **Branch Check**:
   - Use Bash: `git rev-parse --abbrev-ref HEAD`
   - Warn if on main/master branch
   - Continue (validation can still run)

b. **Git Status Check**:
   - Use Bash: `git status --porcelain`
   - If uncommitted changes: Display warning with file count
   - Note: "Validation runs on committed code"

**Output**:
```
Environment:
✓ Branch: 004-validate
✓ Git status: Clean (or X uncommitted files)
```

3. **Task Completion Check**

Verify all tasks are marked complete:

a. **Find tasks.md**:
   - Read `<spec-directory>/tasks.md` using Read tool
   - If not found: Report error and continue

b. **Count Tasks**:
   - Total tasks: Count lines matching `^- \[.\]`
   - Incomplete: Count lines matching `^- \[ \]`
   - Complete: Total - Incomplete

**Validation**:
- ✅ **PASS**: All tasks complete (0 incomplete)
- ⚠️ **WARNING**: Incomplete tasks found (list them)
- ❌ **FAIL**: tasks.md doesn't exist

**Output**:
```
Task Completion:
✅ All 35/35 tasks complete

Or:

⚠️ Incomplete tasks found (3):
  - [ ] T015: Update Navigation section
  - [ ] T033: Update metrics in docs
  - [ ] T035: Final review
```

4. **Test Suite Validation** (Skip if --quick)

Run tests and verify passing:

a. **Auto-detect Project Type**:
   - Check for `package.json` → Node.js project
   - Check for `pyproject.toml` or `setup.py` → Python project
   - Check for `Cargo.toml` → Rust project
   - Check for `go.mod` → Go project

b. **Run Tests**:
   - Python: Try `pytest`, `uv run pytest`, or `python -m pytest`
   - Node.js: Try `npm test` or `yarn test`
   - Other: Prompt user for test command

**Validation**:
- ✅ **PASS**: All tests passing
- ⚠️ **WARNING**: Some tests skipped
- ❌ **FAIL**: Tests failing

**Output**:
```
Test Suite:
✅ All tests passing
Duration: 12.3 seconds

Or:

❌ Test Suite FAILED (2 failures)
  - test_api.py::test_rate_limiting
  - test_loader.py::test_deduplication
```

5. **Code Quality Checks** (Skip if --quick)

Run linters and type checkers:

a. **Auto-detect Tools**:
   - Python: Check for ruff, mypy, flake8, black in pyproject.toml
   - Node.js: Check for eslint, prettier in package.json
   - Run detected tools

b. **Execute Checks**:
   - Type checking (if available)
   - Linting
   - Formatting check

**If --fix flag**: Run auto-fix commands after detection

**Validation**:
- ✅ **PASS**: No quality issues
- ⚠️ **WARNING**: Minor issues (auto-fixable)
- ❌ **FAIL**: Serious issues found

**Output**:
```
Code Quality:
✅ Type checking: No errors
✅ Linting: No errors
✅ Formatting: Consistent

Or:

⚠️ Code Quality WARNINGS
  Linting: 3 issues (auto-fixable with --fix)
```

6. **Documentation Check**

Verify documentation is updated:

a. **Feature Docs Exist**:
   - Check for spec.md, plan.md, tasks.md in spec directory
   - Report missing files

b. **Workspace Docs Updated** (optional):
   - Use Bash: `git diff main...HEAD --name-only | grep -E "(README|roadmap|CHANGELOG)"`
   - Note if no workspace docs updated (acceptable for internal changes)

**Validation**:
- ✅ **PASS**: All required docs exist
- ⚠️ **WARNING**: No workspace docs updated
- ❌ **FAIL**: Missing required spec files

**Output**:
```
Documentation:
✅ Feature docs complete (spec, plan, tasks)
⚠️ No workspace docs updated (acceptable for refactoring)
```

7. **Code Standards Check**

Check for debug code and violations:

a. **Debug Code Detection**:
   - Use Grep to search new code for: `console.log`, `print(`, `debugger`, `import pdb`
   - Scope: `git diff main...HEAD`

b. **TODO/FIXME Detection**:
   - Use Grep to search new code for: `TODO`, `FIXME`, `HACK`, `XXX`
   - List locations if found

**Validation**:
- ✅ **PASS**: No debug code or TODOs
- ⚠️ **WARNING**: TODOs found (document or remove)
- ❌ **FAIL**: Debug code in production files

**Output**:
```
Code Standards:
✅ No debug code
✅ No TODOs/FIXMEs in new code

Or:

⚠️ Code Standards WARNINGS
  TODOs found in new code:
    src/api.py:42 - TODO: Implement caching
```

8. **Generate Final Report**

Present comprehensive validation report:

**Report Structure**:
```
=== Feature Validation Report ===

Feature: #004 Validate Extension
Branch: 004-validate
Date: {current date}

---

## Summary

Status: ✅ READY TO MERGE (or ❌ NOT READY)

X/Y checks passed
N errors, M warnings

---

## Detailed Results

### ✅ Environment
- Branch: 004-validate
- Git status: Clean

### ✅ Tasks
- All X/X tasks complete

### ✅ Tests (or skipped with --quick)
- All passing

### ✅ Code Quality (or skipped with --quick)
- No issues

### ✅ Documentation
- Feature docs complete

### ✅ Code Standards
- Clean code

---

## Recommendations

{List specific actions if issues found}

---

## Next Steps

Ready (routine feature):  /speckit.ext.finalize → /speckit.ext.pr
Ready (complex feature):  /speckit.ext.closeout → /speckit.ext.pr
Ready (already finalized): /speckit.ext.pr
Issues: Fix blocking problems first
```

**Verdict Logic**:
- ❌ NOT READY: Any tests failing, missing required docs, debug code found
- ⚠️ READY WITH WARNINGS: TODOs found, no workspace docs updated
- ✅ READY TO MERGE: All checks pass

## Usage Examples

```
# Full validation (auto-detect spec directory)
/speckit.ext.validate

# Validate specific spec directory
/speckit.ext.validate specs/004-validate/

# Quick validation (skip tests and linting)
/speckit.ext.validate --quick

# Auto-fix issues and re-validate
/speckit.ext.validate --fix
```

## Notes

- **Goal**: Automated quality gate in < 5 minutes
- **Quick mode**: ~30 seconds (tasks + code standards only)
- **Fix mode**: Runs auto-fix tools, then re-validates
- **Integration**: Called by `/speckit.ext.closeout` in Step 5
- **Standalone**: Can run independently at any time during implementation
