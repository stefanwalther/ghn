---
title: "Spec-kit Pull Request Command"
description: "Create a pull request for spec-kit features with agent-based workflow and spec-kit context awareness"
version: "3.11.0"
upstream: "ai-skills/c/commands/c:pr.md"
upstream_version: "3.11.0"
category: "git"
arguments: "--draft --no-monitor --no-auto-fix --max-fix-attempts --fast-track --wizard --help"
dependencies:
  - "@.claude/shared/pull-request-guidelines.md"
  - "@.claude/shared/git-commit-guidelines.md"
handoffs:
  - label: Evaluate Conflicts
    agent: pr:conflict-evaluator
    prompt: Evaluate mergeability against base branch and provide remediation strategies
  - label: Monitor CI/CD
    agent: pr:monitor
    prompt: Monitor CI/CD checks for the created PR
  - label: Start Next Feature
    agent: speckit.specify
    prompt: Create specification for next feature
tags:
  - git
  - pull-request
  - code-review
  - spec-kit
---

## User Input

```text
$ARGUMENTS
```

You **MUST** consider the user input before proceeding (if not empty).

---

# Spec-kit Pull Request Command

Create a well-structured pull request using specialized agents, with **spec-kit context awareness** (spec.md, COMPLETION.md, feature numbers). Same workflow as c:pr plus spec-kit integration.

**v3.11.0 Changes:**
- ✅ GitHub API rate-limit handling: when `gh` hits a REST or GraphQL rate limit (including `GraphQL: API rate limit already exceeded for user ID ...`), stop and report the reset time as both an absolute local-time timestamp (dynamic system timezone) and a relative duration from now

**v3.10.0 Changes:**
- ✅ Test plan split into `### Pre-Merge` (blocks the merge) and `### Post-Merge` (follow-up checks after deploy) subsections — prevents the awkwardness of unchecked boxes that can't be verified before merging
- ✅ `pr:describer` now tailors post-merge items per change (smoke tests, metrics, stakeholder validation) instead of using identical boilerplate, and writes "N/A" when no post-merge checks apply

**v3.9.0 Changes:**
- ✅ CI Auto-Fix Loop: when CI checks fail, the workflow now automatically investigates failure logs, fixes the code, commits, pushes, and re-monitors — repeating up to 3 times (configurable via `--max-fix-attempts N`)
- ✅ New flag `--no-auto-fix` / `-F` to disable the fix loop and restore previous "report and stop" behavior

**v3.8.1 Changes:**
- 🐛 Fix: pr:monitor now tracks workflow run status (`gh run list --commit $HEAD_SHA`) alongside individual checks to prevent premature exit when CI has sequential/dependent jobs (`needs:` in GitHub Actions)

**v3.8.0 Changes:**
- ✅ Added dedicated `pr:conflict-evaluator` sub-agent for immediate post-creation mergeability analysis against the PR base branch (typically `main`)
- ✅ `pr:monitor` is now focused on CI/CD monitoring, while conflict strategy is handled by `pr:conflict-evaluator`

**v3.5.2 Changes:**
- 🐛 Fix: pr:monitor rules 4, 5, and 6 now qualify `mergeStateStatus` by `mergeable` value, eliminating contradiction with the stated precedence principle (e.g., `MERGEABLE` + `DIRTY` no longer falsely reported as conflicts)

**v3.5.1 Changes:**
- 🐛 Fix: pr:monitor interpretation rules now have explicit precedence — `mergeable` is authoritative for conflict detection, resolving contradictory guidance when `mergeStateStatus` and `mergeable` conflict (e.g., `BEHIND` + `CONFLICTING`)
- 🐛 Fix: Added coverage for `BLOCKED` merge state (branch protection rules)
- 🐛 Fix: pr:monitor no longer lists `UNKNOWN` as a valid `mergeStateStatus` value (`UNKNOWN` only applies to `mergeable`)
- 🐛 Fix: Added missing `UNSTABLE` and `HAS_HOOKS` enum values to `mergeStateStatus` documentation
- 🐛 Fix: Interpretation rules now correctly attribute `UNKNOWN` state to the `mergeable` field only

**v3.5.0 Changes:**
- ✅ Merge conflict detection: pr:monitor now checks `mergeable` and `mergeStateStatus` via `gh pr view --json`
- ✅ Reports conflict status (clean, conflicts, behind base) alongside CI/CD results
- ✅ Handles GitHub's async mergeability computation by re-checking during polling

**v3.4.0 Changes:**
- ✅ Scope check: Fast-track mode detects unrelated uncommitted changes before auto-committing
- ✅ Prompts user with options (include, stash, separate PR, cancel) when changes don't match the branch

**v3.3.0 Changes:**
- ✅ Base Branch Policy: PRs always target `main` as the base branch
- ✅ Auto-creates remote `main` from root commit if it doesn't exist (new repos)
- ✅ All `gh pr create` commands now include `--base main` explicitly

**v3.2.0 Changes:**
- ✅ Fast-track mode: Auto-creates feature branch when on main (no prompt)
- ✅ Fast-track mode: Auto-commits with generated message (no prompt)
- ✅ Fast-track mode now truly prioritizes speed over interactive control

**v3.1.0 Changes:**
- ✅ Auto-fix: Offers to create feature branch when on main/master
- ✅ Auto-fix: Offers to commit uncommitted changes before PR creation
- ✅ Interactive prompts guide user through fixing pre-PR issues

**v3.0.0 Changes:**
- ✅ Main Claude instance now executes git push and gh pr create directly
- ✅ Agents only used for read-only analysis and preparation
- ✅ Fixes issue where PRs weren't actually created despite success messages
- ✅ Agents cannot reliably execute state-changing commands - now documented

