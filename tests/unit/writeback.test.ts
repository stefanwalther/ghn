import { describe, expect, test } from "bun:test";
import { Database } from "bun:sqlite";
import { drizzle, type BunSQLiteDatabase } from "drizzle-orm/bun-sqlite";
import * as schema from "@/db/schema";
import { ensureSchema } from "@/scripts/push";
import {
  drainQueue,
  enqueueWriteback,
  getQueuedThreadIds,
  queueDepth,
} from "@/lib/queue";

type TestDb = BunSQLiteDatabase<typeof schema>;

function makeTestDb(): TestDb {
  const sqlite = new Database(":memory:");
  ensureSchema(sqlite);
  return drizzle(sqlite, { schema });
}

function stubApi(handler: (req: Request) => Response | Promise<Response>) {
  const server = Bun.serve({
    port: 0,
    fetch: handler,
  });
  process.env.GHN_API_BASE = `http://localhost:${server.port}`;
  return () => {
    delete process.env.GHN_API_BASE;
    server.stop(true);
  };
}

describe("write-back transport mapping", () => {
  test("done issues DELETE, read issues PATCH, unsubscribe mutes plus ignores", async () => {
    const calls: { method: string; path: string; body: string | null }[] = [];
    const stop = stubApi(async (req) => {
      calls.push({ method: req.method, path: new URL(req.url).pathname, body: await req.text().catch(() => null) });
      if (req.method === "DELETE") return new Response(null, { status: 204 });
      if (req.method === "PATCH") return new Response(null, { status: 205 });
      return Response.json({ ignored: true });
    });
    try {
      const github = await import("@/lib/github");
      const token = "test-token";
      const done = await github.markThreadDone(token, "111");
      const read = await github.markThreadRead(token, "112");
      const ignored = await github.setSubscriptionIgnored(token, "113", true);
      expect(done.ok).toBe(true);
      expect(read.ok).toBe(true);
      expect(ignored.ok).toBe(true);
      expect(calls).toEqual([
        { method: "DELETE", path: "/notifications/threads/111", body: "" },
        { method: "PATCH", path: "/notifications/threads/112", body: "" },
        { method: "PUT", path: "/notifications/threads/113/subscription", body: '{"ignored":true}' },
      ]);
    } finally {
      stop();
    }
  });

  test("auth failures classify as auth, 403 with exhausted limit as rate_limited", async () => {
    const stop = stubApi((req) => {
      const path = new URL(req.url).pathname;
      if (path.endsWith("/401")) return new Response("{}", { status: 401 });
      return new Response("{}", {
        status: 403,
        headers: { "x-ratelimit-remaining": "0" },
      });
    });
    try {
      const github = await import("@/lib/github");
      const denied = await github.markThreadDone("t", "401");
      expect(denied.ok).toBe(false);
      expect(denied.reason).toBe("auth");
      const limited = await github.markThreadDone("t", "403");
      expect(limited.ok).toBe(false);
      expect(limited.reason).toBe("rate_limited");
    } finally {
      stop();
    }
  });

  test("list parses threads and follows pagination with since", async () => {
    const seen: string[] = [];
    const stop = stubApi((req) => {
      const url = new URL(req.url);
      seen.push(url.search);
      const page = url.searchParams.get("page") ?? "1";
      const headers: Record<string, string> = {
        "last-modified": "Fri, 16 Oct 2026 15:33:32 GMT",
        "x-poll-interval": "60",
      };
      if (page === "1") {
        headers.link = `<${process.env.GHN_API_BASE}/notifications?all=true&per_page=50&page=2>; rel="next"`;
        return Response.json(
          [
            {
              id: "9001",
              unread: true,
              reason: "mention",
              updated_at: "2026-10-16T15:33:32Z",
              subject: { title: "Hello", type: "Issue", url: `${process.env.GHN_API_BASE}/repos/a/b/issues/1` },
              repository: { full_name: "a/b", html_url: "https://github.com/a/b", owner: { login: "a" } },
              url: `${process.env.GHN_API_BASE}/notifications/threads/9001`,
            },
          ],
          { headers }
        );
      }
      return Response.json([], { headers });
    });
    try {
      const github = await import("@/lib/github");
      const result = await github.listNotifications("t", { since: "2026-10-15T00:00:00Z", full: false });
      expect(result.ok).toBe(true);
      expect(result.data?.threads).toHaveLength(1);
      expect(result.data?.threads[0]?.reason).toBe("mention");
      expect(result.data?.threads[0]?.unread).toBe(true);
      expect(seen[0]).toContain("since=");
      expect(result.data?.lastModified).toBe("Fri, 16 Oct 2026 15:33:32 GMT");
    } finally {
      stop();
    }
  });
});

describe("write-back queue", () => {
  test("enqueue, depth, queued ids, and FIFO drain with retry accounting", async () => {
    const db = makeTestDb();
    expect(await queueDepth(db)).toBe(0);
    await enqueueWriteback(db, "5001", "done", "network", 1000);
    await enqueueWriteback(db, "5002", "read", null, 1001);
    expect(await queueDepth(db)).toBe(2);
    expect(await getQueuedThreadIds(db)).toEqual(new Set(["5001", "5002"]));

    const applied: string[] = [];
    const drained = await drainQueue(db, async (threadId, action) => {
      applied.push(`${action}:${threadId}`);
      if (threadId === "5002") return { ok: false as const, reason: "network" as const };
      return { ok: true as const };
    });
    expect(applied).toEqual(["done:5001", "read:5002"]);
    expect(drained).toEqual({ processed: 2, succeeded: 1, failed: 1 });
    expect(await queueDepth(db)).toBe(1);
    const remaining = await db.select().from(schema.writebackQueue);
    expect(remaining[0]?.threadId).toBe("5002");
    expect(remaining[0]?.attempts).toBe(1);
    expect(remaining[0]?.lastError).toBe("network");
    expect(await getQueuedThreadIds(db)).toEqual(new Set(["5002"]));
  });
});
