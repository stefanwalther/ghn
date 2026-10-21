# Feature Specification: Automated Test Suite

**Feature Branch**: `t3/specify-comprehensive-testing`

**Created**: 2026-10-20

**Status**: Draft

**Input**: User description: "So far, we have built this solution iteratively, I think we are entirely missing good tests, unit tests, e2e tests, etc. Tests should be able to run locally (with a target in makefile) but also with GitHub actions."

## User Scenarios & Testing *(mandatory)*

<!--
  User personas here are the people who build and maintain ghn, not the end
  users of the inbox. The "user" of this feature is the maintainer.
-->

### User Story 1 - Verify a change locally with one command (Priority: P1)

A maintainer changes business rules in ghn and wants to know before pushing whether the change broke anything. They run one documented command, get a clear pass or fail verdict, and see exactly which behavior regressed when it fails.

**Why this priority**: This is the core of the request. Without a single reliable local entry point, every other testing investment is unusable in practice. Everything else assumes this exists.

**Independent Test**: Can be fully tested by introducing a deliberate regression in a piece of business logic, running the documented command, and confirming it reports a failure naming the broken behavior. Delivers the "can I trust my change" answer on demand.

**Acceptance Scenarios**:

1. **Given** a fresh checkout with dependencies installed, **When** the maintainer runs the documented local test command, **Then** the complete suite runs and the command reports an overall pass or fail verdict.
2. **Given** a failing test, **When** the local command finishes, **Then** the output names the behavior that broke and the location of the failure, and the command exits with a failure status.
3. **Given** a green suite, **When** the local command finishes, **Then** the command exits successfully and reports how many checks passed.
4. **Given** a fresh checkout, **When** the maintainer follows the documented prerequisites and runs the command, **Then** no further manual setup (no hand-created files, no manual database preparation, no editing of configuration) is required.

---

### User Story 2 - Catch regressions before a change is merged (Priority: P1)

A maintainer opens a pull request and wants the automated checks to run on their own, so that a reviewer spends attention on design rather than on discovering a broken filter.

**Why this priority**: The value of a test suite is realized when it blocks bad changes. Without an automatic pre-merge gate, a good suite is only advisory and gets skipped under time pressure.

**Independent Test**: Can be fully tested by opening a pull request containing a deliberate regression and confirming the automated run fails and the change cannot be merged until it is fixed. Delivers the safety net on every change.

**Acceptance Scenarios**:

1. **Given** a pull request with changes, **When** the maintainer pushes it, **Then** the automated suite runs automatically and reports a verdict on the pull request.
2. **Given** a failing automated run, **When** the maintainer views the pull request, **Then** the failure is visible on the pull request and the change is not mergeable until the run is green.
3. **Given** a pull request with only non-code changes such as documentation, **When** it is opened, **Then** the automated run still reports a verdict rather than being skipped.
4. **Given** the existing quality gates, **When** the automated suite is added, **Then** the existing type and lint checks continue to run and continue to block a failing change.

---

### User Story 3 - Run the suite without touching the real GitHub account (Priority: P1)

A maintainer runs the full suite on a machine where their real GitHub account is authenticated. They want to be certain that running the tests cannot mark their real notifications as done, unsubscribe them from real threads, or otherwise mutate their account.

**Why this priority**: ghn's write paths are destructive by nature, and the existing tests were deliberately written to avoid live writes. A test suite that can silently damage the maintainer's real account is worse than no suite at all, because it is trusted and run automatically.

**Independent Test**: Can be fully tested by running the entire suite with a real authenticated GitHub session available and confirming that no real notification, subscription, or repository setting changed afterwards. Delivers safety, which is a precondition for the suite being adopted.

**Acceptance Scenarios**:

1. **Given** an authenticated GitHub session on the machine running the suite, **When** the full suite executes, **Then** no real notification, thread, subscription, or repository setting is created, changed, or deleted.
2. **Given** a test that exercises a write action such as marking a thread done, **When** that test runs, **Then** the write is directed at a controlled stand-in for the GitHub service rather than the real one.
3. **Given** a test that exercises a read action such as listing notifications, **When** that test runs, **Then** the response comes from a controlled stand-in, not from the live service.
4. **Given** no GitHub session and no network access, **When** the suite runs, **Then** it still passes and reports a result, rather than failing because live services are unreachable.

---

### User Story 4 - Know which behavior is protected and which is not (Priority: P2)

A maintainer wants to know where the safety net is thin, so they can direct their own review attention at the unprotected parts and know which areas deserve new tests.

**Why this priority**: Coverage is not a goal in itself, it is a map. Without the map, the maintainer cannot tell a genuinely well-tested area from an area that simply has no tests yet.