**Usage:**
```bash
/speckit.ext.pr                  # Create ready-for-review PR and monitor CI/CD (default)
/speckit.ext.pr --draft          # Create draft PR and monitor CI/CD
/speckit.ext.pr --no-monitor     # Create ready PR without CI/CD waiting (still does conflict evaluation)
/speckit.ext.pr -d -M            # Short form: draft, no CI/CD waiting
/speckit.ext.pr --no-auto-fix    # Monitor CI but don't auto-fix failures
/speckit.ext.pr --max-fix-attempts 5  # Allow up to 5 fix attempts (default: 3)
/speckit.ext.pr --fast-track     # Quick PR: auto-generate title/description, skip agents
/speckit.ext.pr -f               # Short form: fast-track
/speckit.ext.pr -ft              # Short form: fast-track (alternative)
/speckit.ext.pr -f -d            # Fast-track + draft PR
/speckit.ext.pr -f -M            # Fast-track without monitoring
/speckit.ext.pr --wizard         # Interactive wizard mode
/speckit.ext.pr wiz              # Short form: wizard mode
/speckit.ext.pr --help           # Show all options
```

**Flags:**
- `--draft`, `-d`: Create as draft (default: ready-for-review)
- `--no-monitor`, `--no-watch`, `-M`, `-W`: Skip CI/CD waiting loop (default: monitor enabled). Conflict evaluation still runs.
- `--no-auto-fix`, `-F`: Disable CI auto-fix loop — just report failures (default: auto-fix enabled when monitoring)
- `--max-fix-attempts N`: Maximum fix loop iterations (default: 3)
- `--fast-track`, `-f`, `-ft`: Quick PR creation — auto-generate title/description from branch and commits, skip analysis agents
- `--wizard`, `wiz`: Interactive wizard mode to choose options
- `--help`, `-h`: Show this help message

---

## Architecture

This command uses specialized agents for analysis and the main Claude instance for execution:

1. **pr:context-analyzer** agent - Analyzes git changes and gathers context, including spec-kit files (read-only)
2. **pr:describer** agent - Writes PR title and description (read-only)
3. **Main Claude instance (YOU)** - Executes git push and gh pr create commands
4. **pr:conflict-evaluator** agent - Evaluates mergeability against base branch and provides remediation strategies (read-only)
5. **pr:monitor** agent (optional) - Monitors CI/CD checks and reports status (read-only)

**Key Design Principle:**
- Agents analyze and prepare (read-only operations) ✅
- Main Claude executes (state-changing operations) ✅
- This ensures commands actually run and PRs are actually created

**Spec-kit extras:** Pre-flight detects feature number from branch and `specs/{feature-number}-*/`; agents are prompted to use spec.md and COMPLETION.md when present.

---

## Instructions

**First, parse the flags:**

Check the user's input (and `$ARGUMENTS`) for these flags:

**Help Flag:**
- `--help`, `-h` → Display the usage information and flags from the top of this file, then EXIT

**Wizard Flag:**
- `--wizard`, `wiz` → Set `WIZARD_MODE=true`
- Otherwise → Set `WIZARD_MODE=false`

**Draft Flag:**
- `--draft`, `-d` → Set `DRAFT_ENABLED=true`
- Otherwise → Set `DRAFT_ENABLED=false` (default: create ready-for-review)

**Monitor Flag:**
- `--no-monitor`, `--no-watch`, `-M`, `-W` → Set `MONITOR_ENABLED=false`
- Otherwise → Set `MONITOR_ENABLED=true` (default: monitoring enabled)

**Auto-Fix Flag:**
- `--no-auto-fix`, `-F` → Set `AUTO_FIX_ENABLED=false`
- Otherwise → Set `AUTO_FIX_ENABLED=true` (default: auto-fix enabled)

**Max Fix Attempts:**
- `--max-fix-attempts N` → Set `MAX_FIX_ATTEMPTS=N`
- Otherwise → Set `MAX_FIX_ATTEMPTS=3` (default)

**Fast-Track Flag:**
- `--fast-track`, `-f`, `-ft` → Set `FAST_TRACK=true`
- Otherwise → Set `FAST_TRACK=false` (default: regular agent workflow for richer spec-kit PR descriptions)

**If `FAST_TRACK=true`, skip to the Fast-Track Mode section below (ignores wizard mode).**

**If `WIZARD_MODE=true`, follow the Wizard Mode section below before proceeding with the agent workflow.**

---

## Wizard Mode

**Only execute this section if `WIZARD_MODE=true`.**

Gather PR preferences one decision at a time. Follow the global Clarification & Decision Support protocol: ask only one question, include context, recommendation, option trade-offs, impact, rule of thumb, and wait for the answer before asking the next question.

**Question 1 - PR Status:**
- header: "PR Status"
- question: "Should the PR be created as a draft or ready for review?"
- options:
  - label: "Ready for review (Recommended)", description: "Create PR ready for team review"
  - label: "Draft", description: "Create as draft PR for work in progress"
- multiSelect: false

**Question 2 - Monitor CI/CD:**
- header: "Monitor"
- question: "Monitor CI/CD checks after PR creation?"
- options:
  - label: "Yes (Recommended)", description: "Wait and report CI/CD check results"
  - label: "No", description: "Create PR, run conflict evaluation, and exit without CI/CD waiting"
- multiSelect: false

**After getting answers:**
- If user selected "Draft" → Set `DRAFT_ENABLED=true`
- If user selected "Ready for review" → Set `DRAFT_ENABLED=false`
- If user selected "Yes" for monitoring → Set `MONITOR_ENABLED=true`
- If user selected "No" for monitoring → Set `MONITOR_ENABLED=false`

**Then proceed with the agent workflow below.**

---

## Fast-Track Mode

**Only execute this section if `FAST_TRACK=true`. This mode skips all analysis agents and auto-generates PR content.**

### Step 1: Verify State and Auto-Fix Issues

First, check the git status:

```bash
git status
git branch --show-current
```

**Optional spec-kit pre-flight:** Extract feature number from branch name; look for `specs/{feature-number}-*/` — if found, you may reference it in the generated description.

**Handle issues automatically (no prompts in fast-track mode):**

**Signing diagnostic note:**
- If `git commit` hangs or appears to wait for signing, do not assume classic GPG just because `commit.gpgsign=true` is set.
- First run `git config --show-origin --get-regexp '^(commit\.gpgsign|gpg\.format|user\.signingkey)$'`.
- If `gpg.format=ssh`, this repo is using SSH commit signing via Git's `gpg.*` keys.
- In that case, verify `echo "$SSH_AUTH_SOCK"`, `test -S "$SSH_AUTH_SOCK"`, and `ssh-add -l` before suggesting `--no-gpg-sign` or blaming worktrees.
- If `SSH_AUTH_SOCK` is invalid on macOS, recover it with `export SSH_AUTH_SOCK="$(launchctl print "gui/$(id -u)/com.openssh.ssh-agent" | awk -F' => ' '/SSH_AUTH_SOCK => / {print $2; exit}')"`.

