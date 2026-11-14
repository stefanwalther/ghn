# Feature #007: Repository Multi-Select with Bulk Context Menu - COMPLETE

**Completion Date**: 2026-11-08
**Status**: All requirements met
**Quality**: Production-ready
**Branch**: `t3/multi-select-menu-actions`
**PR**: https://github.com/stefanwalther/ghn/pull/138

---

## What Was Delivered

The inbox left filter sidebar now supports standard multi-select: Ctrl-click (Windows/Linux) or Cmd-click (macOS) toggles individual repository rows, Shift-click extends a contiguous range from an anchor row, and a plain click keeps today's single-repo filter behavior. Right-clicking a selected row opens one combined menu for the whole selection with the same triage actions as the single-row menu (snooze presets plus unsnooze, digest rhythm, mark all done/read), showing combined counts and Mixed states, applying to every selected repository at once.

Destructive bulk actions reuse the established confirmation threshold (25) against combined totals with one dialog naming item and repository counts, per-repository busy indication, a single summary notice, and rollback on failure. No new server endpoint, schema change, or credential was introduced; bulk actions fan out through the existing per-repository mutations in parallel.

## Requirements Met

- ✅ FR-001: Toggle individual rows with Ctrl-click / Cmd-click
- ✅ FR-002: Extend a contiguous visible range with Shift-click
- ✅ FR-003: Single anchor row for repeated Shift-clicks
- ✅ FR-004: Selected state visually distinct from, and co-visible with, the active filter
- ✅ FR-005: Plain click preserves filter behavior and clears the selection
- ✅ FR-006: Escape / empty-space click clears without changing the filter
- ✅ FR-007: Right-click inside selection targets all; outside targets one and clears
- ✅ FR-008: Combined menu offers the full triage action set for the whole selection
- ✅ FR-009: Combined counts; entries disabled only when nothing is actionable
- ✅ FR-010: Mixed indicator for disagreeing rhythm/snooze states
- ✅ FR-011: Open-repo targets the anchor row; copy joins all links with one report
- ✅ FR-012: Bulk destructive actions confirm against the shared threshold with totals
- ✅ FR-013: Per-repository busy indication, untouched rows stay interactive
- ✅ FR-014: Immediate expected results, rollback on failure, one summary notice
- ✅ FR-015: Identity-based selection; Shift-range uses visible order
- ✅ FR-016: Full keyboard operability with assistive-technology states
- ✅ FR-017: Snoozed-section rows participate in the same selection model

## Key Changes

**Files Changed**: 19 (8 tracked source/test files, new e2e spec, 8 spec-kit design docs)

**Major Changes**:
- `components/inbox/filter-sidebar.tsx` — owns ephemeral selection state plus anchor; modifier-aware clicks, Shift+Arrow range, Escape/empty-space clearing, combined-menu targeting
- `components/inbox/repo-snooze-menu.tsx` — new `RepoBulkMenu` export sharing the existing menu shell; flat inline presets/rhythm for touch; single-row menu untouched
- `app/page.tsx` — `markRepoDone`/`markRepoRead` generalized to `string | string[]`; combined totals, one confirmation, parallel fan-out, aggregated notices, multi-id navigation
- `lib/inbox-state.ts` — pure `rangeSelection` and `summarizeRepoSelection` helpers; `nextRepoAfterMarkDone` accepts id lists
- `lib/shortcuts.ts` + `docs/keybindings.md` — help entries for the new gestures
- Tests at all layers: unit (helpers, edge cases), component (selection, bulk menu, page fan-out), e2e (snooze fan-out, combined confirm + cancel)

**Commits**:
- `feat(inbox): repository multi-select with bulk context menu`
- `test(inbox): cover bulk menu interactions and fan-out paths`
- `docs: mirror sidebar multi-select shortcut in keybindings`

## Lessons Learned

**What went well**:
- TDD caught a real bug before it shipped: the bulk done/read hint text leaked into the accessible name, found by a failing component test and fixed by adopting the single-row menu's labelled-hint pattern.
- E2E caught two environment-real issues: macOS turns Ctrl-click into right-click (tests now use the platform modifier), and collapsed accessible-name matching behaves differently than unit-test intuition suggests.
- The coverage ratchet proved its worth: it flagged a real gap in bulk-menu interaction coverage, and closing it added meaningful keyboard/dismiss tests.

**What could improve**:
- One palette e2e test flakes intermittently in sequence (passes in isolation, unrelated drawer path). Worth a standalone flake investigation rather than tolerating retries.
- The bulk-menu component grew large sharing a file with the single menu; if a third menu variant appears, extract the shared shell instead of adding a third export.

---

**Ready for PR**: ✅ (PR #138 open, CI green, mergeable)
