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
  apply: (threadId: string, action: WritebackAction) => Promise<GhResult<void>>
): Promise<DrainResult> {
  const rows = await db.select().from(writebackQueue).orderBy(asc(writebackQueue.id));
  let succeeded = 0;
  let failed = 0;
  const succeededItems: { threadId: string; action: WritebackAction }[] = [];
  for (const row of rows) {
    const result = await apply(row.threadId, row.action);
    if (result.ok) {
      await db.delete(writebackQueue).where(eq(writebackQueue.id, row.id));
      succeeded += 1;
      succeededItems.push({ threadId: row.threadId, action: row.action });
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