If both issues exist (on main/master AND uncommitted changes), handle them in sequence:

**Issue 1: On main or master branch**

If the current branch is main or master, **automatically** create a feature branch:

1. Analyze the staged/unstaged changes to determine an appropriate branch name
2. Generate a branch name following the pattern `type/short-description` (or spec-kit style e.g. `123-short-description` if applicable):
   - `feat/` for new features
   - `fix/` for bug fixes
   - `chore/` for maintenance tasks
   - `docs/` for documentation changes
3. Create the branch immediately without asking:

```bash
git checkout -b <auto-generated-branch-name>
```

**Issue 2: Uncommitted changes**

If there are uncommitted changes (staged or unstaged), perform a **scope check** before committing.

#### Scope Check (Unrelated Changes Detection)

When the branch already has commits ahead of `main`, compare the uncommitted changes against the branch's existing work to detect unrelated changes:

```bash
# Files already changed on this branch
BRANCH_FILES=$(git diff --name-only main...HEAD)

# Files with uncommitted changes
UNCOMMITTED_FILES=$(git diff --name-only HEAD; git diff --name-only --cached; git ls-files --others --exclude-standard)
```

**If the branch has existing commits AND there is no file overlap between `BRANCH_FILES` and `UNCOMMITTED_FILES`**, the uncommitted changes are likely **unrelated** to the branch's purpose. In this case, **do NOT auto-commit**. Instead, prompt the user using AskUserQuestion:

```
⚠️  Uncommitted changes appear unrelated to this branch.

Branch: feat/some-feature
Branch touches: .claude/commands/speckit.ext.pr.md
Uncommitted changes: extensions/speckit.ext/extension.yml

Options:
  A) Include anyway — commit these changes into this PR
  B) Stash and proceed — stash the changes, create PR with only existing commits
  C) Separate PR — stash changes, create this PR, then help create a second PR for the stashed changes
  D) Cancel — stop and let me handle it manually
```

**Handle the user's choice:**

- **A) Include anyway**: Auto-commit as normal (same as previous behavior)
- **B) Stash and proceed**: Run `git stash push -m "auto-stash: unrelated changes during PR creation"` and continue with only the existing commits
- **C) Separate PR**: Stash the changes, create the current PR, then after completion offer to create a new branch and PR for the stashed changes
- **D) Cancel**: Stop the workflow and inform the user

**If the branch has NO existing commits** (new branch with only uncommitted changes), or **if files DO overlap**, skip the scope check and auto-commit as normal:

```bash
# Stage all changes
git add -A

# Auto-generate commit message following conventional commits format
# Analyze the changes to determine type and scope
git commit -m "type(scope): description"
```

**Note:** Fast-track mode prioritizes speed over control, but the scope check prevents accidentally mixing unrelated work into a PR. Users who want full control should use regular mode (`/speckit.ext.pr`) or wizard mode (`/speckit.ext.pr wiz`).

### Step 2: Ensure Remote Main Branch Exists

Before generating PR content, verify the remote `main` branch exists (see **Base Branch Policy** below):

```bash
if ! git ls-remote --exit-code --heads origin main >/dev/null 2>&1; then
  echo "Remote 'main' branch does not exist. Creating it..."
  ROOT_COMMIT=$(git rev-list --max-parents=0 HEAD | head -1)
  git push origin "${ROOT_COMMIT}:refs/heads/main"
fi
```

### Step 3: Auto-Generate PR Content

**Get branch name and commits:**

```bash
BRANCH=$(git branch --show-current)
BASE_BRANCH="main"
```

**Generate title from branch name:**

Parse the branch name to extract type and scope:
- `fix/selection-menu` → `fix(selection-menu): <first commit subject>`
- `feat/new-feature` → `feat(new-feature): <first commit subject>`
- `chore/update-deps` → `chore(update-deps): <first commit subject>`

```bash
# Get first commit subject for the title
FIRST_COMMIT=$(git log $BASE_BRANCH..HEAD --reverse --format='%s' | head -1)

# Extract type from branch prefix (before /)
# Extract scope from branch name (after /)
# Combine: type(scope): first commit subject
```

**If branch doesn't follow `type/scope` pattern:**
- Use the first commit subject as the PR title

**Generate description from commits:**

```bash
# Get all commit messages as bullet points
git log $BASE_BRANCH..HEAD --format='- %s' --reverse
```

**Format the PR description:**

```markdown
## Summary
<First commit subject or brief description based on branch name>

## Changes
<List of commit messages as bullets>
```

### Step 4: Push and Create PR

**Push the branch:**

```bash
git push -u origin "$BRANCH"
```

**Create the PR:**

Use the auto-generated title and description. **Always include `--base main`** (see Base Branch Policy).

**If `DRAFT_ENABLED=true`:**

```bash
gh pr create \
  --base main \
  --draft \
  --title "AUTO_GENERATED_TITLE" \
  --body "$(cat <<'EOF'
AUTO_GENERATED_DESCRIPTION
EOF
)"
```

**If `DRAFT_ENABLED=false` (default):**

```bash
gh pr create \
  --base main \
  --title "AUTO_GENERATED_TITLE" \
  --body "$(cat <<'EOF'
AUTO_GENERATED_DESCRIPTION
EOF
)"
```

If `gh pr create` fails with a GitHub API rate limit (including `GraphQL: API rate limit already exceeded for user ID ...`), follow **GitHub API Rate Limit Handling** and STOP.

**Verify PR creation:**

```bash
gh pr view --json url --jq .url
```

If verification fails with a GitHub API rate limit, follow **GitHub API Rate Limit Handling** and STOP.

### Step 5: Evaluate Conflicts (Always) + Monitor & Fix CI/CD (Default)

Immediately after PR creation, always use the **pr:conflict-evaluator** agent with the PR number.

