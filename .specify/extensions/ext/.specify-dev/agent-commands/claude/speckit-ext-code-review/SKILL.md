---
name: speckit-ext-code-review
description: Multi-agent code review with security, architecture, and quality analysis
compatibility: Requires spec-kit project structure with .specify/ directory
metadata:
  author: github-spec-kit
  source: ext:commands/speckit.ext.code-review.md
---

## User Input

```text
$ARGUMENTS
```

You **MUST** consider the user input before proceeding (if not empty).

## Outline

This extension performs intelligent code review using specialized sub-agents running in parallel. Unlike the `validate` extension which runs automated checks (tests, linting), this extension analyzes code like a senior engineer would - looking for architecture issues, security vulnerabilities, and code smells.

**Core Principle**: Multi-agent review with parallel execution and synthesized findings.

### Execution Steps

1. **Parse Arguments**

Parse `$ARGUMENTS` to extract:
- Target spec directory (optional, auto-detect from branch if not provided)
- Flags:
  - `--quick`, `-q`: Fast mode (quality review only, skip security/architecture)
  - `--deep`, `-d`: Deep mode (include performance review)
  - `--fix`: Attempt auto-fix for simple issues (naming, formatting)
  - `--json`: Output as JSON (for CI integration)
  - `--help`, `-h`: Display usage and exit

**If `--help` specified**, display usage and exit:
```
Usage: /speckit.ext.code-review [spec-directory] [options]

Options:
  --quick, -q       Fast mode (quality only, skip security/arch)
  --deep, -d        Deep mode (include performance review)
  --fix             Attempt auto-fix for simple issues
  --json            Output as JSON (for CI integration)
  --help, -h        Show this help

Examples:
  /speckit.ext.code-review                    # Full review (auto-detect)
  /speckit.ext.code-review specs/012-feature  # Review specific feature
  /speckit.ext.code-review --quick            # Fast quality-only review
  /speckit.ext.code-review --deep             # Include performance analysis
```

**Auto-detection**:
```bash
# Get current branch name
git rev-parse --abbrev-ref HEAD

# Extract feature number (e.g., "012" from "012-session-handover")
# Find matching spec directory in specs/
```

Set flags:
- `QUICK_MODE`: true if --quick specified
- `DEEP_MODE`: true if --deep specified
- `FIX_MODE`: true if --fix specified
- `JSON_OUTPUT`: true if --json specified

2. **Environment Check**

Verify execution environment:

a. **Branch Check**:
   - Use Bash: `git rev-parse --abbrev-ref HEAD`
   - Warn if on main/master branch (review still runs but may be less useful)

b. **Git Status Check**:
   - Use Bash: `git status --porcelain`
   - If uncommitted changes: Note count (review will include staged changes)

c. **Find Spec Directory**:
   - If provided in arguments: Use that
   - Otherwise: Auto-detect from branch name
   - If not found: Continue (non-spec feature is OK)

**Output**:
```
=== Code Review ===

Branch: 012-session-handover
Feature: #012 (if detected)
Uncommitted changes: 3 files
Mode: Full review (or Quick/Deep)

Gathering changed files...
```

3. **Gather Changed Files**

Analyze the diff to understand what needs review:

a. **Get Changed Files**:
   ```bash
   git diff main...HEAD --name-only
   ```

b. **Categorize Files by Type**:
   - Use Glob to identify file types
   - Group into categories:
     - `security_relevant`: Files in auth/, api/, containing passwords, tokens, keys
     - `architecture_relevant`: Files with classes, interfaces, services
     - `quality_relevant`: All source code files (excluding tests, configs)
     - `performance_relevant`: Database queries, API endpoints, loops

c. **Calculate Review Scope**:
   ```
   Files to review: 15
   - Security-relevant: 3 files
   - Architecture-relevant: 8 files  
   - Quality-relevant: 15 files
   - Performance-relevant: 4 files (if --deep)
   ```

4. **Launch Parallel Review Agents**

Based on the mode and file categorization, launch specialist agents in parallel using the Task tool.

