# Contract: Filter memory (client preference)

No HTTP/API contract. This feature adds no endpoint; the inbox filter schema is multi-select (see `specs/001-quiet-notifications/contracts/inbox-api.md`).

## Storage contract (`localStorage["ghn:inbox-filters"]`)

- Value: JSON string of `{version: 2, filters: {repos: string[], states: ("unread"|"done")[], types: string[], ages: AgeFilter[]}}`. Empty arrays mean no restriction, except `states` which defaults to `["unread"]`.
- Readers MUST accept the v1 shape (`{version: 1, filters: {repo, state, type, age}}`) and migrate it: `"all"` maps to empty (or both states for `state`), single values map to one-element arrays.
- Readers MUST ignore and treat as absent when: key missing, JSON parse fails, shape wrong, `version !== 1` and `version !== 2`, or any field fails validation (then per-field defaults apply).
- Writers MUST overwrite the full v2 payload on every explicit filter change.
- Access MUST be guarded with try/catch; throw means absent (read) or no-op (write).

## URL contract (multi-select)

- `parseInboxFilters` reads repeated and comma-separated params into sets; `serializeInboxFilters` writes them back in stable order (`?state=all` stays the compact alias for both states).
- Bare entry = `searchParams.toString() === ""` -> restore path via `router.replace("/" + serialize(stored))`.
- Non-empty query = explicit path -> render verbatim, then persist parsed result.