```
Use the pr:conflict-evaluator agent with the PR number. Evaluate mergeability vs the base branch and provide remediation strategies. Prefer rebase-from-base guidance by default when appropriate.
```

The pr:conflict-evaluator agent checks mergeability via:

```bash
gh pr view <PR_NUMBER> --json mergeable,mergeStateStatus,baseRefName,headRefName --jq '{mergeable: .mergeable, mergeStateStatus: .mergeStateStatus, base: .baseRefName, head: .headRefName}'
```

**Precedence rule:** `mergeable` is the authoritative field for conflict detection. Always evaluate `mergeable` first, then use `mergeStateStatus` for additional context. When the two fields appear to conflict (e.g., `mergeStateStatus = BEHIND` but `mergeable = CONFLICTING`), `mergeable` wins.

**Interpretation rules (priority order):**

1. **`mergeable` = `CONFLICTING`** (regardless of `mergeStateStatus`): The PR has merge conflicts that must be resolved before merging.
2. **`mergeable` = `MERGEABLE`** and **`mergeStateStatus` = `CLEAN`**: No conflicts, branch is up to date.
3. **`mergeable` = `MERGEABLE`** and **`mergeStateStatus` = `BEHIND`**: The branch is behind the base branch but has no conflicts. A merge or rebase is recommended.
4. **`mergeable` = `MERGEABLE`** and **`mergeStateStatus` = `DIRTY`**: No git conflicts, but the merge is not clean — typically caused by failing required status checks. Do **not** report this as conflicts (since `mergeable` confirms no conflicts exist). Report as "merge blocked by failing checks or inconsistent branch state."
5. **`mergeable` = `MERGEABLE`** and **`mergeStateStatus` = `BLOCKED`**: No git conflicts, but merging is blocked by branch protection rules (e.g., required reviews or passing checks not yet met).
6. **`mergeable` = `MERGEABLE`** and **`mergeStateStatus` = `UNSTABLE`**: No git conflicts, but some required status checks have not passed.
7. **`mergeable` = `UNKNOWN`**: GitHub hasn't computed mergeability yet. This is normal for freshly created PRs. Re-check during evaluation.

**Note:** The `mergeStateStatus` enum values are: `CLEAN`, `DIRTY`, `BEHIND`, `BLOCKED`, `UNSTABLE`, or `HAS_HOOKS`. The value `UNKNOWN` only applies to the `mergeable` field, never to `mergeStateStatus`.

If the conflict evaluator reports a GitHub API rate limit, return its reset-time report to the user and STOP before CI monitoring.

**If `MONITOR_ENABLED=true` (default):**
- After conflict evaluation, enter the **CI Monitor & Auto-Fix Loop** (see dedicated section below).
- This monitors checks, and if they fail and `AUTO_FIX_ENABLED=true`, automatically investigates, fixes, pushes, and re-monitors.

**If `MONITOR_ENABLED=false`:**
- Skip CI/CD waiting after conflict evaluation.

### Fast-Track Complete

Report to the user:
- PR URL
- PR status (draft or ready-for-review)
- Conflict status + remediation suggestions (always)
- CI/CD results + fix loop summary (if monitoring was enabled)
- **Next step:** After merge, use `/speckit.specify` for next feature

**Fast-track mode is now complete. Do not proceed to the agent workflow below.**

---

## Base Branch Policy

**The base branch for all PRs is always `main`.**

Before pushing any PR, the script must verify that a `main` branch exists on the remote. If it does not (e.g., a brand-new repository with no remote branches), it must be created automatically.

**Ensure remote `main` exists (used in both Fast-Track and Regular mode):**

```bash
# Check if remote main branch exists
if ! git ls-remote --exit-code --heads origin main >/dev/null 2>&1; then
  echo "Remote 'main' branch does not exist. Creating it..."
  # Push the root commit of the current branch as main
  ROOT_COMMIT=$(git rev-list --max-parents=0 HEAD | head -1)
  git push origin "${ROOT_COMMIT}:refs/heads/main"
fi
```

This pushes the root (initial) commit as the `main` branch, so the PR diff will correctly show all feature branch commits.

**All `gh pr create` commands must include `--base main`** to explicitly target the correct base branch.

---

## Regular Mode: Agent Workflow

You will orchestrate the PR creation process using specialized agents in sequence.

### Spec-kit Pre-flight (Optional)

Before or alongside analysis:

