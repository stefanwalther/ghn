# Contract: Filter memory (client preference)

No HTTP/API contract. This feature adds no endpoint, no query param, and no schema change.

## Storage contract (`localStorage["ghn:inbox-filters"]`)

- Value: JSON string of `{version: 1, filters: {repo: string, state: "unread"|"all"|"done", type: string, age: AgeFilter}}`.
- Readers MUST ignore and treat as absent when: key missing, JSON parse fails, shape wrong, `version !== 1`, or any field fails validation (then per-field defaults apply).
- Writers MUST overwrite the full payload on every explicit filter change.
- Access MUST be guarded with try/catch; throw means absent (read) or no-op (write).

## URL contract (unchanged)

- `parseInboxFilters` / `serializeInboxFilters` behavior unchanged.
- Bare entry = `searchParams.toString() === ""` -> restore path via `router.replace("/" + serialize(stored))`.
- Non-empty query = explicit path -> render verbatim, then persist parsed result.
