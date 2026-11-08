import { and, asc, count, eq, inArray, lt, sql } from "drizzle-orm";
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

/** Retryable rows stop being retried once attempts reach this cap. */
export const MAX_WRITEBACK_ATTEMPTS = 10;

/** Remote statuses that never succeed on retry: the thread is gone. */
export function isTerminalStatus(status: number | undefined): boolean {
  return status === 404 || status === 410;
}

/**
 * Serializes drains within this process. The second drain waits for the
 * first to finish, then re-reads the queue, so an overlapping background
 * drain and sync drain never send the same row twice. No schema change:
 * a single local process needs no cross-process lock.
 */
let drainTail: Promise<void> = Promise.resolve();

async function withDrainLock<T>(fn: () => Promise<T>): Promise<T> {
  const prev = drainTail;
  let release!: () => void;
  drainTail = new Promise<void>((resolve) => {
    release = resolve;
  });
  await prev;
  try {
    return await fn();
  } finally {
    release();
  }
}

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
  // One row per thread and action: a retried small bulk replaces the
  // superseded retry instead of stacking duplicates, matching the bulk
  // replacement path below.
  await db
    .delete(writebackQueue)
    .where(
      and(eq(writebackQueue.threadId, threadId), eq(writebackQueue.action, action))
    );
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
  const rows = await db.select({ value: count() }).from(writebackQueue);
  return rows[0]?.value ?? 0;
}

export interface QueueHealth {
  depth: number;
  oldestAgeMs: number;
  reasonBreakdown: Record<string, number>;
}

/** Health snapshot for diagnosis: depth plus oldest age and failure mix. */
export async function queueHealth(db: Db, now: number): Promise<QueueHealth> {
  const depth = await queueDepth(db);
  if (depth === 0) return { depth: 0, oldestAgeMs: 0, reasonBreakdown: {} };
  const oldest = await db
    .select({ createdAt: writebackQueue.createdAt })
    .from(writebackQueue)
    .orderBy(asc(writebackQueue.createdAt))
    .limit(1);
  const groups = await db
    .select({ lastError: writebackQueue.lastError, value: count() })
    .from(writebackQueue)
    .groupBy(writebackQueue.lastError);
  const reasonBreakdown: Record<string, number> = {};
  for (const g of groups) reasonBreakdown[g.lastError ?? "unknown"] = g.value;
  const oldestAgeMs = oldest[0] ? Math.max(0, now - oldest[0].createdAt) : 0;
  return { depth, oldestAgeMs, reasonBreakdown };
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
  return withDrainLock(async () => {
    let succeeded = 0;
    let failed = 0;
    let skipped = 0;
  await mapWithLimit(ids, concurrency, async (id) => {
    const pending = await db
      .select({ id: writebackQueue.id })
      .from(writebackQueue)
      .where(
        and(
          eq(writebackQueue.threadId, id),
          eq(writebackQueue.action, action),
          lt(writebackQueue.attempts, MAX_WRITEBACK_ATTEMPTS)
        )
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
    } else if (isTerminalStatus(remote.status)) {
      // The thread is gone and will never drain: drop the row so it
      // stops inflating every later sync.
      await db
        .delete(writebackQueue)
        .where(inArray(writebackQueue.id, pending.map((r) => r.id)));
    } else {
      for (const r of pending) {
        await db
          .update(writebackQueue)
          .set({
            attempts: sql`${writebackQueue.attempts} + 1`,
            lastError: remote.reason ?? "unknown",
          })
          .where(eq(writebackQueue.id, r.id));
      }
      failed += 1;
    }
    });
    return { succeeded, failed, skipped };
  });
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
  return withDrainLock(async () => {
    const rows = await db
      .select({
        id: writebackQueue.id,
        threadId: writebackQueue.threadId,
        action: writebackQueue.action,
      })
      .from(writebackQueue)
      .where(lt(writebackQueue.attempts, MAX_WRITEBACK_ATTEMPTS))
      .orderBy(asc(writebackQueue.id));
  // Remote calls run concurrently so a large queued batch drains in
  // seconds, not minutes. DB writes stay sequential afterwards because
  // SQLite handles one writer at a time. Workers stop claiming new rows
  // after the first rate-limited result: further writes would fail too,
  // so unclaimed rows stay queued untouched for the next drain.
  const results: (GhResult<void> | undefined)[] = new Array(rows.length);
  let next = 0;
  let rateLimited = false;
  async function worker(): Promise<void> {
    while (!rateLimited && next < rows.length) {
      const idx = next++;
      const row = rows[idx]!;
      const result = await apply(row.threadId, row.action as WritebackAction);
      results[idx] = result;
      if (!result.ok && result.reason === "rate_limited") {
        rateLimited = true;
      }
    }
  }
  const workerCount = Math.max(1, Math.min(concurrency, rows.length));
  await Promise.all(Array.from({ length: workerCount }, worker));
  let processed = 0;
  let succeeded = 0;
  let failed = 0;
  const succeededItems: { threadId: string; action: WritebackAction }[] = [];
  for (const [idx, row] of rows.entries()) {
    const result = results[idx];
    if (result === undefined) continue;
    if (result.ok) {
      // The intent may have been withdrawn mid-drain: mark-unread deletes
      // the queue row and clears isDone locally. Reporting this stale
      // success would let the sync heal set isDone back to 1, reversing
      // the newer user action.
      const stillQueued = await db
        .select({ id: writebackQueue.id })
        .from(writebackQueue)
        .where(eq(writebackQueue.id, row.id));
      if (stillQueued.length === 0) continue;
      await db.delete(writebackQueue).where(eq(writebackQueue.id, row.id));
      processed += 1;
      succeeded += 1;
      succeededItems.push({ threadId: row.threadId, action: row.action as WritebackAction });
    } else if (isTerminalStatus(result.status)) {
      // The thread is gone and will never drain: drop the row so it
      // stops inflating every later sync.
      const stillQueued = await db
        .select({ id: writebackQueue.id })
        .from(writebackQueue)
        .where(eq(writebackQueue.id, row.id));
      if (stillQueued.length === 0) continue;
      await db.delete(writebackQueue).where(eq(writebackQueue.id, row.id));
      processed += 1;
    } else {
      await db
        .update(writebackQueue)
        .set({
          attempts: sql`${writebackQueue.attempts} + 1`,
          lastError: result.reason ?? "unknown",
        })
        .where(eq(writebackQueue.id, row.id));
      processed += 1;
      failed += 1;
    }
  }
  return { processed, succeeded, failed, succeededItems };
  });
}
