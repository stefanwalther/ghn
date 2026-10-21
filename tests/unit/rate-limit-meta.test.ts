import { describe, expect, test } from "vitest";
import {
  RATE_LIMIT_BUCKETS,
  RATE_LIMIT_DOCS,
  type RateLimitBucketId,
} from "@/lib/rate-limit-meta";

describe("the rate limit buckets", () => {
  // The three buckets are the three GitHub limits the application can
  // consume, and the order they are shown in.
  test("the buckets are core, graphql and search", () => {
    expect(RATE_LIMIT_BUCKETS).toEqual(["core", "graphql", "search"]);
  });

  // Every bucket the application probes has to be documented, otherwise
  // the rate-limit screen shows a row without a limit.
  test("every bucket has documentation", () => {
    for (const bucket of RATE_LIMIT_BUCKETS) {
      expect(RATE_LIMIT_DOCS[bucket]).toBeDefined();
      expect(RATE_LIMIT_DOCS[bucket].title.length).toBeGreaterThan(0);
      expect(RATE_LIMIT_DOCS[bucket].limit.length).toBeGreaterThan(0);
      expect(RATE_LIMIT_DOCS[bucket].note.length).toBeGreaterThan(0);
    }
  });

  // The documentation covers exactly the buckets, no more and no fewer.
  test("the documentation covers exactly the buckets", () => {
    expect(Object.keys(RATE_LIMIT_DOCS).sort()).toEqual([...RATE_LIMIT_BUCKETS].sort());
  });

  // The core bucket is the REST limit of 5000 requests per hour.
  test("the core bucket documents 5000 requests per hour", () => {
    expect(RATE_LIMIT_DOCS.core).toEqual({
      title: "Core (REST)",
      limit: "5,000/hr",
      note: "requests per hour, per account",
    });
  });

  // The GraphQL bucket is the same number, but the unit is points.
  test("the graphql bucket documents 5000 points per hour", () => {
    expect(RATE_LIMIT_DOCS.graphql).toEqual({
      title: "GraphQL",
      limit: "5,000/hr",
      note: "points per hour, per account",
    });
  });

  // The search bucket is the smallest one, 30 requests per minute.
  test("the search bucket documents 30 requests per minute", () => {
    expect(RATE_LIMIT_DOCS.search).toEqual({
      title: "Search",
      limit: "30/min",
      note: "requests per minute",
    });
  });

  // The bucket identifiers are the ones the rate-limit screen and the
  // probes agree on.
  test("the bucket identifiers are the documented ones", () => {
    const ids: RateLimitBucketId[] = ["core", "graphql", "search"];
    expect(RATE_LIMIT_BUCKETS).toEqual(ids);
  });
});
