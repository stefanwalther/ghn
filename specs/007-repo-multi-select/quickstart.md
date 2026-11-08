# Quickstart: Validate Repository Multi-Select

**Feature**: [spec.md](spec.md) | **Date**: 2026-11-08

Manual and automated validation for the multi-select feature. Implementation code belongs in `tasks.md` and the PR, not here.

## Prerequisites

- Clone plus `make start` serves the app with the seeded dataset (see `README`, onboarding stays clone plus start plus sync).
- For the destructive-threshold path, the seed needs repositories whose combined pending total exceeds 25, or temporarily adjust selection size in the test.

## Manual validation (5 minutes)

1. Open the inbox. Ctrl-click (Cmd-click on macOS) three non-adjacent repository rows in the left filter menu. All three show the selected state; the inbox filter does not change.
2. Shift-click a fourth row below the last anchor. Every row between anchor and target joins the selection.
3. Right-click any selected row. One menu opens titled with the selection count. Pick a snooze preset; all selected repositories snooze and unselected ones do not.
4. Select repositories with a combined pending total above 25, choose "Mark all as done". A confirmation naming the item total and repository count appears before anything changes.
5. Press Escape. Menu closes first, selection clears second, filter unchanged. Plain-click a row and confirm the inbox filters to it.

Expected: each step matches the [interaction contract](contracts/sidebar-selection.md); one summary notice per bulk action; busy indication only on affected rows.

## Automated validation

- `bun run test:unit -- inbox-state` — range helper cases (null anchor, forward/backward ranges, target outside visible list, hidden-row preservation).
- `bun run test:component -- repo-list-filter` — toggle/range/clear visuals, `aria-selected`, combined menu targeting, disabled-when-zero-actionable.
- `make test-e2e` (or the triage spec) — select three via modifiers, snooze all, combined done with confirmation.
- Full gate before PR: `make check` (typecheck, lint, unit, integration, component).

## References

- Interaction details: [contracts/sidebar-selection.md](contracts/sidebar-selection.md)
- State rules: [data-model.md](data-model.md)
- Decisions and rejected alternatives: [research.md](research.md)
