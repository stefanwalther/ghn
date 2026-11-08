# Handover: Feature #007 - Repository Multi-Select with Bulk Context Menu

**Completed**: 2026-11-08
**For**: Future developers
**Spec**: `specs/007-repo-multi-select/spec.md` (start here, 10 min)
**PR**: https://github.com/stefanwalther/ghn/pull/138

---

## What This Feature Does

The inbox filter sidebar supports standard multi-select (Ctrl/Cmd-toggle, Shift-range from an anchor) plus one combined context menu that applies the existing per-repo actions (snooze, rhythm, mark done/read, open, copy) to the whole selection at once. No new server capability; everything fans out through existing mutations.

---

## Key Components

| Component | Purpose |
|-----------|---------|
| `components/inbox/filter-sidebar.tsx` | Owns ephemeral selection state (`selected: Set<string>` + `anchorId`); modifier click handling, Shift+Arrow range, Escape/empty-space clearing, right-click targeting, bulk context assembly |
| `components/inbox/repo-snooze-menu.tsx` | `RepoBulkMenu` export (flat combined menu) sharing the positioning/focus/dismiss patterns; single-row `RepoSnoozeMenu` untouched |
| `lib/inbox-state.ts` | Pure `rangeSelection` (Shift-range over visible order, null/unknown anchor degrades to toggle) and `summarizeRepoSelection` (combined pending/readable, rhythm common vs `"mixed"` vs null, snooze none/all/mixed) |
| `app/page.tsx` | `markRepoDone`/`markRepoRead` accept `string \| string[]`; combined totals, one `confirmDone` dialog carrying `repositoryIds`, parallel per-repo mutations, aggregated notices, multi-id busy tracking and post-done navigation |
| `lib/bulk.ts` | Unchanged; `BULK_CONFIRM_THRESHOLD = 25` reused against combined totals |

---

## How to Test

Manual (5 min, per `quickstart.md`): Ctrl/Cmd-click three non-adjacent sidebar rows (filter unchanged), Shift-click a fourth to extend the range, right-click a selected row for the count-titled menu, pick a snooze preset and verify all selected repos snooze, select a set with combined pending above 25 and choose Mark all as done to check the confirmation names totals, Escape clears the selection.

Automated: `bun run test:unit -- inbox-state`, `bun run test:component -- repo-list-filter`, new e2e journey `tests/e2e/repo-multi-select.spec.ts`, full local gate `make check`.

---

## Configuration

None required. Selection is ephemeral client state; no endpoint, schema, migration, or credential was added. The over-threshold path needs seeded repos with combined pending above 25 (the e2e seed qualifies with the three immediate repos).

---

## Known Issues/Limitations

- Multi-select never creates a multi-repo inbox filter; the filter stays single-valued by design (spec assumption, out of scope).
- Touch devices use the per-row "..." trigger applied to the current selection; no long-press range gesture.
- `DigestSection` main-column quiet rows keep single-row menus; only sidebar rows participate.
- One palette e2e test (`Enter on a thread opens it in the drawer`) flakes intermittently in sequence; unrelated to this feature, passes in isolation.

---

## Tips for Modification

- Keep selection identity-based: new row types must register stable repository ids in `displayIds` or Shift-range and summary counts will silently skip them.
- The bulk menu deliberately mirrors the single menu's accessible patterns (`aria-pressed` toggles, labelled hints via `aria-describedby`); the coverage ratchet will catch untested menu paths, so add component tests with any new entry.
- `markRepoDone`/`markRepoRead` normalize `string | string[]` up front; keep single-repo copy byte-identical (component tests assert exact dialog wording).
- If a third menu variant appears, extract the shared menu shell from `repo-snooze-menu.tsx` instead of adding another export.

---

## Quick Start

1. Read spec.md (10 min)
2. Review plan.md architecture (5 min)
3. Read this handover (5 min)
