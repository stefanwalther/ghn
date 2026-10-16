# Research: Live GitHub Sync

**Feature**: specs/002-live-github-sync/spec.md
**Date**: 2026-10-16

All Technical Context unknowns resolved. No NEEDS CLARIFICATION remains (Q1-Q3 decided in spec: reuse `gh` CLI session, Done maps to GitHub Done state, stay single-user local).

Verified empirically against `gh` CLI 2.101.0 with an authenticated session (`gh auth status`: active account, scopes `gist, read:org, repo, workflow`).

## R1: Sync transport reuses the `gh` CLI session

- Decision: Server Route Handlers shell out to `gh api --method GET /notifications` with `-f all=true -f per_page=50` and follow `Link` pagination, exactly like `lib/contributions.ts` already shells out to `gh api graphql` and `gh api user`. No token UI, no secret storage. Auth presence is probed with `gh auth status`; failures surface as the spec's disconnected state with a reconnect path (re-run `gh auth login`).
- Rationale: The user chose this in Q1, it matches the prototype's existing contributions path, and it was verified live: `GET /notifications?per_page=2` returns 200 with thread payloads, while the earlier 404 was a harness error (fields sent as POST body instead of GET query). Response headers confirm `X-Accepted-Oauth-Scopes: notifications, repo`, so the current `repo` scope is accepted.
- Alternatives considered: In-app personal token entry (rejected, new secret handling for zero gain in single-user local scope), OAuth app login (rejected, heaviest build, only justified for hosted multi-user which Q3 ruled out).

## R2: Polling respects GitHub's poll interval and stays conditional

- Decision: Manual refresh plus on-open sync only, gated by the `X-Poll-Interval` response header (observed `60` seconds). Store `lastSyncAt` and the last `Last-Modified` value in the new sync-state table; send `If-Modified-Since` on refresh and treat `304 Not Modified` as fresh-without-cost. Pass `since=<lastSyncAt>` for incremental pages. Never background-poll faster than the advertised interval; disable the refresh control with a countdown while inside the window.
- Rationale: The notifications API is explicitly optimized for polling with `Last-Modified`/`304` leaving the rate limit untouched. Observed rate-limit budget is 5000/hr (`X-Ratelimit-Limit`), but subject-resolution fetches (R4) multiply requests, so conditional polling plus `since` is the load-bearing frugality.
- Alternatives considered: Fixed-interval background daemon (rejected, fights the poll-interval contract and the single-user offline-readable guarantee), webhook-driven sync (rejected, requires a public endpoint and hosted mode).

## R3: Write-back mapping with GitHub Done semantics and a local-only unread

- Decision: `done` maps to `DELETE /notifications/threads/{thread_id}` (204, equivalent to Done in the GitHub web inbox). `read` maps to `PATCH /notifications/threads/{thread_id}` (205). `unsubscribe` maps to local done plus a muted-subject row (prototype behavior preserved) plus best-effort `PUT /notifications/threads/{id}/subscription {ignored: true}`. `unread` has **no remote endpoint** (GitHub offers mark-read only), so it stays a local-only overlay: the row re-enters the inbox immediately, the write-back queue records nothing for it, and the next sync preserves an explicit local unread over a remote read for threads still present. Spec FR-004's website-agreement promise therefore covers done/read; unread divergence is documented in the UI contract and quickstart, not silently reinterpreted.
- Rationale: Matches the user's Q2 choice (GitHub Done state) with documented endpoint semantics, keeps prototype unsubscribe/mute behavior, and refuses to fake an unread API that does not exist.
- Alternatives considered: Done as mark-read only (rejected, weaker than the chosen Done parity and resurfaces threads GitHub considers done), unread via re-subscribe tricks (rejected, fabricates remote state and risks notification spam).

## R4: Thread-to-row mapping, reason normalization, and source URLs