a. **Branch:** `git branch --show-current` — if on main/master, proceed to Step 3.1 to offer creating a feature branch.
b. **Feature number:** Extract from branch name if present (e.g. `123-feature-name` → feature #123).
c. **Spec directory:** Look for `specs/{feature-number}-*/` (or similar). If found, agents will use spec.md and COMPLETION.md for context.

**Display (optional):**
```
=== PR Creation ===
Branch: {branch-name}
Feature: #{number} (if detected)
Uncommitted changes: {count} files
Proceeding with PR creation...
```

### Step 1: Analyze Changes

Use the **pr:context-analyzer** agent to gather comprehensive context:

```
Use the pr:context-analyzer agent to analyze the git changes.

For spec-kit projects also:
- Note any spec-kit context (spec.md, COMPLETION.md if present in specs/ or repo)
- Identify changed files and their purpose
- Provide comprehensive analysis for PR description
```

The agent will:
- Examine commits and diffs
- Identify changed files
- Determine change type and scope
- Extract context from spec files if present
- Provide comprehensive analysis

**Wait for the analysis to complete before proceeding.**

### Step 2: Write PR Content

Use the **pr:describer** agent to write the PR title and description:

```
Use the pr:describer agent with the analysis from pr:context-analyzer to write the PR title and description.

If spec-kit files exist (spec.md, COMPLETION.md), incorporate that context into the description (summary, testing, checklist).

For the Test Plan section, split into two subsections:
- ### Pre-Merge — checks that must pass before merging (unit tests, lint, manual verification)
- ### Post-Merge — follow-up checks after deploy (smoke tests, metrics, stakeholder validation)

Tailor post-merge items per change. Write "N/A" when no post-merge checks apply.
```

Pass the analysis output to this agent. The agent will:
- Review the context analysis
- Ask clarifying questions if needed
- Draft a PR title following conventional commit format
- Write a comprehensive PR description (Summary, Changes, Test Plan with Pre-Merge/Post-Merge subsections, Checklist)
- Use spec-kit context when present

**Wait for the PR content to be ready before proceeding.**

### Step 3: Create the PR (YOU Execute)

**CRITICAL: Do NOT use an agent for this step. YOU (the main Claude instance) must execute these commands directly.**

Agents cannot reliably execute state-changing commands. You must run the git and gh commands yourself.

#### 3.1 Verify State

First, check the git status:

```bash
git status
git branch --show-current
```

**Handle issues automatically:**

**Signing diagnostic note:**
- If `git commit` hangs or appears to wait for signing, do not assume classic GPG just because `commit.gpgsign=true` is set.
- First run `git config --show-origin --get-regexp '^(commit\.gpgsign|gpg\.format|user\.signingkey)$'`.
- If `gpg.format=ssh`, this repo is using SSH commit signing via Git's `gpg.*` keys.
- In that case, verify `echo "$SSH_AUTH_SOCK"`, `test -S "$SSH_AUTH_SOCK"`, and `ssh-add -l` before suggesting `--no-gpg-sign` or blaming worktrees.
- If `SSH_AUTH_SOCK` is invalid on macOS, recover it with `export SSH_AUTH_SOCK="$(launchctl print "gui/$(id -u)/com.openssh.ssh-agent" | awk -F' => ' '/SSH_AUTH_SOCK => / {print $2; exit}')"`.

If both issues exist (on main/master AND uncommitted changes), handle them in sequence:

**Issue 1: On main or master branch**

If the current branch is main or master, offer to create a feature branch:

```
Ask the user: "You're on the main branch. Would you like me to create a feature branch?"

Suggest a branch name based on the changes (e.g., fix/description or feat/description).
Options:
1. Create suggested branch (e.g., fix/update-config)
2. Let me specify a branch name
3. Cancel
```

If user agrees, create the branch:
```bash
git checkout -b <branch-name>
```

**Issue 2: Uncommitted changes**

If there are uncommitted changes (staged or unstaged), offer to commit them:

```
Ask the user: "You have uncommitted changes. Would you like me to commit them?"

Options:
1. Yes, commit with auto-generated message
2. Yes, let me provide a commit message
3. Cancel
```

If user agrees:
```bash
# Stage all changes
git add -A

# Commit with message (auto-generated following conventional commits, or user-provided)
git commit -m "message"
```

**If user cancels at any point:**
- STOP and inform the user what they need to do manually
- Do not proceed with PR creation

#### 3.2 Ensure Remote Main Branch Exists

Before pushing, verify the remote `main` branch exists (see **Base Branch Policy**):

```bash
if ! git ls-remote --exit-code --heads origin main >/dev/null 2>&1; then
  echo "Remote 'main' branch does not exist. Creating it..."
  ROOT_COMMIT=$(git rev-list --max-parents=0 HEAD | head -1)
  git push origin "${ROOT_COMMIT}:refs/heads/main"
fi
```

#### 3.3 Push the Branch

```bash
# Get current branch name
BRANCH=$(git branch --show-current)

# Push to remote
git push -u origin "$BRANCH"
```

**Check the exit code.** If git push failed:
- Report the error to the user
- STOP - do not attempt to create PR
- Common issues: merge conflicts, protected branch, no permissions

#### 3.4 Create the Pull Request

Use the EXACT title and description from pr:describer. Do not modify them. **Always include `--base main`** (see Base Branch Policy).

**If `DRAFT_ENABLED=true` (create draft):**

```bash
gh pr create \
  --base main \
  --draft \
  --title "EXACT_TITLE_FROM_DESCRIBER" \
  --body "$(cat <<'EOF'
EXACT_DESCRIPTION_FROM_DESCRIBER
EOF
)"
```

**If `DRAFT_ENABLED=false` (default - create ready-for-review):**

```bash
gh pr create \
  --base main \
  --title "EXACT_TITLE_FROM_DESCRIBER" \
  --body "$(cat <<'EOF'
EXACT_DESCRIPTION_FROM_DESCRIBER
EOF
)"
```

**Important:**
- Use heredoc (<<'EOF') for proper multiline handling
- Single quotes around EOF prevent variable expansion
- Draft PRs require the `--draft` flag
- Ready-for-review PRs omit the `--draft` flag
- Always include `--base main` to target the correct base branch
- If `gh pr create` fails with a GitHub API rate limit (including `GraphQL: API rate limit already exceeded for user ID ...`), follow **GitHub API Rate Limit Handling** and STOP

#### 3.5 Verify PR Creation

```bash
# Get the PR URL to verify it was created
gh pr view --json url --jq .url
```

**If this command fails:**
- The PR was not created successfully
- If the error is a GitHub API rate limit, follow **GitHub API Rate Limit Handling** below and STOP
- Report the error to the user
- Do not report success

**Common Issues:**

- **"gh: command not found"**: GitHub CLI not installed - user needs `brew install gh`
- **"already exists"**: PR already exists for this branch - get URL with `gh pr view --json url --jq .url`
- **"authentication"**: User needs to run `gh auth login`
- **"repository not found"**: Wrong repo or permissions issue
- **"API rate limit exceeded" / "GraphQL: API rate limit already exceeded" / "rate limit"**: Follow **GitHub API Rate Limit Handling** below and STOP

**Only report success if:**
1. ✅ git push succeeded (exit code 0)
2. ✅ gh pr create succeeded (exit code 0)
3. ✅ gh pr view returns a valid URL

### Step 4: Evaluate Conflicts (Always) + Monitor & Fix CI/CD (Default)

Always run **pr:conflict-evaluator** immediately after PR creation.

Use the **pr:conflict-evaluator** agent with the PR number you just created. This evaluation should check the PR against its base branch and recommend updating from base first (typically rebase onto `main`) when conflicts or behind-base conditions are detected.

The pr:conflict-evaluator agent checks mergeability via:

```bash
gh pr view <PR_NUMBER> --json mergeable,mergeStateStatus,baseRefName,headRefName --jq '{mergeable: .mergeable, mergeStateStatus: .mergeStateStatus, base: .baseRefName, head: .headRefName}'
```

**Precedence rule:** `mergeable` is the authoritative field for conflict detection. Always evaluate `mergeable` first, then use `mergeStateStatus` for additional context. When the two fields appear to conflict (e.g., `mergeStateStatus = BEHIND` but `mergeable = CONFLICTING`), `mergeable` wins.

**Interpretation rules (priority order):**

1. **`mergeable` = `CONFLICTING`** (regardless of `mergeStateStatus`): The PR has merge conflicts that must be resolved before merging.
2. **`mergeable` = `MERGEABLE`** and **`mergeStateStatus` = `CLEAN`**: No conflicts, branch is up to date.
3. **`mergeable` = `MERGEABLE`** and **`mergeStateStatus` = `BEHIND`**: The branch is behind the base branch but has no conflicts. A merge or rebase is recommended.
4. **`mergeable` = `MERGEABLE`** and **`mergeStateStatus` = `DIRTY`**: No git conflicts, but the merge is not clean — typically caused by failing required status checks. Do **not** report this as conflicts (since `mergeable` confirms no conflicts exist). Report as "merge blocked by failing checks or inconsistent branch state."
5. **`mergeable` = `MERGEABLE`** and **`mergeStateStatus` = `BLOCKED`**: No git conflicts, but merging is blocked by branch protection rules (e.g., required reviews or passing checks not yet met).
6. **`mergeable` = `MERGEABLE`** and **`mergeStateStatus` = `UNSTABLE`**: No git conflicts, but some required status checks have not passed.
7. **`mergeable` = `UNKNOWN`**: GitHub hasn't computed mergeability yet. This is normal for freshly created PRs. Re-check during evaluation.

**Note:** The `mergeStateStatus` enum values are: `CLEAN`, `DIRTY`, `BEHIND`, `BLOCKED`, `UNSTABLE`, or `HAS_HOOKS`. The value `UNKNOWN` only applies to the `mergeable` field, never to `mergeStateStatus`.

If the conflict evaluator reports a GitHub API rate limit, return its reset-time report to the user and STOP before CI monitoring.

**If `MONITOR_ENABLED=true` (default):**
- After conflict evaluation, enter the **CI Monitor & Auto-Fix Loop** (see dedicated section below).
- This monitors checks, and if they fail and `AUTO_FIX_ENABLED=true`, automatically investigates, fixes, pushes, and re-monitors.

**If `MONITOR_ENABLED=false` (via `--no-monitor`):**
- Skip CI/CD monitoring; report conflict evaluation only

### Step 5: Present Summary

```
=== PR Created Successfully ===

Feature: #{feature-number} (if detected) - {title}
PR: #{pr-number} ({Draft|Ready})
Merge: {Clean|Conflicts|Behind|Blocked}
URL: {url}
CI/CD: {Passed|Failed|Skipped|Fixed after N attempts}

Next Steps (for you):
1. Review the PR: {url}
2. Merge when ready (your decision)
3. After merge: /speckit.specify for next feature

PR creation complete - merge is your call!
```

**STOP HERE** - Do not offer to merge. The user will merge when ready.

---

## GitHub API Rate Limit Handling

This workflow uses several `gh` commands. If any `gh` command fails with a GitHub API rate-limit message (for example `API rate limit exceeded`, `GraphQL: API rate limit already exceeded for user ID ...`, `rate limit`, or an HTTP 403 caused by rate limiting), **do not retry in a loop**. Stop the PR workflow and return when the limit resets.

Determine the reset timestamp dynamically from GitHub, then format it in the machine's current local timezone (whatever timezone the user is currently working in). For GraphQL errors such as `GraphQL: API rate limit already exceeded for user ID ...`, use the GraphQL rate-limit bucket rather than the REST/core bucket:

```bash
# Put the failed gh stderr/stdout in ERROR_TEXT when available.
# Example: ERROR_TEXT="$GH_ERROR_OUTPUT"
RATE_JSON=$(gh api rate_limit 2>/dev/null || true)

if [ -n "$RATE_JSON" ]; then
  RATE_JSON="$RATE_JSON" ERROR_TEXT="${ERROR_TEXT:-}" python3 - <<'PY'
from datetime import datetime, timezone
import json, os

rate = json.loads(os.environ["RATE_JSON"])
resources = rate.get("resources", {})
error_text = os.environ.get("ERROR_TEXT", "").lower()

preferred = "graphql" if "graphql" in error_text else "core"
resource = resources.get(preferred) or {}

# If the preferred bucket is not clearly exhausted, use any exhausted bucket.
if resource.get("remaining") not in (0, "0"):
    for candidate in resources.values():
        if candidate.get("remaining") in (0, "0"):
            resource = candidate
            break

reset = resource.get("reset")
if not reset:
    raise SystemExit("No reset timestamp found in gh api rate_limit output")

now = datetime.now().astimezone()
reset_at = datetime.fromtimestamp(int(reset), tz=timezone.utc).astimezone()
seconds = max(0, int((reset_at - now).total_seconds()))

parts = []
for label, div in (("d", 86400), ("h", 3600), ("m", 60)):
    value, seconds = divmod(seconds, div)
    if value:
        parts.append(f"{value}{label}")
if seconds or not parts:
    parts.append(f"{seconds}s")

print(f"Absolute: {reset_at:%Y-%m-%d %H:%M:%S %Z} ({reset_at:%z})")
print(f"Relative: in {' '.join(parts)}")
PY
fi
```

Report using this format:

```markdown
❌ GitHub API rate limit exceeded

Reset time:
- Absolute: <YYYY-MM-DD HH:MM:SS TZ (+/-HHMM)>
- Relative: in <duration from now>

Please retry `/speckit.ext.pr` after the reset time.
```

If `gh api rate_limit` also fails and no reset timestamp can be obtained, say so clearly and include the original `gh` error output.

---

## CI Monitor & Auto-Fix Loop

This section is referenced by both Fast-Track Step 5 and Regular Mode Step 4 when `MONITOR_ENABLED=true`.

Instead of monitoring checks once and stopping, this loop keeps going until CI is green — or until it's clear that manual intervention is needed.

### Loop Logic

```
fix_attempt = 0

MONITOR:
  Launch pr:monitor agent → wait for check results

  Rate limited →
    Report reset time from pr:monitor (absolute local time + relative duration). Done.

  All checks passed →
    Report success (mention fix_attempt count if > 0). Done.

  Checks failed + AUTO_FIX_ENABLED + fix_attempt < MAX_FIX_ATTEMPTS →
    fix_attempt++
    Investigate → Fix → Commit → Push → goto MONITOR

  Checks failed + (!AUTO_FIX_ENABLED or fix_attempt >= MAX_FIX_ATTEMPTS) →
    Report remaining failures with details. Done.
```

The pr:monitor agent tracks both individual check status (`gh pr checks`) and workflow run status (`gh run list --commit $HEAD_SHA`) to prevent premature exit when CI has sequential/dependent jobs (`needs:` in GitHub Actions).

### Fix Steps (Main Claude executes all of this — NOT agents)

**1. Get failed run details**

```bash
HEAD_SHA=$(gh pr view <PR_NUMBER> --json headRefOid --jq .headRefOid)
gh run list --commit "$HEAD_SHA" --json databaseId,name,conclusion \
  --jq '.[] | select(.conclusion == "failure")'
```

If either command reports a GitHub API rate limit, follow **GitHub API Rate Limit Handling** and STOP.

**2. Fetch failure logs**

```bash
gh run view <RUN_ID> --log-failed 2>&1 | tail -200
```

If this command reports a GitHub API rate limit, follow **GitHub API Rate Limit Handling** and STOP.

If the output is too large or unclear, narrow it down:
```bash
gh run view <RUN_ID> --log-failed 2>&1 | grep -A 20 "Error\|FAIL\|error:\|FAILED"
```

**3. Analyze and fix the code**

Read the failure logs. Identify the root cause. Read the relevant source files. Make the fix.

Common categories:
- **Lint/format** → fix style issues, run formatter if available
- **Type errors** → fix type mismatches
- **Test failures** → fix the test or the code under test
- **Build errors** → fix imports, dependencies, compilation issues
- **Security scans** → address flagged vulnerabilities

**4. Commit and push**

```bash
git add <specific-changed-files>
git commit -m "fix: <what was fixed to resolve CI>"
git push
```

Follow the same commit signing conventions as the rest of the workflow.

**5. Re-monitor**

Go back to the top of the loop: launch **pr:monitor** agent again with the same PR number. The new push triggers fresh CI runs.

### Guardrails

The fix loop handles straightforward CI fixes — the kind where reading the error log makes the solution obvious (lint violations, missing imports, test assertion mismatches, etc.).

If a failure suggests the overall approach is wrong — a fundamental design issue, not a fixable error — report the situation to the user instead of attempting increasingly speculative fixes. Burning through all attempts on a dead-end wastes time and creates noisy commit history.

When in doubt about whether a fix is correct, err toward asking the user rather than guessing.

### Reporting (after loop completes)

Report to the user:
- Final check status (all passed / still failing)
- Number of fix attempts made (if any)
- Brief summary of what was fixed in each attempt
- If still failing after max attempts: the remaining failure details and logs so the user can take over

---

## Workflow Summary

**Basic (ready-for-review PR with monitoring + auto-fix - default):**
```
/speckit.ext.pr
  ↓
pr:context-analyzer agent (analyzes, incl. spec-kit context)
  ↓ (analysis)
pr:describer agent (writes content)
  ↓ (title + description)
Main Claude: git push + gh pr create --base main
  ↓ (PR number)
pr:conflict-evaluator agent
  ↓
┌─ CI Monitor & Auto-Fix Loop ──────────────────┐
│ pr:monitor agent → wait for checks             │
│   ✅ All passed → Done                         │
│   ❌ Failed → Main Claude: fetch logs, fix,    │
│               commit, push → re-monitor        │
│   (up to MAX_FIX_ATTEMPTS iterations)          │
└────────────────────────────────────────────────┘
  ↓
Ready PR created + conflict status + CI results ✅
```

**Wizard mode:**
```
/speckit.ext.pr wiz
  ↓
Ask user: Draft or Ready? Monitor?
  ↓ (user selections)
pr:context-analyzer agent
  ↓ (analysis)
pr:describer agent
  ↓ (title + description)
Main Claude: git push + gh pr create --base main
  ↓ (PR number)
pr:conflict-evaluator agent
  ↓ (optional: CI Monitor & Auto-Fix Loop if monitoring enabled)
PR created ✅
```

**Draft PR:**
```
/speckit.ext.pr --draft
  ↓
pr:context-analyzer agent
  ↓ (analysis)
pr:describer agent
  ↓ (title + description)
Main Claude: git push + gh pr create --draft --base main
  ↓
pr:conflict-evaluator agent
  ↓
Draft PR created ✅
```

**Without monitoring:**
```
/speckit.ext.pr --no-monitor
  ↓
pr:context-analyzer agent
  ↓ (analysis)
pr:describer agent
  ↓ (title + description)
Main Claude: git push + gh pr create --base main
  ↓
pr:conflict-evaluator agent (always)
  ↓
PR created + conflict status ✅ (no CI/CD waiting or fixing)
```

**Without auto-fix (monitor only, report failures):**
```
/speckit.ext.pr --no-auto-fix
  ↓
pr:context-analyzer agent → pr:describer agent
  ↓
Main Claude: git push + gh pr create --base main
  ↓
pr:conflict-evaluator → pr:monitor (report only, no fix loop)
```

**Fast-track mode:**
```
/speckit.ext.pr --fast-track (or -f)
  ↓
Main Claude: Auto-generate title from branch + commits
  ↓
Main Claude: git push + gh pr create --base main
  ↓ (PR number)
pr:conflict-evaluator agent
  ↓ (optional: CI Monitor & Auto-Fix Loop if monitoring enabled)
PR created ✅
```

**Fast-track + draft + no monitoring:**
```
/speckit.ext.pr -f -d -M
  ↓
Main Claude: Auto-generate title/description
  ↓
Main Claude: git push + gh pr create --draft --base main
  ↓
pr:conflict-evaluator agent
  ↓
Draft PR created ✅ (no CI/CD monitoring)
```

---

## Important Notes

1. **Sequential execution** - Each agent must complete before the next starts
2. **Pass data between agents** - Output from one agent is input to the next
3. **Verify completion** - Each agent should confirm it completed its task
4. **Handle failures** - If any agent fails, stop and report the issue

---

## Responsibilities

### pr:context-analyzer agent
- Tools: Bash (git commands), Read, Grep
- Job: Analyze git changes (read-only); note spec-kit context (spec.md, COMPLETION.md) if present
- Output: Comprehensive change analysis

### pr:describer agent
- Tools: Read, AskUserQuestion
- Job: Write PR content (read-only); incorporate spec-kit context when available; split Test Plan into Pre-Merge and Post-Merge subsections
- Output: Title and description

### Main Claude Instance (YOU)
- Tools: Bash (git push, gh pr create), Read, Edit, Grep, Glob
- Job: Execute state-changing commands + investigate and fix CI failures in the auto-fix loop
- Output: Actual PR creation, URL, and CI fixes

### pr:conflict-evaluator agent
- Tools: Bash (gh pr view, git fetch, git rev-list)
- Job: Evaluate mergeability against base branch and provide remediation strategies (read-only)
- Output: Conflict status, base-vs-head divergence, and ranked remediation recommendations

### pr:monitor agent
- Tools: Bash (gh pr checks, gh run list)
- Job: Monitor CI/CD checks and workflow run status (read-only)
- Output: CI/CD results and merge-state snapshot

---

## Edge Cases

**No commits on branch:**
- pr:context-analyzer will detect and report this
- Stop the workflow

**Large PR (>400 lines):**
- pr:context-analyzer will note this
- pr:describer will recommend splitting
- Ask user if they want to proceed or split

**PR already exists:**
- Main Claude will detect this when running gh pr create
- Run `gh pr view --json url --jq .url` to get existing PR URL
- Return existing PR URL to user

**GitHub CLI not installed:**
- Main Claude will detect this when attempting gh pr create
- Provide manual instructions:
  - Branch has been pushed
  - Go to GitHub and create PR manually
  - Use title and description from pr:describer

**On main branch (regular mode):**
- Offer to create a feature branch; do not error out before offering

---

## Quality Standards

Following @.claude/shared/pull-request-guidelines.md:

✅ **DO:**
- Use specialized agents for each phase
- Pass complete context between agents
- Verify each step completes successfully
- Follow conventional commit format
- Link related issues
- Use spec-kit context (spec.md, COMPLETION.md) when present

❌ **DON'T:**
- Skip any agent in the workflow (unless fast-track)
- Proceed if an agent fails
- Modify data between agents
- Include AI attribution in PR
- Merge PRs automatically (see Never Merge PRs)

---

## Important: Never Merge PRs

**CRITICAL**: Claude must NEVER merge PRs automatically.

- PR creation is the end of this workflow
- Merging is ALWAYS a manual action by the user
- After PR creation, the user reviews and decides when to merge
- Do not offer to merge, do not suggest auto-merging

The workflow ends at "PR Created" - merge is left to the repository owner.

---

## Execution

Now execute the workflow:

1. **Parse flags** - Check for help (`--help`/`-h`), fast-track (`--fast-track`/`-f`/`-ft`), wizard (`--wizard`/`wiz`), draft (`--draft`/`-d`), no-monitor (`--no-monitor`/`-M`), no-auto-fix (`--no-auto-fix`/`-F`), and max-fix-attempts (`--max-fix-attempts N`) flags. Consider `$ARGUMENTS` and user message.
   - If `--help` flag is present, display the usage information and flags, then EXIT
   - If `--fast-track`, `-f`, or `-ft` flag is present, execute Fast-Track Mode (skip to step 1a)
   - If `--wizard` or `wiz` flag is present, execute Wizard Mode to gather preferences

**1a. Fast-Track Mode (if enabled):**
   - Verify git status; apply scope check and auto-fix as documented
   - Ensure remote `main` branch exists (create from root commit if missing)
   - Auto-generate title from branch name + first commit
   - Auto-generate description from commit messages
   - Run `git push -u origin $(git branch --show-current)`
   - Run `gh pr create --base main` with auto-generated content (add `--draft` if enabled)
   - Launch pr:conflict-evaluator agent with the PR number (always)
   - If monitoring enabled, enter CI Monitor & Auto-Fix Loop (monitors, and if auto-fix enabled, fixes failures and re-monitors up to MAX_FIX_ATTEMPTS times)
   - Report results (include next step: /speckit.specify after merge) and EXIT

**Regular Mode (if fast-track not enabled):**

2. **Optional:** Run spec-kit pre-flight (branch, feature number, spec directory).
3. **Launch pr:context-analyzer agent** (via Task tool) to analyze changes; include spec-kit context instructions in the prompt.
4. **Wait for analysis**, then launch pr:describer agent with the analysis; ask to incorporate spec-kit files if present and use Pre-Merge/Post-Merge test plan subsections.
5. **Wait for PR content**, then YOU (main Claude) execute the git commands:
   - Check `git status` (verify/offer to fix uncommitted changes, branch)
   - Ensure remote `main` branch exists (create from root commit if missing)
   - Run `git push -u origin $(git branch --show-current)`
   - Run `gh pr create --base main` with exact title and description from pr:describer
   - Add `--draft` flag if `DRAFT_ENABLED=true`
   - Run `gh pr view --json url --jq .url` to verify and get PR URL
6. **Always** launch pr:conflict-evaluator agent with the PR number for immediate mergeability assessment and remediation guidance
7. **If monitoring is enabled**, enter CI Monitor & Auto-Fix Loop:
   - Launch pr:monitor agent for CI/CD polling
   - If checks fail and `AUTO_FIX_ENABLED=true` and attempts remain: investigate logs, fix code, commit, push, re-monitor
   - Repeat up to `MAX_FIX_ATTEMPTS` times
8. **Present summary** - PR URL, status (draft/ready), conflict status/remediation guidance, CI/CD results, fix loop summary (if applicable), and Next Steps (review, merge when ready, then /speckit.specify for next feature). Do not offer to merge.

**CRITICAL:** The step where you run git push and gh pr create, and the fix loop, must be executed by YOU (the main Claude instance), not by an agent. Agents cannot reliably execute state-changing commands.
