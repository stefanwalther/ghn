import { describe, expect, test, beforeEach, afterEach } from "vitest";
import { inArray } from "drizzle-orm";
import { db } from "../support/db-client.node";
import { serve } from "../support/http-stub";
import { notifications, repositories, writebackQueue } from "@/db/schema";
import {
  chunkIds,
  drainWritebacks,
  enqueueWritebacks,
  QUEUE_CHUNK_SIZE,
} from "@/lib/queue";

const NOW = Date.parse("2026-01-15T12:00:00Z");

async function queueFor(ids: string[]) {
  const rows = await db
    .select()
    .from(writebackQueue)
    .where(inArray(writebackQueue.threadId, ids));
  return rows;
}

beforeEach(async () => {
  await db.delete(writebackQueue);
  await db.delete(notifications);
  await db.delete(repositories);
});

describe("chunkIds", () => {
  test("splits large lists at the chunk size", () => {
    const ids = Array.from({ length: QUEUE_CHUNK_SIZE + 50 }, (_, i) => `t_${i}`);
    const chunks = chunkIds(ids);
    expect(chunks).toHaveLength(2);
    expect(chunks[0]).toHaveLength(QUEUE_CHUNK_SIZE);
    expect(chunks[1]).toHaveLength(50);
  });

  test("leaves small lists whole", () => {
    expect(chunkIds(["a", "b"])).toEqual([["a", "b"]]);
    expect(chunkIds([])).toEqual([]);
  });
});

describe("enqueueWritebacks", () => {
  test("inserts one row per id across chunk boundaries", async () => {
    const ids = Array.from({ length: QUEUE_CHUNK_SIZE + 30 }, (_, i) => `bulk_${i}`);
    await enqueueWritebacks(db, ids, "done", null, NOW);

    const rows = await queueFor(ids);
    expect(rows).toHaveLength(ids.length);
    expect(rows.every((r) => r.action === "done")).toBe(true);
    expect(rows.every((r) => r.attempts === 0)).toBe(true);
    expect(rows.every((r) => r.createdAt === NOW)).toBe(true);
  });

  test("replaces superseded retries instead of duplicating them", async () => {
    await enqueueWritebacks(db, ["n_001", "n_002"], "done", "network", NOW);
    await enqueueWritebacks(db, ["n_001", "n_002"], "done", null, NOW);

    const rows = await queueFor(["n_001", "n_002"]);
    expect(rows).toHaveLength(2);
    expect(rows.every((r) => r.lastError === null)).toBe(true);
  });

  test("an empty list writes nothing", async () => {
    await enqueueWritebacks(db, [], "read", null, NOW);
    expect(await db.select().from(writebackQueue)).toHaveLength(0);
  });
});

describe("drainWritebacks", () => {
  let stopApi: (() => Promise<void>) | null = null;
  const deletedThreads: string[] = [];
  const requested: string[] = [];
  let gate: Promise<void> | null = null;

  beforeEach(async () => {
    const server = await serve(async (req) => {
      const url = new URL(req.url);
      if (req.method === "DELETE" && url.pathname.startsWith("/notifications/threads/")) {
        const id = url.pathname.split("/").pop() ?? "";
        if (id === "w_003") return new Response("boom", { status: 500 });
        requested.push(id);
        if (gate) await gate;
        deletedThreads.push(id);
        return new Response(null, { status: 204 });
      }
      return new Response("unexpected call", { status: 500 });
    });
    process.env.GHN_API_BASE = server.url;
    stopApi = async () => {
      delete process.env.GHN_API_BASE;
      await server.stop(true);
      stopApi = null;
    };
  });

  afterEach(async () => {
    await stopApi?.();
    deletedThreads.length = 0;
    requested.length = 0;
    gate = null;
  });

  async function waitForRequest(id: string): Promise<void> {
    const deadline = Date.now() + 5_000;
    for (;;) {
      if (requested.includes(id)) return;
      if (Date.now() > deadline) throw new Error(`timed out waiting for ${id}`);
      await new Promise((r) => setTimeout(r, 25));
    }
  }

  test("skips ids withdrawn by mark-unread before their call", async () => {
    await enqueueWritebacks(db, ["w_001", "w_002"], "done", null, NOW);
    // A mark-unread withdraws the row; the drain must not fire for it.
    await db
      .delete(writebackQueue)
      .where(inArray(writebackQueue.threadId, ["w_002"]));

    const result = await drainWritebacks(db, "test-token", ["w_001", "w_002"], "done", 1);

    expect(result).toEqual({ succeeded: 1, failed: 0, skipped: 1 });
    expect(deletedThreads).toEqual(["w_001"]);
    expect(await db.select().from(writebackQueue)).toHaveLength(0);
  });

  test("a replacement row arriving mid-flight survives the drain", async () => {
    await enqueueWritebacks(db, ["m_001"], "done", null, NOW);
    let release!: () => void;
    gate = new Promise<void>((r) => {
      release = r;
    });
    const draining = drainWritebacks(db, "test-token", ["m_001"], "done", 1);
    await waitForRequest("m_001");
    // A second large request replaces the row while the call is in flight.
    await enqueueWritebacks(db, ["m_001"], "done", null, NOW);
    release();
    await draining;

    expect(deletedThreads).toEqual(["m_001"]);
    const rows = await queueFor(["m_001"]);
    expect(rows).toHaveLength(1);
  });

  test("leaves failures queued for the sync retry", async () => {
    await enqueueWritebacks(db, ["w_003"], "done", null, NOW);
    const result = await drainWritebacks(db, "bad-token", ["w_003"], "done", 1);

    expect(result.succeeded).toBe(0);
    expect(result.failed).toBe(1);
    const rows = await queueFor(["w_003"]);
    expect(rows).toHaveLength(1);
    expect(rows[0]?.attempts).toBe(1);
  });
});
