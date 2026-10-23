import type { InboxFilters } from "./view-state";

/**
 * Central query key factory. Keys are hierarchical primitives derived from
 * normalized URL filters so every consumer shares the same cache entries.
 */
export const queryKeys = {
  notifications: (filters: InboxFilters, limit?: number | null) =>
    [
      "notifications",
      filters.repo,
      filters.state,
      filters.type,
      filters.age,
      limit ?? null,
    ] as const,
  repositories: () => ["repositories"] as const,
  connection: () => ["connection"] as const,
  thread: (id: string) => ["thread", id] as const,
  rateLimits: () => ["rate-limits"] as const,
  settings: () => ["settings"] as const,
};