**Independent Test**: Can be fully tested by producing the coverage view and confirming it names every part of the application, showing which parts have no automated check at all rather than only listing covered parts. Delivers visibility into the remaining gap.

**Acceptance Scenarios**:

1. **Given** a completed suite run, **When** the maintainer opens the coverage view, **Then** every part of the application appears in it, including parts with no automated check.
2. **Given** the coverage view, **When** the maintainer inspects a part of the application, **Then** they can tell whether it is covered, how heavily, and which checks exercise it.
3. **Given** an automated run on a pull request, **When** the run finishes, **Then** the coverage information is retained as a downloadable artifact rather than only printed to a log.
4. **Given** a pull request that lowers coverage below the coverage of its merge base, **When** the automated run finishes, **Then** the run fails and the pull request is blocked. **Given** a pull request that raises coverage, **When** the run finishes, **Then** the run is not blocked by coverage.

---

### User Story 5 - Have the core inbox journeys verified end to end (Priority: P2)

A maintainer changes the inbox screen and wants confidence that the actual user journeys still work, not just that the underlying functions return the right values. They want the journeys exercised against a fixed, known dataset rather than whatever happens to be in the database.

**Why this priority**: Unit-level confidence does not catch broken wiring, and the existing end-to-end suite depends on leftover state and tolerates missing data through conditional assertions, so it can pass while the app is broken.

**Independent Test**: Can be fully tested by breaking a user journey at the screen level, such as making the filter control not apply its selection, and confirming that the end-to-end check for that journey fails. Delivers real confidence in the assembled app.

**Acceptance Scenarios**:

1. **Given** the suite runs, **When** the end-to-end checks execute, **Then** they run against a fixed dataset with a known number of items, and they fail if that expected data is missing rather than skipping the check.
2. **Given** the inbox screen, **When** the end-to-end checks run, **Then** the journey of loading the inbox, narrowing it with a filter, selecting an item, inspecting it, and triaging it is verified.
3. **Given** the navigation between the inbox, the repository view, and the rate-limit view, **When** the end-to-end checks run, **Then** each view loads and renders its primary content.
4. **Given** a check that exercises a write journey, **When** it runs, **Then** the resulting state is visible in the application afterwards, proving the write path is wired end to end.

---

### User Story 6 - Trust that a green local run predicts a green merge (Priority: P3)

A maintainer wants the local run and the automated merge run to agree, so that a green local result is meaningful evidence and not a coincidence of different environments.

**Why this priority**: Divergence between local and merge runs is the classic cause of "works on my machine" failures and erodes trust in the whole suite. It matters, but it is a property of the other stories rather than a journey of its own.

**Independent Test**: Can be fully tested by introducing a failure that appears only in the merge environment, such as a check that depends on a real credential, and confirming that the same failure reproduces locally once the documented prerequisites are followed. Delivers parity between the two environments.

**Acceptance Scenarios**:

1. **Given** the local command and the merge-time run, **When** both execute, **Then** they execute the same set of checks with the same setup, and neither silently skips a check the other runs.
2. **Given** a check that cannot run in the current environment, **When** the suite executes, **Then** that check is reported explicitly as not run, rather than passing silently.
3. **Given** the documented prerequisites are not met locally, **When** the maintainer runs the command, **Then** the command fails with a clear message naming the unmet prerequisite.

### Edge Cases

