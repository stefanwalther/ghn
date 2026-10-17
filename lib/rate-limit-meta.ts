export type RateLimitBucketId = "core" | "graphql" | "search";

export const RATE_LIMIT_BUCKETS: RateLimitBucketId[] = ["core", "graphql", "search"];

export const RATE_LIMIT_DOCS: Record<RateLimitBucketId, { title: string; limit: string; note: string }> = {
  core: { title: "Core (REST)", limit: "5,000/hr", note: "requests per hour, per account" },
  graphql: { title: "GraphQL", limit: "5,000/hr", note: "points per hour, per account" },
  search: { title: "Search", limit: "30/min", note: "requests per minute" },
};
