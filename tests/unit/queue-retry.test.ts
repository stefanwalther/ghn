import { describe, expect, test } from "vitest";
import { createMemoryDb } from "../support/db-client.node";
import * as schema from "@/db/schema";
import { drainQueue, enqueueWriteback, queueDepth } from "@/lib/queue";

describe("the write-back queue", () => {
  // A failed write without a reason still records something, so the next
  // attempt is not silently unexplained.
  test("a failed write without a reason records an unknown error", async () => {
    const db = createMemoryDb().db;
    await enqueueWriteback(db, "7001", "done", null, 1000);

    const drained = await drainQueue(db, async () => ({ ok: false as const }));
    expect(drained).toEqual({ processed: 1, succeeded: 0, failed: 1, succeededItems: [] });

    const rows = await db.select().from(schema.writebackQueue);
    expect(rows[0]?.attempts).toBe(1);
    expect(rows[0]?.lastError).toBe("unknown");
  });

  // A failed write stays in the queue, because it still has to reach
  // GitHub.
  test("a failed write keeps its row in the queue", async () => {
    const db = createMemoryDb().db;
    await enqueueWriteback(db, "7002", "read", null, 1000);

    await drainQueue(db, async () => ({ ok: false as const, reason: "network" as const }));
    expect(await queueDepth(db)).toBe(1);

    const rows = await db.select().from(schema.writebackQueue);
    expect(rows[0]?.lastError).toBe("network");
  });

  // A successful write leaves nothing behind.
  test("a successful write removes its row from the queue", async () => {
    const db = createMemoryDb().db;
    await enqueueWriteback(db, "7003", "unsubscribe", null, 1000);

    const drained = await drainQueue(db, async () => ({ ok: true as const }));
    expect(drained).toEqual({
      processed: 1,
      succeeded: 1,
      failed: 0,
      succeededItems: [{ threadId: "7003", action: "unsubscribe" }],
    });
    expect(await queueDepth(db)).toBe(0);
  });

  // An empty queue drains to nothing.
  test("an empty queue drains to nothing", async () => {
    const db = createMemoryDb().db;
    const drained = await drainQueue(db, async () => ({ ok: true as const }));
    expect(drained).toEqual({ processed: 0, succeeded: 0, failed: 0, succeededItems: [] });
  });
});