**CRITICAL**: Launch these as PARALLEL Task calls in a single tool call block.

**Standard Mode** (default): Launch 3 agents in parallel:

**Agent 1 - Security Reviewer** (skip if --quick):
```
Use Task tool with:
- subagent_type: "qa"
- description: "Security code review"
- readonly: true
- prompt: |
    You are a senior security engineer performing code review.
    
    ## Your Focus Areas (Priority Order)
    
    CRITICAL:
    - Hardcoded secrets, API keys, credentials, tokens
    - SQL injection vulnerabilities
    - XSS (Cross-Site Scripting) vulnerabilities
    - Command injection risks
    - Input validation and sanitization gaps
    - Authentication/authorization logic flaws
    
    IMPORTANT:
    - Unsafe deserialization
    - Path traversal vulnerabilities
    - CSRF protection gaps
    - Improper error handling (information leakage)
    - Insecure direct object references
    
    ## Files to Review
    {list of security_relevant files}
    
    ## Instructions
    1. Read each file using the Read tool
    2. Analyze for security vulnerabilities
    3. For each finding, provide:
       - Severity: CRITICAL, WARNING, or SUGGESTION
       - File and line number
       - Problem description
       - Suggested fix with code example
       - Rationale
    
    ## Output Format
    Return findings as a structured list:
    
    ### Finding 1
    - **Severity**: CRITICAL
    - **File**: src/api/auth.ts:42
    - **Problem**: Hardcoded API key in source code
    - **Fix**: Move to environment variable
    - **Code**:
      ```typescript
      // Bad
      const API_KEY = "sk_live_abc123";
      // Good  
      const API_KEY = process.env.API_KEY;
      ```
    
    If no security issues found, explicitly state: "No security issues found."
```

**Agent 2 - Architecture Reviewer** (skip if --quick):
```
Use Task tool with:
- subagent_type: "architect"
- description: "Architecture code review"
- readonly: true
- prompt: |
    You are a senior software architect performing code review.
    
    ## Your Focus Areas
    
    DESIGN PRINCIPLES:
    - SOLID principle violations (especially SRP and DIP)
    - High coupling between modules
    - Low cohesion within modules
    - Missing or inappropriate abstractions
    - Over-engineering (unnecessary complexity)
    
    STRUCTURAL ISSUES:
    - Circular dependencies
    - God classes or god functions
    - Inappropriate layering violations
    - API contract inconsistencies
    - Schema misalignment
    
    PATTERNS:
    - Anti-patterns (singletons where inappropriate, etc.)
    - Missing patterns where beneficial
    - Inconsistent patterns across codebase
    
    ## Files to Review
    {list of architecture_relevant files}
    
    ## Instructions
    1. Read each file using the Read tool
    2. Analyze for architectural issues
    3. For each finding, provide:
       - Severity: CRITICAL, WARNING, or SUGGESTION
       - Files affected
       - Problem description
       - Suggested refactoring approach
       - Impact assessment
    
    ## Output Format
    Return findings as a structured list:
    
    ### Finding 1
    - **Severity**: WARNING
    - **Files**: services/auth.ts, services/user.ts
    - **Problem**: Circular dependency detected
    - **Fix**: Extract shared interface to common module
    - **Impact**: Improves testability and maintainability
    
    If no architectural issues found, explicitly state: "No architectural issues found."
```

