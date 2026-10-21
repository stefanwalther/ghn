import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, test, vi } from "vitest";
import { eq } from "drizzle-orm";
import { db } from "../support/db-client.node";
import { seedTestDataset } from "../support/fixtures";
import { startGitHubStandIn, type StandIn } from "../support/github-stand-in";
import { withEnv } from "../support/test-env";
import { contributionDays, notifications, repositories, syncState } from "@/db/schema";
import { writeSyncState } from "@/lib/sync";

vi.mock("@/db/client", async () => {
  const mod = await import("../support/db-client.node");
  return { db: mod.db };
});

/**
 * The three status routes: the connection, the contributions and the rate
 * limits.
 *
 * They are the routes that talk to GitHub without touching the inbox, and
 * each of them has to report a connected, an unauthorized and an unreachable
 * GitHub differently.
 */

const NOW = Date.parse("2026-01-15T12:00:00Z");
const TOKEN = "test-token";
const DEAD_BASE = "http://127.0.0.1:1";

let standIn: StandIn;
let restoreEnv: (() => void) | null = null;

async function connection(): Promise<{ status: number; body: Record<string, unknown> }> {
  const { GET } = await import("@/app/api/connection/route");
  const res = await GET();
  return { status: res.status, body: (await res.json()) as Record<string, unknown> };
}

async function contributions(query = ""): Promise<{
  status: number;
  body: Record<string, unknown>;
}> {
  const { GET } = await import("@/app/api/contributions/route");
  const res = await GET(new Request(`http://localhost/api/contributions${query}`));
  return { status: res.status, body: (await res.json()) as Record<string, unknown> };
}

async function rateLimits(): Promise<{ status: number; body: Record<string, unknown> }> {
  const { GET } = await import("@/app/api/rate-limits/route");
  const res = await GET();
  return { status: res.status, body: (await res.json()) as Record<string, unknown> };
}

function useEnv(vars: Record<string, string | undefined>): void {
  restoreEnv?.();
  restoreEnv = withEnv(vars);
}

beforeAll(async () => {
  standIn = await startGitHubStandIn({ token: TOKEN });
});

afterAll(async () => {
  await standIn.close();
});

beforeEach(async () => {
  standIn.reset();
  useEnv({
    GHN_TOKEN: TOKEN,
    GHN_API_BASE: standIn.url,
    GHN_NOW: String(NOW),
    GHN_LOGIN: undefined,
  });
  await db.delete(contributionDays);
  await db.delete(syncState);
  await db.delete(notifications);
  await db.delete(repositories);
  await seedTestDataset(db, NOW);
});

afterEach(() => {
  restoreEnv?.();
  restoreEnv = null;
});

describe("GET /api/connection", () => {
  test("a working credential reports the viewer", async () => {
    const { status, body } = await connection();
    expect(status).toBe(200);
    expect(body).toEqual({
      connected: true,
      viewerLogin: "test-user",
      lastSyncAt: null,
    });
  });

  test("it reports the last sync when there was one", async () => {
    await writeSyncState(db, "lastSyncAt", String(NOW));
    const { body } = await connection();
    expect(body.lastSyncAt).toBe(NOW);
  });

  test("without a credential the connection is not established", async () => {
    useEnv({
      GHN_TOKEN: "",
      GHN_API_BASE: standIn.url,
      GHN_NOW: String(NOW),
      GHN_LOGIN: undefined,
    });
    const { status, body } = await connection();
    expect(status).toBe(200);
    expect(body).toMatchObject({
      connected: false,
      reason: "auth",
      lastSyncAt: null,
    });
    expect(body.hint).toContain("gh auth login");
    expect(standIn.requests).toHaveLength(0);
  });

  test("a rejected credential is reported as an auth failure", async () => {
    standIn.setScenario("/user", { status: 401 });
    const { body } = await connection();
    expect(body).toMatchObject({ connected: false, reason: "auth" });
  });

  test("an unreachable GitHub is reported as a network failure", async () => {
    useEnv({
      GHN_TOKEN: TOKEN,
      GHN_API_BASE: DEAD_BASE,
      GHN_NOW: String(NOW),
      GHN_LOGIN: undefined,
    });
    const { body } = await connection();
    expect(body).toMatchObject({ connected: false, reason: "network" });
  });
});

