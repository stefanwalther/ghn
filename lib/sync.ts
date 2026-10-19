import { eq, inArray, sql } from "drizzle-orm";
import { notifications, repositories, syncState } from "@/db/schema";
import type { Db } from "@/db/client";
import { computeNextDueAt } from "@/lib/digest";
import type { GhThread } from "@/lib/github";
import { readPrMerged, readSubjectState } from "@/lib/github";

export function repoIdForFullName(fullName: string): string {
  return fullName.toLowerCase().replace(/\//g, "--");
}

export async function readSyncState(db: Db, key: string): Promise<string | null> {
  const rows = await db.select().from(syncState).where(eq(syncState.key, key));
  return rows[0]?.value ?? null;
}

export async function writeSyncState(db: Db, key: string, value: string): Promise<void> {
  await db
    .insert(syncState)
    .values({ key, value })
    .onConflictDoUpdate({ target: syncState.key, set: { value } });
}

const urlCache = new Map<string, string>();

export function clearUrlCache(): void {
  urlCache.clear();
}

async function ensureRepository(
  db: Db,
  thread: GhThread,
  viewerLogin: string | null,
  now: number
): Promise<string> {
  const id = repoIdForFullName(thread.repoFullName);
  const existing = await db.select().from(repositories).where(eq(repositories.id, id));
  if (existing[0]) {
    if (existing[0].unreachable === 1) {
      await db.update(repositories).set({ unreachable: 0 }).where(eq(repositories.id, id));
    }
    return id;
  }
  const owned =
    !!viewerLogin &&
    !!thread.repoOwnerLogin &&
    thread.repoOwnerLogin.toLowerCase() === viewerLogin.toLowerCase();
  const ownership = owned ? "owned" : "watched";
  const rhythm = owned ? "immediate" : "weekly";
  await db.insert(repositories).values({
    id,
    fullName: thread.repoFullName,
    ownership,
    rhythm,
    lastPromotedAt: null,
    nextDueAt: computeNextDueAt(rhythm, now),
    snoozedUntil: null,
    unreachable: 0,
    createdAt: now,
  });
  return id;
}

export async function backfillDueDates(db: Db, now: number): Promise<{ backfilled: number }> {
  const rows = await db.select().from(repositories);
  let backfilled = 0;
  for (const repo of rows) {
    if (repo.rhythm !== "immediate" && repo.nextDueAt == null) {
      await db
        .update(repositories)
        .set({ nextDueAt: computeNextDueAt(repo.rhythm, now) })
        .where(eq(repositories.id, repo.id));
      backfilled += 1;
    }
  }
  return { backfilled };
}

export async function migrateSeedToLive(db: Db): Promise<{ deletedSeed: number }> {
  const rows = await db.select({ id: notifications.id }).from(notifications);
  const seedIds = rows.map((r) => r.id).filter((id) => id.startsWith("n_"));
  if (seedIds.length > 0) {
    await db.delete(notifications).where(inArray(notifications.id, seedIds));
  }
  return { deletedSeed: seedIds.length };
}

export async function pruneEmptyRepositories(db: Db): Promise<{ pruned: number }> {
  const repos = await db.select({ id: repositories.id }).from(repositories);
  const used = await db.select({ repositoryId: notifications.repositoryId }).from(notifications);
  const usedIds = new Set(used.map((r) => r.repositoryId));
  const emptyIds = repos.map((r) => r.id).filter((id) => !usedIds.has(id));
  if (emptyIds.length > 0) {
    await db.delete(repositories).where(inArray(repositories.id, emptyIds));
  }
  return { pruned: emptyIds.length };
}

export async function mapWithLimit<T, R>(
  items: T[],
  limit: number,
  fn: (item: T) => Promise<R>
): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let next = 0;
  async function worker(): Promise<void> {
    while (next < items.length) {
      const idx = next++;
      results[idx] = await fn(items[idx] as T);
    }
  }
  const workers = Math.max(1, Math.min(limit, items.length));
  await Promise.all(Array.from({ length: workers }, worker));
  return results;
}

export interface UpsertSummary {
  upserted: number;
  discoveredRepos: number;
  seenRepoIds: string[];
}