- Decision: Each GitHub thread becomes one notification row keyed by the thread `id` (string, e.g. `26392900861`). Field map: `unread` inverts to `isRead`, `updated_at` becomes both `createdAt` (sort key, replacing seed age spread) and `githubUpdatedAt`, `reason` is stored verbatim (widening the prototype's closed reason union), `repository.full_name` resolves to a repository row, `subject.title` becomes the row subject, and `sourceUrl` resolves from `subject.url` (an API URL such as `.../repos/{owner}/{repo}/issues/1263`) to its `html_url` via one cached fetch per unique URL at sync time with concurrency 5. Fallback when resolution fails: `{repo html_url}/{type-anchor}/{number}` derived from the API URL shape, never a dead link.
- Rationale: Verified against live payloads (`subject: {title, url, latest_comment_url, type}`, `repository: {full_name, private, ...}`). Storing the raw reason avoids lossy mapping as GitHub adds reasons (`ci_activity`, `state_change`, `member_feature_requested`, `agent_session_finished`, ...); the filter facet list (R6) is extended to the observed union instead of the prototype's 8 seeded values. Caching subject URLs bounds the N+1 fetch cost that would otherwise multiply the rate-limit load from R2.
- Alternatives considered: Deriving `sourceUrl` purely by URL rewriting without fetching (rejected, brittle across subject types like Commit vs Release vs Discussion), storing only the API URL (rejected, breaks the prototype's one-click open-source promise).

## R5: Repository auto-discovery with quiet defaults and preserved rhythms

- Decision: Repositories resolve by `repository.full_name`. Ownership derives from `repository.owner.login == viewer login` (`gh api user --jq .login`, same helper as contributions): equal means `owned` (default rhythm `immediate`), otherwise `watched` (default rhythm `weekly`). Existing prototype rhythm rows are never overwritten by discovery; only newly seen full names get defaults. Renamed, deleted, or access-lost repos keep their cached rows but are flagged in the repositories response so the inbox can mark them without blocking the rest.
- Rationale: Implements spec FR-009 exactly while honoring FR-006 carry-over. Weekly-for-watched preserves the prototype's calm default that SC-004 depends on.
- Alternatives considered: Defaulting new repos to immediate (rejected, floods the main flow on first sync and breaks the digest promise), prompting per-repo on discovery (rejected, blocks first sync on user triage).

## R6: Digest, filters, and keyboard behavior carry over unchanged

- Decision: `lib/digest.ts` math (weekly +7d, biweekly +14d, monthly +1 calendar month, `isDue`, grouping) and `lib/snooze.ts` apply identically to live rows; the inbox route keeps the same `mainFlow` vs dimmed `collapsedSection` split, facets, and bulk bar. `TYPE_FILTERS` is extended to the live reason union with the prototype labels kept where they overlap. No digest or filter logic forks between seed and live modes.
- Rationale: The prototype's SC-002 click-reduction and SC-004 digest-correctness evidence transfers only if the triage path is literally the same code. One logic path also keeps the unit suite (digest boundaries, bulk transitions) valid.
- Alternatives considered: Separate live grouping rules (rejected, doubles the test surface and risks divergence), dropping age buckets on live data (rejected, spec FR-001 keeps them).

## R7: Migration, seed gating, and offline queue

- Decision: First live sync runs a one-way migration: delete all `n_*` seed notification rows, keep every repository rhythm row, insert discovered repos with R5 defaults, then upsert live threads. `POST /api/notifications/seed` stays dev-only (already 403s in production) and additionally refuses when live rows exist unless explicitly forced in development; the inbox UI hides the Reseed button in live mode. Sync failures and write-back failures land in a persistent `writeback_queue` table (thread, action, attempts, last error) with non-blocking UI retry; cached rows stay readable with last-synced time and stale/disconnected/rate-limited banners per spec US4.
- Rationale: Enforces FR-011 (never mix seed with live) with a reversible-before-first-sync boundary (repository settings survive, disposable seed rows do not), and gives US4's resilience a durable backlog instead of in-memory hope.
- Alternatives considered: Keeping seed rows alongside live rows with a source flag (rejected, violates FR-011 and poisons facets/counts), in-memory retry only (rejected, loses pending Done actions across restarts and reintroduces triage-twice).