**Agent 3 - Code Quality Reviewer** (always runs):
```
Use Task tool with:
- subagent_type: "qa"
- description: "Code quality review"
- readonly: true
- prompt: |
    You are a senior developer performing code quality review.
    
    ## Your Focus Areas
    
    NAMING & CLARITY:
    - Poor or unclear variable/function names
    - Misleading names
    - Inconsistent naming conventions
    
    COMPLEXITY:
    - High cyclomatic complexity (deeply nested conditionals)
    - Long functions (>50 lines)
    - Long parameter lists (>4 parameters)
    - Complex boolean expressions
    
    CODE SMELLS:
    - Code duplication (DRY violations)
    - Dead code, unused variables
    - Magic numbers, hardcoded strings
    - Feature envy, data clumps
    
    ERROR HANDLING:
    - Missing error handling
    - Empty catch blocks
    - Overly broad exception handling
    - Silent failures
    
    ## Files to Review
    {list of quality_relevant files}
    
    ## Instructions
    1. Read each file using the Read tool
    2. Analyze for code quality issues
    3. For each finding, provide:
       - Severity: CRITICAL, WARNING, or SUGGESTION
       - File and line number
       - Problem description
       - Suggested improvement with code example
    
    ## Output Format
    Return findings as a structured list:
    
    ### Finding 1
    - **Severity**: SUGGESTION
    - **File**: src/utils/helper.ts:8
    - **Problem**: Poor variable naming
    - **Current**: `const x = getData()`
    - **Suggested**: `const userData = fetchUserProfile()`
    
    If no quality issues found, explicitly state: "No code quality issues found."
```

**Agent 4 - Performance Reviewer** (only if --deep):
```
Use Task tool with:
- subagent_type: "qa"
- description: "Performance code review"
- readonly: true
- prompt: |
    You are a performance engineer performing code review.
    
    ## Your Focus Areas
    
    DATABASE:
    - N+1 query patterns
    - Missing indexes (based on query patterns)
    - Unbounded queries (missing LIMIT)
    - Inefficient joins
    
    ALGORITHMS:
    - O(n^2) or worse algorithms where O(n) possible
    - Unnecessary iterations
    - Inefficient data structure choices
    
    RESOURCES:
    - Memory leaks
    - Unclosed resources (files, connections)
    - Missing connection pooling
    - Large objects held in memory
    
    ASYNC:
    - Synchronous calls that could be async
    - Missing parallelization opportunities
    - Blocking operations in hot paths
    
    CACHING:
    - Missing caching for expensive operations
    - Cache invalidation issues
    - Over-caching (stale data risks)
    
    ## Files to Review
    {list of performance_relevant files}
    
    ## Instructions
    1. Read each file using the Read tool
    2. Analyze for performance issues
    3. For each finding, provide:
       - Severity: CRITICAL, WARNING, or SUGGESTION
       - File and line number
       - Problem description
       - Performance impact estimate
       - Suggested optimization
    
    ## Output Format
    Return findings as a structured list:
    
    ### Finding 1
    - **Severity**: WARNING
    - **File**: src/api/users.ts:55
    - **Problem**: N+1 query pattern detected
    - **Impact**: O(n) database calls instead of O(1)
    - **Fix**: Use eager loading or batch query
    
    If no performance issues found, explicitly state: "No performance issues found."
```

**Wait for all agents to complete** before proceeding.

5. **Synthesize Results**

After all agents complete, aggregate their findings:

a. **Collect All Findings**:
   - Gather results from each agent
   - Parse into structured format

b. **Deduplicate**:
   - If multiple agents flagged the same issue, merge them
   - Keep the most detailed description
   - Note which reviewers agreed

c. **Rank by Severity**:
   - CRITICAL: Must fix before PR (security vulns, major bugs)
   - WARNING: Strongly recommended to fix (code smells, minor issues)
   - SUGGESTION: Optional improvements (naming, style)

d. **Calculate Summary**:
   ```
   Total findings: 8
   - Critical: 2
   - Warnings: 3
   - Suggestions: 3
   ```

6. **Generate REVIEW.md**

Write the review report to the spec directory (or current directory if no spec):

```markdown
# Code Review Report

Feature: #012 Session Handover
Branch: 012-session-handover
Date: {current date}
Reviewers: security, architecture, quality{, performance if --deep}

---

## Summary

Status: {READY | NEEDS ATTENTION | CRITICAL ISSUES}

| Severity | Count |
|----------|-------|
| Critical | 2 |
| Warning | 3 |
| Suggestion | 3 |

---

## Critical Issues

{For each critical finding, format as:}

### [CATEGORY] Brief description
**File**: `path/to/file.ts:42`
**Reviewer**: security
**Problem**: Detailed explanation
**Fix**: How to resolve
```code
// Example fix
```

---

## Warnings

{Similar format for warnings}

---

## Suggestions

{Similar format for suggestions}

---

## Next Steps

1. {If critical issues}: Address critical issues before creating PR
2. {If warnings}: Consider fixing warnings (recommended)
3. {If only suggestions}: Ready for PR - suggestions are optional

Run `/speckit.ext.code-review` again after making fixes.
```