describe("GET /api/contributions", () => {
  test("the count comes from the stand-in", async () => {
    const { status, body } = await contributions("?date=2026-01-14");
    expect(status).toBe(200);
    expect(body).toEqual({
      date: "2026-01-14",
      count: 7,
      cached: false,
      login: "test-user",
    });
  });

  test("the count is stored and served from the cache afterwards", async () => {
    await contributions("?date=2026-01-14");
    const rows = await db
      .select()
      .from(contributionDays)
      .where(eq(contributionDays.date, "2026-01-14"));
    expect(rows[0]?.count).toBe(7);
    expect(rows[0]?.fetchedAt).toBe(NOW);

    const { body } = await contributions("?date=2026-01-14");
    expect(body).toMatchObject({ count: 7, cached: true });
  });

  test("the default date is today", async () => {
    const { body } = await contributions();
    expect(body.date).toBe("2026-01-15");
    expect(body.count).toBe(7);
  });

  test("an invalid date is refused", async () => {
    const { status, body } = await contributions("?date=15-01-2026");
    expect(status).toBe(400);
    expect(body.error).toBe("`date` must be YYYY-MM-DD");
  });

  test("the login can be set from the environment", async () => {
    useEnv({
      GHN_TOKEN: TOKEN,
      GHN_API_BASE: standIn.url,
      GHN_NOW: String(NOW),
      GHN_LOGIN: "someone-else",
    });
    const { body } = await contributions("?date=2026-01-14");
    expect(body.login).toBe("someone-else");
  });

  test("without a credential the contributions are not available", async () => {
    useEnv({
      GHN_TOKEN: "",
      GHN_API_BASE: standIn.url,
      GHN_NOW: String(NOW),
      GHN_LOGIN: undefined,
    });
    const { status, body } = await contributions("?date=2026-01-14");
    expect(status).toBe(503);
    expect(body.error).toBe("github auth unavailable");
  });

  test("an unreachable GitHub is reported as unreachable", async () => {
    await writeSyncState(db, "viewerLogin", "test-user");
    useEnv({
      GHN_TOKEN: TOKEN,
      GHN_API_BASE: DEAD_BASE,
      GHN_NOW: String(NOW),
      GHN_LOGIN: undefined,
    });
    const { status, body } = await contributions("?date=2026-01-14");
    expect(status).toBe(503);
    expect(body.error).toBe("github unreachable");
  });

  test("a cached count survives an unreachable GitHub", async () => {
    await contributions("?date=2026-01-14");
    useEnv({
      GHN_TOKEN: TOKEN,
      GHN_API_BASE: DEAD_BASE,
      GHN_NOW: String(NOW),
      GHN_LOGIN: undefined,
    });
    const { status, body } = await contributions("?date=2026-01-14");
    expect(status).toBe(200);
    expect(body).toMatchObject({ count: 7, cached: true });
  });
});

describe("GET /api/rate-limits", () => {
  test("the buckets are read from the stand-in headers", async () => {
    const { status, body } = await rateLimits();
    expect(status).toBe(200);
    expect(body.provider).toBe("github");
    expect(body.fetchedAt).toBe("2026-01-15T12:00:00.000Z");
    const usage = body.usage as Record<
      string,
      {
        used: number;
        limit: number;
        remaining: number;
        percent: number;
        status: string;
        resetsAt: string | null;
      }
    >;
    expect(Object.keys(usage).sort()).toEqual(["core", "graphql", "search"]);
    expect(usage.core).toEqual({
      used: 1234,
      limit: 5000,
      remaining: 3766,
      percent: 24.7,
      resetsAt: null,
      resetsInSecs: null,
      status: "ok",
    });
    expect(usage.graphql?.used).toBe(1234);
    expect(usage.search?.used).toBe(1234);
  });

  test("every bucket is probed exactly once", async () => {
    await rateLimits();
    const paths = standIn.requests.map((r) => `${r.method} ${r.path}`);
    expect(paths).toEqual([
      "GET /user",
      "POST /graphql",
      "GET /search/repositories",
    ]);
  });

  test("an exhausted bucket is reported as rate limited", async () => {
    standIn.setRateLimit(60, 60, 0, 1_800_000_000);
    const { body } = await rateLimits();
    const usage = body.usage as Record<
      string,
      {
        percent: number;
        status: string;
        resetsAt: string | null;
        resetsInSecs: number | null;
      }
    >;
    expect(usage.core?.percent).toBe(100);
    expect(usage.core?.status).toBe("rate-limited");
    expect(usage.core?.resetsAt).toBe(new Date(1_800_000_000 * 1000).toISOString());
    expect(usage.core?.resetsInSecs).toBe(1_800_000_000 - NOW / 1000);
  });

  test("without a credential the rate limits are refused", async () => {
    useEnv({
      GHN_TOKEN: "",
      GHN_API_BASE: standIn.url,
      GHN_NOW: String(NOW),
      GHN_LOGIN: undefined,
    });
    const { status, body } = await rateLimits();
    expect(status).toBe(401);
    expect(body.reason).toBe("auth");
    expect(body.provider).toBe("github");
    expect(standIn.requests).toHaveLength(0);
  });

  test("an unreachable GitHub is reported as unreachable", async () => {
    useEnv({
      GHN_TOKEN: TOKEN,
      GHN_API_BASE: DEAD_BASE,
      GHN_NOW: String(NOW),
      GHN_LOGIN: undefined,
    });
    const { status, body } = await rateLimits();
    expect(status).toBe(502);
    expect(body.reason).toBe("unreachable");
    expect(body.provider).toBe("github");
  });
});