- What happens when the suite is run twice in a row without cleaning anything up? The second run produces the same verdict as the first, with no leftover state from the previous run affecting it.
- What happens when the suite runs with no network access at all? It still runs every check and reports a result; checks that need a remote service are directed at the local stand-in rather than the live service.
- What happens when the machine has no GitHub session, or an expired one? The suite behaves the same as on an authenticated machine, because no check depends on a real session.
- What happens when the application database already contains data from normal use? The suite does not read it, does not modify it, and does not delete it.
- What happens when a check fails because the environment is broken rather than the code? The failure is distinguishable from a genuine regression, and it does not cause the rest of the suite to be skipped.
- What happens when a check crashes outright rather than failing an assertion? The runner still completes the remaining checks and reports the crash.
- What happens when tests are run in a different order than before? The verdict does not change, because checks do not depend on each other's leftovers.
- What happens when the maintainer runs only one layer of the suite, such as only the fast checks? The run reports which layers were executed and which were not, so a partial run is never mistaken for a full one.
- What happens when coverage drops because new code was added without tests? The drop is visible in the coverage artifact attached to the pull request, and the run fails because coverage fell below the merge-base baseline.
- What happens when there is no coverage figure for the merge base to compare against? The comparison is reported as not evaluable with the reason, rather than failing the run against an unknown baseline.
- What happens when coverage rises? The run passes, and the higher figure becomes the new baseline for later pull requests.
- What happens when the application is slow to start for an end-to-end check? The check waits for readiness with a bounded timeout and fails with a clear message rather than hanging forever.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The project MUST expose a single documented local command that runs the complete automated test suite and reports an overall pass or fail verdict.
- **FR-002**: The local command MUST be part of the project's standard task runner, alongside the existing development and serving targets, so it is discoverable from the same place as every other project task.
- **FR-003**: The suite MUST contain three distinct layers: fast in-process checks of individual rules and functions, checks that exercise the service and storage layers together, and checks that drive the assembled application through its user-facing journeys.
- **FR-004**: The local command MUST run all three layers and MUST support running a single layer on its own, while reporting which layers were executed.
- **FR-005**: Every pull request MUST trigger the automated suite automatically, and the existing type-checking and lint gates MUST continue to run alongside it.
- **FR-006**: A failing automated run MUST block the merge of the pull request that triggered it.
- **FR-007**: The suite MUST NOT read from, write to, or delete anything in a real GitHub account, including notifications, threads, subscriptions, and repository settings, regardless of whether the machine running the suite is authenticated.
- **FR-008**: Checks that exercise remote behavior MUST direct their requests at a controllable stand-in for the GitHub service, and that stand-in MUST be able to produce scripted success, failure, authorization-error, rate-limit, and timeout responses.
- **FR-009**: The suite MUST pass with no network access and no authenticated GitHub session present.
- **FR-010**: The suite MUST NOT depend on the real clock beyond explicitly pinned instants; where time matters, the instant MUST be supplied by the check itself.
- **FR-011**: Test data MUST be deterministic: the same suite run MUST produce the same fixtures, the same item counts, and the same verdict on every execution.
- **FR-012**: Checks MUST be isolated from one another; the result of running the suite MUST NOT depend on the order in which checks execute, nor on state left behind by a previous run.
- **FR-013**: The suite MUST report the outcome of every check, and MUST NOT silently pass over a check that could not run. A check that cannot run MUST be reported as not run, with the reason.
- **FR-014**: A failing check MUST report the behavior that broke and the location of the failure, so the maintainer can act on it without reproducing it by hand.
- **FR-015**: A check that crashes MUST NOT prevent the remaining checks from running; the runner MUST continue and report the crash alongside the other outcomes.
- **FR-016**: The suite MUST produce a coverage view that names every part of the application, including parts with no automated check, and MUST NOT list only the covered parts.
- **FR-017**: The coverage information MUST be retained as a downloadable artifact from every automated merge-time run.
- **FR-018**: End-to-end checks MUST run against a fixed dataset with a known number of items, and MUST fail when that dataset is absent or unexpected rather than skipping the affected journey.
- **FR-019**: End-to-end checks MUST cover the core inbox journey: loading the inbox, narrowing it with a filter, selecting an item, inspecting it, and triaging it.
- **FR-020**: End-to-end checks MUST cover the loading of each primary view of the application, including the inbox, the repository view, and the rate-limit view.
- **FR-021**: The suite MUST leave the application's own data untouched. Running it MUST NOT delete, rewrite, or invalidate data that the maintainer uses outside the suite.
- **FR-022**: The suite MUST be runnable from a fresh checkout using only the documented prerequisites, and MUST NOT require hand-written setup steps, manually created files, or hand-edited configuration.
- **FR-023**: The full suite MUST complete within a practical time budget so that it remains reasonable to run on every change.
- **FR-024**: The existing manual demo-seeding capability MUST remain available and MUST NOT be affected by the suite.
- **FR-025**: The automated suite MUST execute the same set of checks with the same setup in the local and merge-time environments, so that a green local run is meaningful evidence for the merge-time run.
- **FR-026**: The automated suite MUST preserve the project's existing quality gates, and MUST NOT require the removal or weakening of the type-checking, lint, or formatting checks that already exist.
- **FR-027**: The suite MUST provide reusable, shared setup for the recurring needs it has, so that adding a new check does not require copying test scaffolding.
- **FR-028**: A newly added check MUST be picked up by the standard local command and the merge-time run without any manual registration step.
- **FR-029**: The suite MUST contain at least one automated check for every service action and every business rule the application exposes, and the coverage view MUST list any part of the application that has no automated check as uncovered rather than omitting it.
- **FR-030**: The merge-time run MUST compare overall coverage against the coverage of the merge base, and MUST fail the run when coverage falls below that baseline. Coverage that is equal to or higher than the baseline MUST NOT fail the run, so the baseline can grow over time.

