# Quickstart: Persist Filter Selection

**Feature**: `008-persist-filter-selection` | **Date**: 2026-11-14

## Manual validation (local, no GitHub contact)

1. `make dev` (or `make start`), open the inbox at `/`.
2. Set a distinctive filter: repo `acme/web`, state `Unread`, type any non-All, age `Last 7 days`. Confirm the URL becomes `/?repo=...&type=...&age=7d` (state `unread` stays implicit).
3. Open DevTools Application > Local Storage, verify key `ghn:inbox-filters` holds `{"version":1,"filters":{...}}` matching your choice.
4. Navigate to `/` bare (clear the query string, Enter). The inbox must restore the same filter set with no click, and the URL must rewrite to the serialized set.
5. Open `/?repo=acme/api&state=all` while a different set is stored. It must render `acme/api` + `all`, and the next bare `/` visit must now remember that explicit set.
6. Corrupt test: `localStorage.setItem('ghn:inbox-filters','{oops')`, reload `/` bare. Inbox must show defaults and stay usable; changing a filter must overwrite the corrupt entry with valid JSON.
7. Private-mode parity: block storage (or use a profile that throws); inbox must behave as today (URL-only), no error screen.

## Automated gates

```bash
bun run typecheck
bun run lint
bun run test:unit -- tests/unit/view-state.test.ts
bun run test:component
```

E2E (needs `make build` + browser):

```bash
bun run test:e2e -- tests/e2e/inbox-filter-persistence.spec.ts
```

Existing filter suites must stay green: `inbox.spec.ts`, `views.spec.ts`, `triage.spec.ts`, `palette-scopes.spec.ts`, `repo-multi-select.spec.ts`.
