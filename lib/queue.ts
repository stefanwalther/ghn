import { asc, eq } from "drizzle-orm";
import { writebackQueue } from "@/db/schema";
import type { Db } from "@/db/client";
import type { GhResult } from "@/lib/github";

export type WritebackAction = "done" | "read" | "unsubscribe";

export async function enqueueWriteback(
  db: Db,
  threadId: string,
  action: WritebackAction,
  lastError: string | null,
  now: number
): Promise<void> {
  await db.insert(writebackQueue).values({
    threadId,
    action,
    attempts: 0,
    lastError,
    createdAt: now,
  });
}

export async function getQueuedThreadIds(db: Db): Promise<Set<string>> {
  const rows = await db.select({ threadId: writebackQueue.threadId }).from(writebackQueue);
  return new Set(rows.map((r) => r.threadId));
}

export async function queueDepth(db: Db): Promise<number> {
  const rows = await db.select({ id: writebackQueue.id }).from(writebackQueue);
  return rows.length;
}

export interface DrainResult {
  processed: number;
  succeeded: number;
  failed: number;
  succeededItems: { threadId: string; action: WritebackAction }[];
}

export async function drainQueue(
  db: Db,
  apply: (threadId: string, action: WritebackAction) => Promise<GhResult<void>>,
  concurrency = 8
): Promise<DrainResult> {
  const rows = await db.select().from(writebackQueue).orderBy(asc(writebackQueue.id));
  // Remote calls run concurrently so a large deferred batch drains in
  // seconds, not minutes. DB writes stay sequential afterwards because
  // SQLite handles one writer at a time.
  const results: GhResult<void>[] = new Array(rows.length);
  let next = 0;
  async function worker(): Promise<void> {
    while (next < rows.length) {
      const idx = next++;
      const row = rows[idx]!;
      results[idx] = await apply(row.threadId, row.action as WritebackAction);
    }
  }
  const workerCount = Math.max(1, Math.min(concurrency, rows.length));
  await Promise.all(Array.from({ length: workerCount }, worker));
  let succeeded = 0;
  let failed = 0;
  const succeededItems: { threadId: string; action: WritebackAction }[] = [];
  for (const [idx, row] of rows.entries()) {
    const result = results[idx]!;
    if (result.ok) {
      await db.delete(writebackQueue).where(eq(writebackQueue.id, row.id));
      succeeded += 1;
      succeededItems.push({ threadId: row.threadId, action: row.action as WritebackAction });
    } else {
      await db
        .update(writebackQueue)
        .set({ attempts: row.attempts + 1, lastError: result.reason ?? "unknown" })
        .where(eq(writebackQueue.id, row.id));
      failed += 1;
    }
  }
  return { processed: rows.length, succeeded, failed, succeededItems };
}
