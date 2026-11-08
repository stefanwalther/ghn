# Contract: queue health in /api/sync

Backward-compatible additive change. Existing `queueDepth` keeps its name and counts every stored row; two fields are added.

## Response fields

| Field | Type | Meaning |
|---|---|---|
| `queueDepth` | number | Count of all stored queued rows via `COUNT(*)` |
| `queueOldestAgeMs` | number | `now - MIN(created_at)` over stored rows, `0` when empty |
| `queueReasonBreakdown` | object | Map of `last_error` string to count over stored rows, `{}` when empty |

## Example

```json
{
  "queueDepth": 3,
  "queueOldestAgeMs": 45000,
  "queueReasonBreakdown": { "network": 2, "rate_limited": 1 }
}
```

## Compatibility

- Additive only: no field removed or renamed.
- `queueDepth` keeps counting every stored row, so capped poison rows stay visible in depth and breakdown while drains skip them.
