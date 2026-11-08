import { describe, expect, test } from "vitest";
import { eq } from "drizzle-orm";
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

  // A rate-limited result stops the drain from claiming new rows, so the
  // remaining writes wait for the next drain instead of failing too.
  test("a rate-limited result leaves unclaimed rows untouched", async () => {
    const db = createMemoryDb().db;
    for (const id of ["7101", "7102", "7103"]) {
      await enqueueWriteback(db, id, "done", null, 1000);
    }

    let calls = 0;
    const drained = await drainQueue(
      db,
      async () => {
        calls += 1;
        return { ok: false as const, reason: "rate_limited" as const };
      },
      1
    );
    expect(calls).toBe(1);
    expect(drained).toEqual({ processed: 1, succeeded: 0, failed: 1, succeededItems: [] });

    const rows = await db.select().from(schema.writebackQueue);
    expect(rows).toHaveLength(3);
    expect(rows.filter((r) => r.attempts === 0)).toHaveLength(2);
  });

  // A row withdrawn mid-drain (mark-unread deletes its queue row) is not
  // reported as succeeded, so the sync heal cannot flip isDone back to 1.
  test("a row withdrawn mid-drain stays out of the success list", async () => {    const db = createMemoryDb().db;
    for (const id of ["7201", "7202"]) {
      await enqueueWriteback(db, id, "done", null, 1000);
    }

    const drained = await drainQueue(
      db,
      async (threadId) => {
        if (threadId === "7201") {
          await db
            .delete(schema.writebackQueue)
            .where(eq(schema.writebackQueue.threadId, "7201"));
        }
        return { ok: true as const };
      },
      1
    );
    expect(drained.succeededItems).toEqual([{ threadId: "7202", action: "done" }]);
    expect(drained).toMatchObject({ processed: 1, succeeded: 1, failed: 0 });
    expect(await queueDepth(db)).toBe(0);
  });

  // A row that keeps failing stops being retried after the cap, keeping its
  // last error for diagnosis instead of churning every sync.
  test("a row at the attempt cap is excluded from later drains", async () => {
    const db = createMemoryDb().db;
    await enqueueWriteback(db, "7301", "done", null, 1000);

    for (let i = 0; i < 10; i += 1) {
      await drainQueue(db, async () => ({ ok: false as const, reason: "network" as const }));
    }
    const rows = await db.select().from(schema.writebackQueue);
    expect(rows).toHaveLength(1);
    expect(rows[0]?.attempts).toBe(10);
    expect(rows[0]?.lastError).toBe("network");

    const capped = await drainQueue(db, async () => ({ ok: true as const }));
    expect(capped).toEqual({ processed: 0, succeeded: 0, failed: 0, succeededItems: [] });
    const after = await db.select().from(schema.writebackQueue);
    expect(after[0]?.attempts).toBe(10);
  });

  // Two drains failing on the same row at the same time each record their
  // attempt: the increment is SQL-side, and the drain lock serializes the
  // two passes so the second re-reads the first one's write.
  test("overlapping failing drains each record their attempt", async () => {
    const db = createMemoryDb().db;
    await enqueueWriteback(db, "7401", "done", null, 1000);

    const apply = async () => ({ ok: false as const, reason: "network" as const });
    await Promise.all([drainQueue(db, apply, 1), drainQueue(db, apply, 1)]);

    const rows = await db.select().from(schema.writebackQueue);
    expect(rows).toHaveLength(1);
    expect(rows[0]?.attempts).toBe(2);
  });
});
