import { and, asc, eq, inArray } from "drizzle-orm";
import { writebackQueue } from "@/db/schema";
import type { Db } from "@/db/client";
import {
  markThreadDone,
  markThreadRead,
  setSubscriptionIgnored,
  type GhResult,
} from "@/lib/github";
import { mapWithLimit } from "@/lib/sync";

export type WritebackAction = "done" | "read" | "unsubscribe";

/** SQLite-friendly chunking for large id lists (variable cap + fast batches). */
export const QUEUE_CHUNK_SIZE = 200;

export function chunkIds(ids: string[], size: number = QUEUE_CHUNK_SIZE): string[][] {
  const out: string[][] = [];
  for (let i = 0; i < ids.length; i += size) out.push(ids.slice(i, i + size));
  return out;
}

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

/**
 * Bulk replacement enqueue: drops superseded retries for these threads so a
 * retried bulk cannot duplicate queue rows, then inserts in chunks. Fast
 * enough to stay on the request path for 1000+ ids.
 */
export async function enqueueWritebacks(
  db: Db,
  ids: string[],
  action: WritebackAction,
  lastError: string | null,
  now: number
): Promise<void> {
  if (ids.length === 0) return;
  for (const chunk of chunkIds(ids)) {
    await db
      .delete(writebackQueue)
      .where(inArray(writebackQueue.threadId, chunk));
  }
  for (const chunk of chunkIds(ids)) {
    await db.insert(writebackQueue).values(
      chunk.map((threadId) => ({
        threadId,
        action,
        attempts: 0,
        lastError,
        createdAt: now,
      }))
    );
  }
}

/**
 * Synchronous bulk replacement enqueue for use inside `db.transaction`.
 * Drizzle Bun SQLite transactions take a sync callback; awaiting inside
 * one is the footgun, so this variant uses `.run()` throughout.
 */
export function enqueueWritebacksSync(
  tx: Pick<Db, "delete" | "insert">,
  ids: string[],
  action: WritebackAction,
  lastError: string | null,
  now: number
): void {
  if (ids.length === 0) return;
  for (const chunk of chunkIds(ids)) {
    tx
      .delete(writebackQueue)
      .where(inArray(writebackQueue.threadId, chunk))
      .run();
  }
  for (const chunk of chunkIds(ids)) {
    tx
      .insert(writebackQueue)
      .values(
        chunk.map((threadId) => ({
          threadId,
          action,
          attempts: 0,
          lastError,
          createdAt: now,
        }))
      )
      .run();
  }
}

export async function getQueuedThreadIds(db: Db): Promise<Set<string>> {
  const rows = await db.select({ threadId: writebackQueue.threadId }).from(writebackQueue);
  return new Set(rows.map((r) => r.threadId));
}

export async function queueDepth(db: Db): Promise<number> {
  const rows = await db.select({ id: writebackQueue.id }).from(writebackQueue);
  return rows.length;
}

/**
 * Background drain for one bulk's id list. Unlike `drainQueue` (which owns
 * whatever rows exist), this re-checks the queue row before each GitHub
 * call: a mark-unread withdraws the row, and a withdrawn intent must not
 * still fire its DELETE/PATCH afterwards.
 */
export async function drainWritebacks(
  db: Db,
  token: string,
  ids: string[],
  action: WritebackAction,
  concurrency = 4
): Promise<{ succeeded: number; failed: number; skipped: number }> {
  let succeeded = 0;
  let failed = 0;
  let skipped = 0;
  await mapWithLimit(ids, concurrency, async (id) => {
    const pending = await db
      .select({ id: writebackQueue.id, attempts: writebackQueue.attempts })
      .from(writebackQueue)
      .where(
        and(eq(writebackQueue.threadId, id), eq(writebackQueue.action, action))
      );
    if (pending.length === 0) {
      skipped += 1;
      return;
    }
    const remote: GhResult<void> =
      action === "done"
        ? await markThreadDone(token, id)
        : action === "read"
          ? await markThreadRead(token, id)
          : await setSubscriptionIgnored(token, id, true);
    if (remote.ok) {
      // Delete only the rows this drain selected: a second request may
      // have replaced the row while the remote call was in flight, and
      // that replacement still needs its own retry.
      await db
        .delete(writebackQueue)
        .where(inArray(writebackQueue.id, pending.map((r) => r.id)));
      succeeded += 1;
    } else {
      for (const r of pending) {
        await db
          .update(writebackQueue)
          .set({ attempts: r.attempts + 1, lastError: remote.reason ?? "unknown" })
          .where(eq(writebackQueue.id, r.id));
      }
      failed += 1;
    }
  });
  return { succeeded, failed, skipped };
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
