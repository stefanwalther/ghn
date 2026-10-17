import { describe, expect, test } from "bun:test";
import { fetchRateLimits, parseRateLimitHeaders } from "@/lib/rate-limits";

function headers(entries: Record<string, string>): Headers {
  const h = new Headers();
  for (const [k, v] of Object.entries(entries)) h.set(k, v);
  return h;
}

describe("parseRateLimitHeaders", () => {
  test("parses limit used remaining reset", () => {
    const now = Date.parse("2026-10-17T12:00:00Z");
    const bucket = parseRateLimitHeaders(
      headers({
        "x-ratelimit-limit": "5000",
        "x-ratelimit-used": "125",
        "x-ratelimit-remaining": "4875",
        "x-ratelimit-reset": String(Math.floor(now / 1000) + 600),
      }),
      now
    );
    expect(bucket).toEqual({
      used: 125,
      limit: 5000,
      remaining: 4875,
      percent: 2.5,
      resetsAt: new Date(now + 600_000).toISOString(),
      resetsInSecs: 600,
      status: "ok",
    });
  });

  test("marks zero remaining as rate-limited", () => {
    const bucket = parseRateLimitHeaders(
      headers({
        "x-ratelimit-limit": "30",
        "x-ratelimit-used": "30",
        "x-ratelimit-remaining": "0",
        "x-ratelimit-reset": "1790000000",
      })
    );
    expect(bucket?.status).toBe("rate-limited");
    expect(bucket?.percent).toBe(100);
  });

  test("returns null without headers", () => {
    expect(parseRateLimitHeaders(headers({}))).toBeNull();
  });
});

describe("fetchRateLimits", () => {
  test("collects three buckets from header fixtures", async () => {
    const now = Date.parse("2026-10-17T12:00:00Z");
    const reset = String(Math.floor(now / 1000) + 3600);
    const buckets: Record<string, Record<string, string>> = {
      "/user": {
        "x-ratelimit-limit": "5000",
        "x-ratelimit-used": "100",
        "x-ratelimit-remaining": "4900",
        "x-ratelimit-reset": reset,
      },
      "/graphql": {
        "x-ratelimit-limit": "5000",
        "x-ratelimit-used": "10",
        "x-ratelimit-remaining": "4990",
        "x-ratelimit-reset": reset,
      },
      "/search/repositories": {
        "x-ratelimit-limit": "30",
        "x-ratelimit-used": "3",
        "x-ratelimit-remaining": "27",
        "x-ratelimit-reset": reset,
      },
    };
    const fetchFn = (async (url: string | URL | Request) => {
      const u = String(url);
      const key = Object.keys(buckets).find((k) => u.includes(k)) ?? "/user";
      return new Response("{}", { headers: buckets[key] });
    }) as unknown as typeof fetch;
    const result = await fetchRateLimits("token", {
      restBase: "https://api.example.com",
      graphqlUrl: "https://api.example.com/graphql",
      fetchFn,
      nowMs: now,
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data.usage.core?.used).toBe(100);
      expect(result.data.usage.graphql?.used).toBe(10);
      expect(result.data.usage.search?.used).toBe(3);
    }
  });

  test("401 becomes auth error", async () => {
    const fetchFn = (async () =>
      new Response("{}", { status: 401 })) as unknown as typeof fetch;
    const result = await fetchRateLimits("bad", { fetchFn });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.reason).toBe("auth");
  });

  test("403 with remaining keeps numbers and warns", async () => {
    const now = Date.parse("2026-10-17T12:00:00Z");
    const reset = String(Math.floor(now / 1000) + 3600);
    const ok = (used: string, remaining: string) => ({
      "x-ratelimit-limit": "5000",
      "x-ratelimit-used": used,
      "x-ratelimit-remaining": remaining,
      "x-ratelimit-reset": reset,
    });
    const fetchFn = (async (url: string | URL | Request) => {
      const u = String(url);
      if (u.includes("/graphql")) return new Response("{}", { status: 403, headers: ok("10", "4990") });
      return new Response("{}", { headers: ok("100", "4900") });
    }) as unknown as typeof fetch;
    const result = await fetchRateLimits("token", {
      restBase: "https://api.example.com",
      graphqlUrl: "https://api.example.com/graphql",
      fetchFn,
      nowMs: now,
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data.usage.graphql?.remaining).toBe(4990);
      expect(result.data.warnings?.graphql).toContain("403");
    }
  });

  test("partial failure keeps good buckets with a per-bucket notice", async () => {
    const now = Date.parse("2026-10-17T12:00:00Z");
    const reset = String(Math.floor(now / 1000) + 3600);
    const fetchFn = (async (url: string | URL | Request) => {
      const u = String(url);
      if (u.includes("/search/repositories")) return new Response("{}", { status: 200 });
      return new Response(
        "{}",
        {
          headers: {
            "x-ratelimit-limit": "5000",
            "x-ratelimit-used": "100",
            "x-ratelimit-remaining": "4900",
            "x-ratelimit-reset": reset,
          },
        }
      );
    }) as unknown as typeof fetch;
    const result = await fetchRateLimits("token", {
      restBase: "https://api.example.com",
      graphqlUrl: "https://api.example.com/graphql",
      fetchFn,
      nowMs: now,
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data.usage.core?.used).toBe(100);
      expect(result.data.usage.search).toBeUndefined();
      expect(result.data.warnings?.search).toBeDefined();
    }
  });

  test("all buckets failing is unreachable", async () => {
    const fetchFn = (async () => new Response("{}", { status: 500 })) as unknown as typeof fetch;
    const result = await fetchRateLimits("bad", { fetchFn });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.reason).toBe("unreachable");
  });

  test("hung probes time out instead of hanging", async () => {
    const fetchFn = ((_url: unknown, init?: { signal?: AbortSignal }) =>
      new Promise((_resolve, reject) => {
        init?.signal?.addEventListener("abort", () =>
          reject(new DOMException("aborted", "AbortError"))
        );
      })) as unknown as typeof fetch;
    const result = await fetchRateLimits("token", { fetchFn, timeoutMs: 20 });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.reason).toBe("unreachable");
      expect(result.error.error).toContain("timed out");
    }
  });
});
