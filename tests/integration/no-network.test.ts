import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, test, vi } from "vitest";
import { db } from "../support/db-client.node";
import { seedTestDataset } from "../support/fixtures";
import { startGitHubStandIn, type StandIn } from "../support/github-stand-in";
import { withEnv } from "../support/test-env";
import { buildSeedSubjects, buildSeedThreads } from "@/lib/seed-data";
import {
  contributionDays,
  mutedSubjects,
  notifications,
  repositories,
  syncState,
  writebackQueue,
} from "@/db/schema";

vi.mock("@/db/client", async () => {
  const mod = await import("../support/db-client.node");
  return { db: mod.db };
});

/**
 * The suite must never reach the network.
 *
 * Every check in this file runs with the global `fetch` replaced by one that
 * refuses anything which is not loopback. The application still has to work,
 * because the stand-in is a local server. A check that passed because the
 * real GitHub service answered would show up in the blocked list, so the
 * list is asserted explicitly rather than merely implied.
 */

const NOW = Date.parse("2026-01-15T12:00:00Z");
const TOKEN = "test-token";

const LOOPBACK = new Set(["127.0.0.1", "localhost", "::1", "[::1]"]);
const blocked: string[] = [];

const realFetch = globalThis.fetch;

function urlOf(input: RequestInfo | URL): string {
  if (typeof input === "string") return input;
  if (input instanceof URL) return input.href;
  return input.url;
}

beforeAll(() => {
  globalThis.fetch = (async (
    input: RequestInfo | URL,
    init?: RequestInit
  ): Promise<Response> => {
    const url = urlOf(input);
    let host = "";
    try {
      host = new URL(url).hostname;
    } catch {
      host = "";
    }
    if (!LOOPBACK.has(host)) {
      blocked.push(url);
      throw new Error(`network access blocked: ${url}`);
    }
    return realFetch(input, init);
  }) as typeof fetch;
});

afterAll(() => {
  globalThis.fetch = realFetch;
});

let standIn: StandIn;
let restoreEnv: (() => void) | null = null;

beforeEach(async () => {
  blocked.length = 0;
  standIn = await startGitHubStandIn({ token: TOKEN });
  standIn.setThreads(buildSeedThreads(standIn.url, NOW));
  for (const [path, payload] of buildSeedSubjects(standIn.url, NOW)) {
    standIn.setSubject(path, payload);
  }
  restoreEnv = withEnv({
    GHN_TOKEN: TOKEN,
    GHN_API_BASE: standIn.url,
    GHN_NOW: String(NOW),
  });
  await db.delete(writebackQueue);
  await db.delete(mutedSubjects);
  await db.delete(syncState);
  await db.delete(contributionDays);
  await db.delete(notifications);
  await db.delete(repositories);
  await seedTestDataset(db, NOW);
});

afterEach(async () => {
  restoreEnv?.();
  restoreEnv = null;
  await standIn.close();
});

describe("the suite cannot reach the network", () => {
  test("the guard refuses a non-loopback url", async () => {
    await expect(globalThis.fetch("https://api.github.com/user")).rejects.toThrow(
      /network access blocked/
    );
    expect(blocked).toEqual(["https://api.github.com/user"]);
  });

  test("the notifications route answers from the database alone", async () => {
    const { GET } = await import("@/app/api/notifications/route");
    const res = await GET(new Request("http://localhost/api/notifications"));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.mainFlow).toHaveLength(30);
    expect(body.collapsedSection).toHaveLength(7);
    expect(blocked).toEqual([]);
  });

  test("the repositories route answers from the database alone", async () => {
    const { GET } = await import("@/app/api/repositories/route");
    const res = await GET();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.repositories).toHaveLength(10);
    expect(blocked).toEqual([]);
  });

  test("the sync route reaches only the local stand-in", async () => {
    const { POST } = await import("@/app/api/sync/route");
    const res = await POST(
      new Request("http://localhost/api/sync", {
        method: "POST",
        body: JSON.stringify({ full: true }),
      })
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.fresh).toBe(true);
    expect(body.upserted).toBe(200);
    expect(body.discoveredRepos).toBe(10);
    expect(blocked).toEqual([]);
    const paths = standIn.requests.map((r) => r.path);
    expect(paths).toContain("/user");
    expect(paths).toContain("/notifications");
  });
});
