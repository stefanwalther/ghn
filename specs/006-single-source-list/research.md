# Research: Single-Source Inbox List

**Date**: 2026-10-27. All unknowns below were resolved by same-day spikes against the codebase, the test suite and the live GitHub API. No open NEEDS CLARIFICATION remains.

## R1. List source: cache-direct plus pending gate

- Decision: render the inbox list directly from the shared query cache, delete the local `items` working copy and the blind copy effect, and hold previous cache data while a bulk mutation is pending so a pre-commit refetch cannot overwrite optimistic rows.
- Rationale: two copies plus a blind overwrite is the divergence class. The cache already holds optimistic updates with snapshot restore and post-settle invalidation, so it is the correct single owner.
- Alternatives considered: generation-id guard on the working copy (rejected, keeps two sources and its own bookkeeping); keep as-is (rejected, reproduces the reported bug).

## R2. Out-of-order responses

- Decision: rely on the query layer discarding superseded fetches, verified by gated component test with cache inspection.
- Rationale: a held pre-commit response resolving after a newer fetch started does not touch the cache. The remaining hole was the component copy, removed by R1.
- Alternatives considered: client-side sequence numbers on responses (rejected, duplicates a guarantee the layer already provides).

## R3. Unread parity impossible

- Decision: revive stays local-only with documented divergence.
- Rationale: live probe 2026-10-27. Per-thread PATCH with `read:false` returns 205 and leaves `unread:false`. No unread write exists in the public REST surface. Collection PUT was not probed: same flag handling with account-wide blast radius made it unjustifiable after the per-thread negative.
- Alternatives considered: collection PUT `read:false` probe (rejected, unjustifiable blast radius for near-zero information).

## R4. Sync precedence P2 plus P3

- Decision: dirty local beats sync (queued writes and explicit revives survive; content may refresh), clean rows converge to GitHub (missing threads done on full sync, changed threads refreshed, read follows remote).
- Rationale: preserves offline triage and the revive guarantee while the parallel-edit case converges to the remote UI state.
- Alternatives considered: blanket remote-wins (rejected, wipes offline done, queued reads and revives before the push succeeds).

## R5. All-view done marks in place

- Decision: done and unsubscribe in the all view set `isDone=1` in place instead of removing rows, matching the confirmed server state that keeps done rows in that view.
- Rationale: removal contradicted the end state and flashed rows out and back on every refetch. Unit tests that encoded removal were rewritten.
- Alternatives considered: hide done rows in the all view server-side (rejected, changes the view contract users rely on).

## R6. Pin storage

- Decision: repositories column with ensure-schema migration, exposed through the existing GET shape and PATCH flow with optimistic update plus rollback.
- Rationale: repo attributes already live, migrate, seed and sync in that table. A side store would duplicate merge, ordering and cleanup rules.
- Alternatives considered: localStorage side-store (rejected, parallel plumbing for the same rows); sidebar grouping in v1 (rejected, triage risk, repos page only).

## R7. Test mapping per story

- Decision: unit for pure helpers and precedence, integration for routes plus DB plus stand-in, component for DOM behavior, e2e excluded from gates.
- Rationale: matches the constitution layers. Regression anchors already exist for revive survival and all-view mark-in-place.
- Alternatives considered: e2e in gates (rejected, needs build plus browser, stays separate per constitution).