export async function upsertThreads(
  db: Db,
  threads: GhThread[],
  viewerLogin: string | null,
  now: number,
  resolveUrl: (thread: GhThread) => Promise<string>
): Promise<UpsertSummary> {
  let upserted = 0;
  const seenRepos = new Set<string>();
  const pending: { thread: GhThread; repoId: string }[] = [];
  for (const thread of threads) {
    if (!thread.repoFullName) continue;
    const repoId = await ensureRepository(db, thread, viewerLogin, now);
    seenRepos.add(repoId);
    pending.push({ thread, repoId });
  }
  const existingRows = await db.select().from(notifications);
  const existingById = new Map(existingRows.map((r) => [r.id, r]));
  const toResolve = pending.filter(({ thread }) => {
    const row = existingById.get(thread.id);
    if (!row || row.isDone === 1) return row === undefined;
    return (row.githubUpdatedAt ?? 0) < thread.updatedAt;
  });
  const resolved = await mapWithLimit(toResolve, 12, async ({ thread }) => ({
    id: thread.id,
    url: await resolveUrl(thread),
  }));
  const urlById = new Map(resolved.map((r) => [r.id, r.url]));
  for (const { thread, repoId } of pending) {
    const row = existingById.get(thread.id);
    if (!row) {
      await db.insert(notifications).values({
        id: thread.id,
        repositoryId: repoId,
        subject: thread.subjectTitle.slice(0, 200) || "Untitled",
        subjectType: thread.subjectType,
        subjectState: readSubjectState(thread.subjectApiUrl),
        reason: thread.reason,
        createdAt: thread.updatedAt,
        githubUpdatedAt: thread.updatedAt,
        isRead: thread.unread ? 0 : 1,
        isDone: 0,
        localUnread: 0,
        prMerged: readPrMerged(thread.subjectApiUrl) ? 1 : 0,
        sourceUrl: urlById.get(thread.id) ?? "",
      });
      upserted += 1;
      continue;
    }
    if (row.isDone === 1) {
      continue;
    }
    const changed = (row.githubUpdatedAt ?? 0) < thread.updatedAt;
    const isRead = thread.unread ? 0 : row.localUnread === 1 ? 0 : 1;
    await db
      .update(notifications)
      .set({
        repositoryId: repoId,
        subject: thread.subjectTitle.slice(0, 200) || "Untitled",
        subjectType: thread.subjectType,
        subjectState: urlById.has(thread.id)
          ? readSubjectState(thread.subjectApiUrl)
          : (row.subjectState ?? null),
        reason: thread.reason,
        createdAt: thread.updatedAt,
        githubUpdatedAt: thread.updatedAt,
        isRead,
        prMerged: urlById.has(thread.id)
          ? readPrMerged(thread.subjectApiUrl) ? 1 : 0
          : (row.prMerged ?? 0),
        sourceUrl: changed ? (urlById.get(thread.id) ?? row.sourceUrl) : row.sourceUrl,
      })
      .where(eq(notifications.id, thread.id));
    upserted += 1;
  }
  const discoveredRepos = seenRepos.size;
  return { upserted, discoveredRepos, seenRepoIds: [...seenRepos] };
}

export function sharedUrlCache(): Map<string, string> {
  return urlCache;
}

export async function applyRemoteDone(
  db: Db,
  seenIds: Set<string>,
  queuedThreadIds: Set<string>
): Promise<{ markedDone: number }> {
  const rows = await db
    .select({ id: notifications.id })
    .from(notifications)
    .where(sql`${notifications.isDone} = 0`);
  const missing = rows
    .map((r) => r.id)
    .filter((id) => !id.startsWith("n_") && !seenIds.has(id) && !queuedThreadIds.has(id));
  if (missing.length > 0) {
    await db
      .update(notifications)
      .set({ isDone: 1 })
      .where(inArray(notifications.id, missing));
  }
  return { markedDone: missing.length };
}

export async function markRepoUnreachable(db: Db, repoId: string): Promise<void> {
  await db.update(repositories).set({ unreachable: 1 }).where(eq(repositories.id, repoId));
}