### Key Entities

- **Automated Test Suite**: The complete set of automated checks for the application, comprising the fast checks, the service-and-storage checks, and the end-to-end journey checks. It is executed as a whole locally and on every pull request.
- **Test Layer**: One of the three categories of check, distinguished by how much of the application it exercises and how fast it runs. A layer can be run on its own, and a run always reports which layers were included.
- **GitHub Stand-In**: A controllable local substitute for the GitHub service. It answers the read and write calls the application makes, and can be scripted to produce success, failure, authorization-error, rate-limit, and timeout responses so that error paths are exercised deliberately rather than by accident.
- **Fixture**: A deterministic, pre-built dataset representing repositories, notifications, subscriptions, and settings. Fixtures are identical on every run and are isolated from the application's real data.
- **Coverage View**: The map from the parts of the application to the checks that exercise them. It names every part, including the parts with no checks, so the remaining gap is visible rather than hidden.
- **Gate**: A required check on a pull request that blocks merging while it is failing. The automated suite, the type check, and the lint check are all gates.
- **Local Run**: One invocation of the suite on a developer's machine, through the documented task-runner command.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: A maintainer runs the documented local command on a fresh checkout and receives a clear pass or fail verdict in under 5 minutes, with no manual setup beyond installing dependencies.
- **SC-002**: 100% of pull requests receive an automated pass or fail verdict before human review, and no pull request merges while its automated run is failing.
- **SC-003**: Ten consecutive full runs of the suite on an unchanged checkout produce ten identical verdicts, with zero failures caused by execution order or leftover state.
- **SC-004**: Zero automated runs change the state of a real GitHub account, verified by comparing account state before and after a full run on an authenticated machine.
- **SC-005**: The coverage view names 100% of the application's parts, including those with no automated check, so the maintainer can always identify an unprotected area.
- **SC-006**: Each of the five core inbox journeys (load, filter, select, inspect, triage) has at least one end-to-end check that runs on every pull request, and each of those checks fails when its journey is broken.
- **SC-007**: A maintainer reading only the failure output can name the broken behavior and its location in under one minute, without reproducing the failure manually.
- **SC-008**: Every service action and business rule the application exposes has at least one automated check that fails when its behavior regresses, and 100% of the application's parts appear in the coverage view, including any that currently have no check.
- **SC-009**: The suite reports an explicit not-run outcome for every check it cannot execute, and 0 checks are silently passed over.
- **SC-010**: The existing type-checking, lint, and formatting gates remain in place and continue to block a failing change after the suite is introduced.
- **SC-011**: A maintainer can add a new check and have it execute in both the local command and the merge-time run with no manual registration step.
- **SC-012**: 100% of merge-time runs evaluate the coverage baseline comparison, a pull request that lowers coverage below its merge-base baseline is blocked, and a pull request that leaves coverage equal to or higher than that baseline is not blocked by coverage.

## Assumptions

- The audience for this feature is the person maintaining ghn. The end user of the inbox does not interact with the test suite directly.
- ghn is a single-account, single-user application. The suite is therefore designed around one maintainer and one local account, not around multi-tenant or team-wide concerns.
- The stand-in for the GitHub service is used for every check that touches remote behavior. The suite never contacts the live GitHub service, so the suite has no dependency on credentials and no risk of mutating a real account. The trade-off is that the stand-in only covers behavior the application actually calls, and real-world GitHub responses that the application never parses are out of scope.
- The existing automated checks are treated as a starting point to be extended, restructured, and made reliable, not as a fixed baseline to preserve unchanged. Checks that tolerate missing data or that depend on leftover state are expected to be tightened or replaced.
- "Service action" means every action the application can trigger from outside, which in practice means every request the application answers. "Business rule" means every decision the application makes about filtering, scheduling, snoozing, rendering, triage, and queueing. The agreed scope covers all of both, so nothing is deferred to a later round by default.
- Coverage measurement is available to the project. If the existing toolchain cannot produce one, adding that capability is part of this feature's scope.
- The coverage baseline for the merge-time comparison is the coverage of the merge base, computed the same way. Where that figure cannot be produced, the run reports the comparison as not evaluable rather than guessing.
- The application's own data is preserved. The suite works on its own isolated data and never points the application's data store at the real one.
- The pull request is reviewed by the same maintainer who writes the code, so the suite's role is to catch regressions, not to act as an independent review gate.
- Testing is scoped to what is written in this repository. External services that ghn consumes are represented by the stand-in rather than tested in their own right.
- The existing task runner, type-check, lint, and formatting commands are assumed to remain the project's standard entry points, and this feature adds to them rather than replacing them.
