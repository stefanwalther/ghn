import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { fetchRateLimits, getRateLimits, parseRateLimitHeaders } from "@/lib/rate-limits";

const ENV_KEYS = ["GHN_TOKEN", "GHN_API_BASE", "GHN_HOST", "GHN_NOW"] as const;

let saved: Partial<Record<(typeof ENV_KEYS)[number], string | undefined>> = {};

const NOW = Date.parse("2026-10-17T12:00:00Z");
const RESET = String(Math.floor(NOW / 1000) + 3600);

function headers(entries: Record<string, string>): Headers {
  const h = new Headers();
  for (const [k, v] of Object.entries(entries)) h.set(k, v);
  return h;
}

function stubFetch(): string[] {
  const urls: string[] = [];
  vi.stubGlobal("fetch", async (input: unknown) => {
    urls.push(String(input));
    return new Response("{}", {
      headers: {
        "x-ratelimit-limit": "5000",
        "x-ratelimit-used": "100",
        "x-ratelimit-remaining": "4900",
        "x-ratelimit-reset": RESET,
      },
    });
  });
  return urls;
}

beforeEach(() => {
  saved = {};
  for (const key of ENV_KEYS) saved[key] = process.env[key];
  process.env.GHN_NOW = String(NOW);
});

afterEach(() => {
  for (const key of ENV_KEYS) {
    const value = saved[key];
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
  vi.unstubAllGlobals();
});

describe("the reset header", () => {
  // Without a reset header there is no reset time to show.
  test("a missing reset header yields no reset time", () => {
    const bucket = parseRateLimitHeaders(
      headers({
        "x-ratelimit-limit": "5000",
        "x-ratelimit-used": "100",
        "x-ratelimit-remaining": "4900",
      }),
      NOW
    );
    expect(bucket?.resetsAt).toBeNull();
    expect(bucket?.resetsInSecs).toBeNull();
  });

  // A reset header that is not a number is ignored rather than turned into
  // a wrong time.
  test("an unparseable reset header yields no reset time", () => {
    const bucket = parseRateLimitHeaders(
      headers({
        "x-ratelimit-limit": "5000",
        "x-ratelimit-used": "100",
        "x-ratelimit-remaining": "4900",
        "x-ratelimit-reset": "soon",
      }),
      NOW
    );
    expect(bucket?.resetsAt).toBeNull();
    expect(bucket?.resetsInSecs).toBeNull();
  });

  // A reset in the past is not a reset time either.
  test("a reset in the past yields no reset time", () => {
    const bucket = parseRateLimitHeaders(
      headers({
        "x-ratelimit-limit": "5000",
        "x-ratelimit-used": "100",
        "x-ratelimit-remaining": "4900",
        "x-ratelimit-reset": "0",
      }),
      NOW
    );
    expect(bucket?.resetsAt).toBeNull();
    expect(bucket?.resetsInSecs).toBeNull();
  });

  // A limit of zero has no percentage to show.
  test("a limit of zero has no percentage", () => {
    const bucket = parseRateLimitHeaders(
      headers({
        "x-ratelimit-limit": "0",
        "x-ratelimit-used": "0",
        "x-ratelimit-remaining": "0",
      }),
      NOW
    );
    expect(bucket?.percent).toBe(0);
    expect(bucket?.status).toBe("rate-limited");
  });
});

describe("the probe targets", () => {
  // The configured api base is the one every probe goes to.
  test("the configured api base is the one every probe goes to", async () => {
    process.env.GHN_API_BASE = "https://api.example.test";
    const urls = stubFetch();
    await fetchRateLimits("token");
    expect(urls).toEqual([
      "https://api.example.test/user",
      "https://api.example.test/graphql",
      "https://api.example.test/search/repositories?q=rate-limits-probe&per_page=1",
    ]);
  });

  // A GitHub Enterprise Server host is reached through its versioned api
  // path.
  test("an enterprise host is reached through its versioned api path", async () => {
    delete process.env.GHN_API_BASE;
    process.env.GH_HOST = "github.acme.internal";
    const urls = stubFetch();
    await fetchRateLimits("token");
    expect(urls).toContain("https://github.acme.internal/api/v3/user");
    expect(urls).toContain("https://github.acme.internal/api/graphql");
  });

  // Without a host the public GitHub is used.
  test("without a host the public GitHub is used", async () => {
    delete process.env.GHN_API_BASE;
    delete process.env.GH_HOST;
    const urls = stubFetch();
    await fetchRateLimits("token");
    expect(urls).toContain("https://api.github.com/user");
    expect(urls).toContain("https://api.github.com/graphql");
  });

  // An empty host is the public GitHub too.
  test("an empty host is the public GitHub", async () => {
    delete process.env.GHN_API_BASE;
    process.env.GH_HOST = "   ";
    const urls = stubFetch();
    await fetchRateLimits("token");
    expect(urls).toContain("https://api.github.com/user");
  });

  // A probe that cannot reach GitHub is reported as unreachable, not as a
  // timeout.
  test("a probe that cannot reach GitHub is reported as unreachable", async () => {
    const fetchFn = (async () => {
      throw new Error("connection refused");
    }) as unknown as typeof fetch;
    const result = await fetchRateLimits("token", { fetchFn });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.reason).toBe("unreachable");
      expect(result.error.error).toContain("GitHub API unreachable");
    }
  });
});

describe("getRateLimits", () => {
  // Without a credential the rate limits cannot be read at all.
  test("without a token the rate limits are unavailable", async () => {
    process.env.GHN_TOKEN = "";
    const result = await getRateLimits();
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.reason).toBe("auth");
      expect(result.error.error).toContain("gh auth login");
    }
  });

  // With a credential the three buckets are read.
  test("with a token the three buckets are read", async () => {
    process.env.GHN_TOKEN = "secret-token";
    process.env.GHN_API_BASE = "https://api.example.test";
    stubFetch();

    const result = await getRateLimits();
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data.provider).toBe("github");
      expect(result.data.fetchedAt).toBe(new Date(NOW).toISOString());
      expect(result.data.usage.core?.used).toBe(100);
      expect(result.data.usage.graphql?.used).toBe(100);
      expect(result.data.usage.search?.used).toBe(100);
    }
  });
});
