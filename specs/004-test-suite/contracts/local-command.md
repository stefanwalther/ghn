# Contract: Local Command Surface

**Feature**: [004-test-suite](../spec.md) | **Date**: 2026-10-20

The interface a developer touches to run the suite, and the interface CI uses. Everything here is a public surface: changing it is a breaking change to the developer's workflow.

---

## 1. Make targets

The Makefile is the project's existing task runner (FR-002). The suite adds to it rather than replacing it.

The specification names three layers. These targets expose four runner projects, because React client components need a DOM environment and therefore a separate project from the pure-function checks. The extra project is a subdivision of the first layer, not a fourth kind of check. See the layer mapping in [plan.md](../plan.md).

```text
make test              # the complete suite: unit + integration + component + e2e
make test-unit         # one layer
make test-integration  # one layer
make test-component    # one layer
make test-e2e          # the end-to-end layer
make test-coverage     # the merged coverage view, written to coverage/
make coverage-check    # compare the current coverage against the merge base
```

### Behaviour of `make test`

| Property | Contract |
|---|---|
| Exit code | `0` when every check is `pass` or `not run`. Non-zero when any check is `fail` or `crash`. |
| Layers | Runs all four. Prints which layers ran before starting. |
| Output | Names the behaviour and the location for every failure (FR-014). |
| Prerequisite | `bun install` only. No manual file creation, no hand-edited configuration (FR-022). |
| Duration | Under 5 minutes on a typical machine (SC-001). |

### Behaviour of a single-layer target

Runs that layer alone and prints which layers it ran, so a partial run is never mistaken for a full one (FR-004). `make test-unit` prints `layers: unit`, not `layers: all`.

### Behaviour of `make test-e2e`

Adds two steps the other layers do not need, both automatic:

1. Resets an isolated database at a temporary path. The maintainer's own database is never opened (FR-021).
2. Starts the application against that database, the frozen clock, and the local GitHub stand-in.

The target leaves nothing running when it exits.

### Behaviour of `make coverage-check`

Compares the coverage in `coverage/coverage-summary.json` against a baseline. Requires the baseline to exist; when it does not, it reports `not evaluable` and exits `0`. See [coverage-ratchet.md](./coverage-ratchet.md).

---

## 2. Package scripts

The Makefile delegates to package scripts, so the same commands work for a developer who prefers `bun run` and for CI.

```json
{
  "scripts": {
    "test": "vitest run",
    "test:unit": "vitest run --project unit",
    "test:integration": "vitest run --project integration",
    "test:component": "vitest run --project component",
    "test:e2e": "playwright test",
    "test:coverage": "vitest run --coverage",
    "test:all": "vitest run --coverage && playwright test",
    "coverage:check": "bun run scripts/compare-coverage.ts"
  }
}
```

`package.json` also changes the start script so the port can be overridden, which the end-to-end layer needs:

```json
"start": "bun --bun next start -p ${PORT:-21120}"
```

The existing `start` behaviour is unchanged when `PORT` is unset.

---

## 3. Layer selection

The Vitest projects are named `unit`, `integration` and `component`. Selecting one is `--project <name>`. The end-to-end layer is not a Vitest project; it is invoked by Playwright.

Directory layout that determines layer membership:

```text
tests/unit/**/*.test.ts       -> unit
tests/integration/**/*.test.ts -> integration
tests/component/**/*.test.tsx -> component
tests/e2e/**/*.spec.ts        -> e2e
```

A file in the wrong directory is picked up by the wrong layer. This is deliberate: placing a check in a directory is the only registration step, and the layer's environment and setup follow from it (FR-028).

---

## 4. Output contract

Every run reports, in this order:

1. The layers that ran.
2. The per-check outcome, including checks that could not run and why.
3. The overall verdict.
4. The exit code.

A check that could not run is reported as `not run` with its reason. It is never reported as `pass` and never omitted (FR-013).

A failure output contains the behaviour that broke and the location, so a developer can act without reproducing the failure by hand (FR-014, SC-007).

---

## 5. GitHub Actions surface

Two jobs, both required.

```text
quality   typecheck, lint, unit + integration + component with coverage,
          then the coverage ratchet against the merge base.
          Uploads the coverage view as an artifact.

e2e       production build, then the end-to-end layer.
          Uploads the Playwright report and traces on failure.
```

Neither job replaces an existing gate. The type check and the lint check continue to run exactly as before (FR-026).

### Environment passed to the end-to-end job

```text
TZ=UTC
```

Set at the job level, not only on the server process, so that the build and the test run agree.

### Environment passed to the application server in the end-to-end job

```text
PORT              21140
GHN_DB_PATH       a temporary file, never inside the repository
GHN_NOW           2026-01-15T12:00:00Z
GHN_TOKEN         the stand-in's credential
GHN_API_BASE      http://127.0.0.1:21141
```

These are set on the server process only, so they are not present during the build.

### Environment passed to the coverage job

```text
GHN_DB_PATH       a temporary file, separate from the end-to-end job's
GHN_NOW           2026-01-15T12:00:00Z
GHN_BASE_SHA      the pull request's base commit
```

The base commit is needed so the merge base can be located. The repository must be checked out with full history depth.

---

## 6. Change impact

| Change | Breaking for |
|---|---|
| A new Make target | Nothing |
| A new package script | Nothing |
| Renaming a Vitest project | The `--project` selectors in the package scripts |
| Moving a test file between layer directories | Which layer it runs in, and therefore its environment |
| Changing `make test` to exclude a layer | FR-003 and FR-004 |
| Making the coverage ratchet block on a `not evaluable` baseline | FR-030, which requires it to be reported rather than failed |
