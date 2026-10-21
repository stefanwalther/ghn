import { apiBases, getStoredToken } from "@/lib/github";
import { nowMs as currentTime } from "@/lib/clock";
import {
  RATE_LIMIT_BUCKETS,
  type RateLimitBucketId,
} from "@/lib/rate-limit-meta";

export { RATE_LIMIT_BUCKETS, RATE_LIMIT_DOCS } from "@/lib/rate-limit-meta";
export type { RateLimitBucketId } from "@/lib/rate-limit-meta";

export interface RateLimitBucket {
  used: number;
  limit: number;
  remaining: number;
  percent: number;
  resetsAt: string | null;
  resetsInSecs: number | null;
  status: "ok" | "rate-limited";
}

export interface RateLimitsResult {
  provider: "github";
  fetchedAt: string;
  usage: Partial<Record<RateLimitBucketId, RateLimitBucket>>;
  warnings?: Partial<Record<RateLimitBucketId, string>>;
}

export interface RateLimitsError {
  error: string;
  reason: "auth" | "network" | "unreachable";
}

const PROBE_TIMEOUT_MS = 10_000;

function toIsoFromReset(reset: string | null): string | null {
  if (!reset) return null;
  const secs = Number.parseInt(reset, 10);
  if (Number.isNaN(secs) || secs <= 0) return null;
  return new Date(secs * 1000).toISOString();
}

function resetsInSecsFromReset(reset: string | null, nowMs: number): number | null {
  if (!reset) return null;
  const secs = Number.parseInt(reset, 10);
  if (Number.isNaN(secs) || secs <= 0) return null;
  return Math.max(0, Math.round(secs - nowMs / 1000));
}

export function parseRateLimitHeaders(
  headers: Headers,
  nowMs: number = currentTime()
): RateLimitBucket | null {
  const get = (name: string): string | null => headers.get(name) ?? headers.get(name.toLowerCase());
  const limit = Number.parseInt(get("x-ratelimit-limit") ?? "", 10);
  const used = Number.parseInt(get("x-ratelimit-used") ?? "", 10);
  const remaining = Number.parseInt(get("x-ratelimit-remaining") ?? "", 10);
  if (Number.isNaN(limit) || Number.isNaN(used) || Number.isNaN(remaining)) return null;
  const reset = get("x-ratelimit-reset");
  return {
    used,
    limit,
    remaining,
    percent: limit > 0 ? Math.round((used / limit) * 1000) / 10 : 0,
    resetsAt: toIsoFromReset(reset),
    resetsInSecs: resetsInSecsFromReset(reset, nowMs),
    status: remaining === 0 ? "rate-limited" : "ok",
  };
}

interface ProbeDef {
  url: string;
  method: string;
  body?: string;
}

function probesFor(restBase: string, graphqlUrl: string): Record<RateLimitBucketId, ProbeDef> {
  return {
    core: { url: `${restBase}/user`, method: "GET" },
    graphql: { url: graphqlUrl, method: "POST", body: JSON.stringify({ query: "{ viewer { login } }" }) },
    search: { url: `${restBase}/search/repositories?q=rate-limits-probe&per_page=1`, method: "GET" },
  };
}

export async function fetchRateLimits(
  token: string,
  opts: {
    restBase?: string;
    graphqlUrl?: string;
    fetchFn?: typeof fetch;
    nowMs?: number;
    timeoutMs?: number;
  } = {}
): Promise<{ ok: true; data: RateLimitsResult } | { ok: false; error: RateLimitsError }> {
  const defaults = apiBases();
  const restBase = opts.restBase ?? defaults.restBase;
  const graphqlUrl = opts.graphqlUrl ?? defaults.graphqlUrl;
  const fetchFn = opts.fetchFn ?? fetch;
  const nowMs = opts.nowMs ?? currentTime();
  const timeoutMs = opts.timeoutMs ?? PROBE_TIMEOUT_MS;
  const probes = probesFor(restBase, graphqlUrl);
  const usage: Partial<Record<RateLimitBucketId, RateLimitBucket>> = {};
  const warnings: Partial<Record<RateLimitBucketId, string>> = {};

  for (const bucket of RATE_LIMIT_BUCKETS) {
    const probe = probes[bucket];
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    let res: Response;
    try {
      res = await fetchFn(probe.url, {
        method: probe.method,
        signal: controller.signal,
        headers: {
          Accept: "application/vnd.github+json",
          Authorization: `Bearer ${token}`,
          "X-GitHub-Api-Version": "2022-11-28",
          ...(probe.body ? { "Content-Type": "application/json" } : {}),
        },
        ...(probe.body ? { body: probe.body } : {}),
      });
    } catch {
      warnings[bucket] = controller.signal.aborted
        ? `probe timed out after ${timeoutMs / 1000}s`
        : "GitHub API unreachable";
      continue;
    } finally {
      clearTimeout(timer);
    }
    if (res.status === 401) {
      return {
        ok: false,
        error: {
          error: "GitHub auth rejected (HTTP 401). Check GH_TOKEN or run `gh auth login` to refresh.",
          reason: "auth",
        },
      };
    }
    // Drain the body so the connection can be reused; headers carry the data.
    try {
      await res.text();
    } catch {
      // ignore body read errors; headers may still be usable
    }
    const parsed = parseRateLimitHeaders(res.headers, nowMs);
    if (!parsed) {
      warnings[bucket] = `no rate-limit headers on HTTP ${res.status}`;
      continue;
    }
    if ((res.status === 403 || res.status === 429) && parsed.remaining !== 0) {
      warnings[bucket] = `probe returned HTTP ${res.status}`;
    }
    usage[bucket] = parsed;
  }

  if (Object.keys(usage).length === 0) {
    const detail = RATE_LIMIT_BUCKETS.map((b) => `${b}: ${warnings[b] ?? "failed"}`).join("; ");
    return { ok: false, error: { error: `GitHub API probes failed: ${detail}`, reason: "unreachable" } };
  }

  const result: RateLimitsResult = {
    provider: "github",
    fetchedAt: new Date(nowMs).toISOString(),
    usage,
  };
  if (Object.keys(warnings).length > 0) result.warnings = warnings;
  return { ok: true, data: result };
}

export async function getRateLimits(): Promise<
  { ok: true; data: RateLimitsResult } | { ok: false; error: RateLimitsError }
> {
  const token = await getStoredToken();
  if (!token) {
    return {
      ok: false,
      error: {
        error: "GitHub auth unavailable (set GH_TOKEN or run `gh auth login` on the server).",
        reason: "auth",
      },
    };
  }
  return fetchRateLimits(token);
}