7. **Handle --fix Mode** (if specified)

For simple auto-fixable issues:

a. **Identify Fixable Issues**:
   - Naming improvements (with user confirmation)
   - Unused imports removal
   - Simple formatting fixes

b. **Apply Fixes**:
   - Use StrReplace tool for each fix
   - Track what was fixed

c. **Report**:
   ```
   Auto-fixed 3 issues:
   - Removed 2 unused imports
   - Fixed 1 naming issue
   
   Remaining issues require manual attention.
   ```

8. **Present Summary**

Display final summary to user:

```
=== Code Review Complete ===

Feature: #012 Session Handover
Duration: {time}

Results:
{If CRITICAL issues}:
  Status: CRITICAL ISSUES FOUND
  
  2 critical issues must be fixed before PR:
  - [SECURITY] Hardcoded API key (src/api/client.ts:42)
  - [ARCHITECTURE] Circular dependency (services/)
  
  3 warnings should be reviewed
  3 suggestions for improvement
  
  Review report: specs/012-session-handover/REVIEW.md
  
  Next: Fix critical issues, then run /speckit.ext.code-review again

{If only WARNINGS}:
  Status: NEEDS ATTENTION
  
  0 critical issues
  3 warnings should be reviewed
  3 suggestions for improvement
  
  Review report: specs/012-session-handover/REVIEW.md
  
  Next: /speckit.ext.pr (or fix warnings first)

{If CLEAN}:
  Status: READY FOR PR
  
  No critical issues
  No warnings
  3 optional suggestions
  
  Review report: specs/012-session-handover/REVIEW.md
  
  Next: /speckit.ext.pr
```

**If --json flag**: Output structured JSON instead of formatted text.

## Usage Examples

```bash
# Full code review (auto-detect feature)
/speckit.ext.code-review

# Review specific feature
/speckit.ext.code-review specs/012-session-handover

# Quick review (quality only - faster)
/speckit.ext.code-review --quick

# Deep review (include performance analysis)
/speckit.ext.code-review --deep

# Auto-fix simple issues
/speckit.ext.code-review --fix

# CI integration (JSON output)
/speckit.ext.code-review --json

# Combined flags
/speckit.ext.code-review --deep --fix
```

## Agent Responsibilities

| Agent | Type | Focus | Speed |
|-------|------|-------|-------|
| Security | qa | Vulnerabilities, auth, secrets | Medium |
| Architecture | architect | Design, coupling, patterns | Medium |
| Code Quality | qa | Naming, complexity, smells | Fast |
| Performance | qa | N+1, memory, caching | Slow (--deep only) |

## Differentiation from /speckit.ext.validate

| Aspect | validate | code-review |
|--------|----------|-------------|
| **Type** | Automated checks | Intelligent analysis |
| **Speed** | Fast (30s-5min) | Slower (2-5min) |
| **Output** | Pass/fail verdict | Detailed findings |
| **Focus** | Tests pass, linting clean | Design quality, security |
| **Examples** | "All tests passing" | "This violates SRP" |

**Recommended flow**: Run `validate` first (fast, automated), then `code-review` (thorough, intelligent).

## Notes

- **Multi-agent**: Uses Task tool to run specialists in parallel
- **Routing**: Only invokes agents relevant to changed file types
- **Deduplication**: Merges overlapping findings from different reviewers
- **REVIEW.md**: Persisted report for reference and PR documentation
- **Non-blocking**: Warnings and suggestions don't block PR creation
- **Re-runnable**: Run multiple times as issues are fixed