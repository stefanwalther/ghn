import { beforeAll, beforeEach, afterAll, describe, expect, test, vi } from "vitest";
import { db } from "../support/db-client.node";
import { withEnv } from "../support/test-env";
import {
  startGitHubStandIn,
  type StandIn,
} from "../support/github-stand-in";
import { contributionDays, syncState } from "@/db/schema";

vi.mock("@/db/client", async () => {
  const mod = await import("../support/db-client.node");
  return { db: mod.db };
});

/**
 * `GET /api/contributions?days=N` against the GitHub stand-in.
 *
 * The clock is pinned to 2026-01-15, so `?days=7` covers Jan 9 through
 * Jan 15. The stand-in answers every range query with a single day —
 * the `from` date at 7 contributions — so the first entry comes back
 * populated and the rest fall back to 0.
 */

const NOW = Date.parse("2026-01-15T12:00:00Z");
const TOKEN = "test-token";

interface RangeDay {
  date: string;
  count: number;
}

interface RangeResponse {
  days?: RangeDay[];
  date?: string;
  count?: number;
  cached?: boolean;
  partial?: boolean;
  login?: string | null;
  error?: string;
}

async function load(query: string): Promise<{ status: number; body: RangeResponse }> {
  const { GET } = await import("@/app/api/contributions/route");
  const res = await GET(new Request(`http://localhost/api/contributions${query}`));
  return { status: res.status, body: (await res.json()) as RangeResponse };
}

let standIn: StandIn;
let restoreEnv: (() => void) | null = null;

beforeAll(async () => {
  standIn = await startGitHubStandIn({ token: TOKEN });
});

afterAll(async () => {
  await standIn.close();
});

beforeEach(async () => {
  restoreEnv?.();
  restoreEnv = withEnv({
    GHN_TOKEN: TOKEN,
    GHN_LOGIN: undefined,
    GHN_API_BASE: standIn.url,
    GHN_NOW: String(NOW),
  });
  await db.delete(contributionDays);
  await db.delete(syncState);
});

describe("GET /api/contributions?days=N", () => {
  test("rejects out-of-range values with 400", async () => {
    for (const query of ["?days=abc", "?days=1", "?days=367"]) {
      const { status, body } = await load(query);
      expect(status).toBe(400);
      expect(body.error).toContain("`days`");
    }
  });

  test("fetches the range once and persists the returned days", async () => {
    const { status, body } = await load("?days=7");
    expect(status).toBe(200);
    expect(body.login).toBe("test-user");
    expect(body.cached).toBe(false);
    expect(body.days).toHaveLength(7);
    expect(body.days?.[0]).toEqual({ date: "2026-01-09", count: 7 });
    expect(body.days?.slice(1).map((d) => d.count)).toEqual([0, 0, 0, 0, 0, 0]);

    const rows = await db.select().from(contributionDays);
    expect(rows.map((r) => [r.date, r.count])).toEqual([["2026-01-09", 7]]);
  });

  test("serves a fully cached range without calling GitHub", async () => {
    const dates = ["2026-01-09", "2026-01-10", "2026-01-11", "2026-01-12", "2026-01-13", "2026-01-14", "2026-01-15"];
    for (const [i, date] of dates.entries()) {
      await db.insert(contributionDays).values({ date, count: i + 1, fetchedAt: NOW });
    }
    // Point at a closed port: any fetch attempt fails the check.
    restoreEnv?.();
    restoreEnv = withEnv({
      GHN_TOKEN: TOKEN,
      GHN_LOGIN: undefined,
      GHN_API_BASE: "http://127.0.0.1:1",
      GHN_NOW: String(NOW),
    });
    const { status, body } = await load("?days=7");
    expect(status).toBe(200);
    expect(body.cached).toBe(true);
    expect(body.days?.map((d) => d.count)).toEqual([1, 2, 3, 4, 5, 6, 7]);
  });

  test("without credentials serves 503, or the cached subset as partial", async () => {
    restoreEnv?.();
    restoreEnv = withEnv({
      GHN_TOKEN: "",
      GHN_LOGIN: undefined,
      GHN_API_BASE: standIn.url,
      GHN_NOW: String(NOW),
    });
    const empty = await load("?days=7");
    expect(empty.status).toBe(503);

    await db.insert(contributionDays).values({ date: "2026-01-10", count: 5, fetchedAt: NOW });
    const partial = await load("?days=7");
    expect(partial.status).toBe(200);
    expect(partial.body.partial).toBe(true);
    expect(partial.body.login).toBeNull();
    expect(partial.body.days).toEqual([{ date: "2026-01-10", count: 5 }]);
  });
});
