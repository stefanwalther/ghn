# Data Model: Rate Limits View

**Feature**: specs/003-rate-limits/spec.md
**Date**: 2026-10-17

No persisted entities. Everything below is ephemeral: built per refresh on the server, serialized once to the browser, never stored. (No migration, no schema changes, no seed interaction.)

## Rate Limit Bucket

One GitHub quota family ghn consumes. Three instances per refresh: `core`, `graphql`, `search`.

- `used`: integer, requests consumed in the current window, from `X-RateLimit-Used`
- `limit`: integer, allowance for the window, from `X-RateLimit-Limit`
- `remaining`: integer, allowance left, from `X-RateLimit-Remaining`
- `percent`: number, one decimal, `used / limit * 100` (0 when limit is 0)
- `resetsAt`: ISO timestamp or null, from `X-RateLimit-Reset` (epoch seconds)
- `resetsInSecs`: integer seconds until reset, or null when the reset header is absent
- `status`: `ok` | `rate-limited` (`rate-limited` exactly when `remaining === 0`)

Validation rules:

- A bucket is usable only when limit, used, and remaining all parse as integers; otherwise the bucket is absent and its reason lands in `warnings`.
- `remaining === 0` MUST surface as `rate-limited` with a non-color-only flag in the UI.
- A parsed bucket is kept even when its probe returned 403/429, as long as remaining is non-zero; the probe status becomes a warning, not a deletion.

State transitions: none. Buckets have no lifecycle; each refresh builds a fresh set.

## Refresh Outcome

The result of one user-triggered re-read.

- `provider`: fixed string `github`
- `fetchedAt`: ISO timestamp of the refresh, rendered as the "last fetched" signal
- `usage`: map of bucket id to Rate Limit Bucket (only usable buckets present)
- `warnings`: optional map of bucket id to human-readable notice (probe refused, headers missing, transport failure)
- Error case (no usable buckets, or 401): `error` message plus `reason` of `auth` | `network` | `unreachable`, with no `usage` map

Validation rules:

- At least one usable bucket is required for a successful outcome; zero means error.
- HTTP mapping: `auth` reasons surface as 401, all other failures as 502. The browser never receives the token in either case.

## Documented Limit (static reference)

Published allowance per bucket, shipped with the page, not probed.

- `core`: 5,000/hr, requests per hour per account
- `graphql`: 5,000/hr, points per hour per account
- `search`: 30/min, requests per minute

Each entry links to the authoritative GitHub rate-limit documentation. These values change only when GitHub changes its published limits.

## Relationships

- One Refresh Outcome contains zero or more Rate Limit Buckets plus zero or more warnings (disjoint keys: a bucket id appears in exactly one of the two maps).
- Documented Limits are independent of refreshes; the page joins them to live buckets by bucket id for display.
- No relationship to inbox rows, repositories, digest settings, or sync state.
