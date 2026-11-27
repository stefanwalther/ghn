import { and, eq, like, sql } from "drizzle-orm";
import { notifications, syncState } from "@/db/schema";
import type { Db } from "@/db/client";
import type { GhThread, SubjectSnapshot } from "@/lib/github";

const PREFIX = "subjectRetry:";
const RETRIES_PER_POLL = 12;
const MIN_DELAY_MS = 60_000;
const MAX_DELAY_MS = 3_600_000;

interface SubjectRetry {
  thread: GhThread;
  attempts: number;
  nextAttemptAt: number;
}

function retryDelay(attempts: number): number {
  return Math.min(MAX_DELAY_MS, MIN_DELAY_MS * 2 ** Math.min(attempts - 1, 6));
}

function parseRetry(value: string): SubjectRetry | null {
  try {
    const retry = JSON.parse(value) as SubjectRetry;
    const thread = retry?.thread;
    if (!thread || !Number.isFinite(thread.updatedAt) || typeof thread.unread !== "boolean") return null;
    const strings = [thread.id, thread.reason, thread.subjectTitle, thread.subjectType,
      thread.subjectApiUrl, thread.repoFullName, thread.repoOwnerLogin, thread.repoHtmlUrl, thread.threadUrl];
    if (!strings.every((item) => typeof item === "string")) return null;
    return Number.isInteger(retry.attempts) && retry.attempts > 0 && Number.isFinite(retry.nextAttemptAt)
      ? retry : null;
  } catch {
    return null;
  }
}

export async function readSubjectRetries(db: Db) {
  const rows = await db.select().from(syncState).where(like(syncState.key, `${PREFIX}%`));
  const retries = new Map<string, { key: string; value: string; retry: SubjectRetry }>();
  for (const row of rows) {
    const retry = parseRetry(row.value);
    if (retry && row.key === `${PREFIX}${retry.thread.id}`) {
      retries.set(retry.thread.id, { ...row, retry });
    } else {
      await db.delete(syncState).where(and(eq(syncState.key, row.key), eq(syncState.value, row.value)));
    }
  }
  return retries;
}

/** One record per notification, with compare-and-swap writes across overlapping syncs. */
export async function recordSubjectResolution(db: Db, thread: GhThread, ok: boolean, now: number) {
  const key = `${PREFIX}${thread.id}`;
  const nonResolvable = !thread.subjectApiUrl.trim();
  for (;;) {
    const [stored] = await db.select().from(syncState).where(eq(syncState.key, key));
    const previous = stored ? parseRetry(stored.value) : null;
    if (previous && previous.thread.updatedAt > thread.updatedAt) return;
    const [row] = await db.select().from(notifications).where(eq(notifications.id, thread.id));
    if (ok || nonResolvable || !row || row.isDone === 1 || (row.githubUpdatedAt ?? -1) >= thread.updatedAt) {
      if (!stored) return;
      const removed = await db.delete(syncState)
        .where(and(eq(syncState.key, key), eq(syncState.value, stored.value))).returning({ key: syncState.key });
      if (removed.length) return;
      continue;
    }
    const attempts = previous?.thread.updatedAt === thread.updatedAt ? previous.attempts + 1 : 1;
    const value = JSON.stringify({ thread, attempts, nextAttemptAt: now + retryDelay(attempts) });
    const saved = stored
      ? await db.update(syncState).set({ value })
        .where(and(eq(syncState.key, key), eq(syncState.value, stored.value))).returning({ key: syncState.key })
      : await db.insert(syncState).values({ key, value }).onConflictDoNothing().returning({ key: syncState.key });
    if (saved.length) return;
  }
}

/** Run only after the global poll gate, including on empty and 304 listings. */
export async function retryPendingSubjects(
  db: Db,
  now: number,
  resolve: (thread: GhThread) => Promise<SubjectSnapshot>
) {
  const pending = [...(await readSubjectRetries(db)).values()];
  const due: typeof pending = [];
  for (const entry of pending) {
    const [row] = await db.select().from(notifications).where(eq(notifications.id, entry.retry.thread.id));
    if (!entry.retry.thread.subjectApiUrl.trim()) {
      if (row && row.isDone === 0 && row.githubUpdatedAt === null) {
        await db
          .update(notifications)
          .set({ githubUpdatedAt: entry.retry.thread.updatedAt })
          .where(and(eq(notifications.id, row.id), sql`${notifications.githubUpdatedAt} IS NULL`));
      }
      await db.delete(syncState).where(and(eq(syncState.key, entry.key), eq(syncState.value, entry.value)));
    } else if (!row || row.isDone === 1 || (row.githubUpdatedAt ?? -1) >= entry.retry.thread.updatedAt) {
      await db.delete(syncState).where(and(eq(syncState.key, entry.key), eq(syncState.value, entry.value)));
    } else if (entry.retry.nextAttemptAt <= now) {
      due.push(entry);
    }
  }
  due.sort((a, b) => a.retry.nextAttemptAt - b.retry.nextAttemptAt || a.key.localeCompare(b.key));
  let attempted = 0;
  let updated = 0;
  const resolvedIds: string[] = [];
  await Promise.all(due.slice(0, RETRIES_PER_POLL).map(async (entry) => {
    // Claim and schedule the next attempt before fetching. A concurrent poll
    // cannot claim the same record, and a crash leaves a retryable lease.
    const next = { ...entry.retry, attempts: entry.retry.attempts + 1 };
    next.nextAttemptAt = now + retryDelay(next.attempts);
    const value = JSON.stringify(next);
    const claimed = await db.update(syncState).set({ value })
      .where(and(eq(syncState.key, entry.key), eq(syncState.value, entry.value))).returning({ key: syncState.key });
    if (!claimed.length) return;
    const thread = next.thread;
    const [row] = await db.select().from(notifications).where(eq(notifications.id, thread.id));
    if (row && row.isDone === 0 && (row.githubUpdatedAt ?? -1) < thread.updatedAt) {
      attempted += 1;
      const snapshot = await resolve(thread);
      if (!snapshot.ok) return;
      const changed = await db.update(notifications).set({
        subjectState: snapshot.state ?? sql`${notifications.subjectState}`,
        prMerged: thread.subjectType === "PullRequest" && snapshot.merged === true ? 1 : 0,
        sourceUrl: snapshot.url,
        githubUpdatedAt: thread.updatedAt,
      }).where(and(
        eq(notifications.id, thread.id), eq(notifications.isDone, 0),
        sql`${notifications.githubUpdatedAt} IS ${row.githubUpdatedAt}`,
        eq(notifications.createdAt, row.createdAt),
      )).returning({ id: notifications.id });
      if (changed.length > 0) {
        updated += changed.length;
        resolvedIds.push(thread.id);
      }
    }
    await db.delete(syncState).where(and(eq(syncState.key, entry.key), eq(syncState.value, value)));
  }));
  return { attempted, updated, resolvedIds };
}
