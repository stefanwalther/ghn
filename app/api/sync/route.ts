import { NextResponse } from "next/server";
import { nowMs } from "@/lib/clock";
import { eq, inArray } from "drizzle-orm";
import { notifications, repositories } from "@/db/schema";
import {
  checkRepoExists,
  getStoredToken,
  listNotifications,
  markThreadDone,
  markThreadRead,
  probeConnection,
  resolveSubject,
  setSubscriptionIgnored,
} from "@/lib/github";
import {
  applyRemoteDone,
  backfillDueDates,
  mapWithLimit,
  markRepoUnreachable,
  migrateSeedToLive,
  pruneEmptyRepositories,
  readSyncState,
  reapplyPendingReads,
  upsertThreads,
  writeSyncState,
} from "@/lib/sync";
import { drainQueue, getQueuedThreadIds, queueHealth } from "@/lib/queue";
import { retryPendingSubjects } from "@/lib/subject-retries";
import {
  applyActiveSubjectUpdates,
  prefetchActiveSubjects,
  refreshActiveSubjects,
} from "@/lib/subject-states";

export const dynamic = "force-dynamic";

/** Queue fields shared by every sync response shape. */
async function queueJson(db: Parameters<typeof queueHealth>[0], now: number) {
  const health = await queueHealth(db, now);
  return {
    queueDepth: health.depth,
    queueOldestAgeMs: health.oldestAgeMs,
    queueReasonBreakdown: health.reasonBreakdown,
  };
}

async function refreshUnreachableFlags(
  token: string,
  seenRepoIds: Set<string>
): Promise<void> {
  const { db } = await import("@/db/client");
  const rows = await db
    .select({ id: notifications.id, repositoryId: notifications.repositoryId })
    .from(notifications)
    .where(eq(notifications.isDone, 0));
  const liveByRepo = new Map<string, boolean>();
  for (const row of rows) {
    if (row.id.startsWith("n_")) continue;
    if (seenRepoIds.has(row.repositoryId)) continue;
    liveByRepo.set(row.repositoryId, true);
  }
  const repoIds = [...liveByRepo.keys()];
  if (repoIds.length === 0) return;
  const repoRows = await db
    .select({ id: repositories.id, fullName: repositories.fullName })
    .from(repositories)
    .where(inArray(repositories.id, repoIds));
  const fullNames = new Map<string, string>();
  for (const repo of repoRows) {
    if (repo.fullName) fullNames.set(repo.id, repo.fullName);
  }
  await mapWithLimit([...fullNames.entries()], 8, async ([repoId, fullName]) => {
    const exists = await checkRepoExists(token, fullName);
    if (exists === false) {
      await markRepoUnreachable(db, repoId);
    }
  });
}

export async function POST(request: Request) {
  const { db } = await import("@/db/client");
  const body = await request.json().catch(() => null);
  const forceFull = body?.full === true;
  const now = nowMs();

  const token = await getStoredToken();
  const probe = await probeConnection(token);
  if (!probe.connected || !token) {
    const lastSyncAt = Number.parseInt((await readSyncState(db, "lastSyncAt")) ?? "0", 10) || null;
    return NextResponse.json({
      now,
      lastSyncAt,
      fresh: false,
      reason: probe.reason ?? "auth",
      retryable: true,
      ...(await queueJson(db, now)),
    });
  }

  const pending = await getQueuedThreadIds(db);
  if (pending.size > 0) {
    const drained = await drainQueue(db, (threadId, action) =>
      action === "done"
        ? markThreadDone(token, threadId)
        : action === "read"
          ? markThreadRead(token, threadId)
          : setSubscriptionIgnored(token, threadId, true)
    );
    // Heal rows queued before local-first write-back (isDone/isRead still 0).
    // New bulk calls already hide locally, so this is a no-op for them.
    const doneIds = drained.succeededItems
      .filter((i) => i.action === "done" || i.action === "unsubscribe")
      .map((i) => i.threadId);
    const readIds = drained.succeededItems
      .filter((i) => i.action === "read")
      .map((i) => i.threadId);
    if (doneIds.length > 0) {
      await db
        .update(notifications)
        .set({ isDone: 1, localUnread: 0 })
        .where(inArray(notifications.id, doneIds));
    }
    if (readIds.length > 0) {
      await db
        .update(notifications)
        .set({ isRead: 1, localUnread: 0 })
        .where(inArray(notifications.id, readIds));
    }
  }

  const lastSyncRaw = await readSyncState(db, "lastSyncAt");
  const lastSyncAt = lastSyncRaw ? Number.parseInt(lastSyncRaw, 10) : null;
  const lastModified = await readSyncState(db, "lastModified");
  const pollIntervalSecs = Number.parseInt((await readSyncState(db, "pollIntervalSecs")) ?? "60", 10) || 60;
  const isFirstSync = lastSyncAt === null;

  if (!isFirstSync && !forceFull && now - lastSyncAt < pollIntervalSecs * 1000) {
    return NextResponse.json({
      now,
      lastSyncAt,
      fresh: true,
      pollIntervalSecs,
      upserted: 0,
      markedDone: 0,
      discoveredRepos: 0,
      ...(await queueJson(db, now)),
      notModified: true,
    });
  }

  if (isFirstSync) {
    await migrateSeedToLive(db);
  }
  await backfillDueDates(db, now);
  if ((await readSyncState(db, "seedReposPruned")) !== "1") {
    await pruneEmptyRepositories(db);
    await writeSyncState(db, "seedReposPruned", "1");
  }

  const full = forceFull || isFirstSync;
  // On incremental syncs, overlap the read-only GraphQL subject refresh with
  // `/notifications?since=` so the two main network legs run concurrently.
  // Prefetched results are only applied after `/notifications` succeeds.
  const [listed, prefetched] = await Promise.all([
    listNotifications(token, {
      since: full || !lastSyncAt ? null : new Date(lastSyncAt).toISOString(),
      ifModifiedSince: full ? null : lastModified,
      full,
    }),
    full ? Promise.resolve(null) : prefetchActiveSubjects(db, token),
  ]);
  if (!listed.ok || !listed.data) {
    return NextResponse.json({
      now,
      lastSyncAt,
      fresh: false,
      reason: listed.reason ?? "unknown",
      retryable: true,
      ...(await queueJson(db, now)),
    });
  }

  const { threads, notModified, lastModified: nextModified, pollIntervalSecs: nextPoll } = listed.data;
  await writeSyncState(db, "pollIntervalSecs", String(nextPoll));
  if (nextModified) {
    await writeSyncState(db, "lastModified", nextModified);
  }
  if (probe.viewerLogin) {
    await writeSyncState(db, "viewerLogin", probe.viewerLogin);
  }

  if (notModified) {
    const retried = await retryPendingSubjects(db, now, (thread) => resolveSubject(token, thread));
    const skipIds = new Set(retried.resolvedIds);
    if (prefetched) {
      await applyActiveSubjectUpdates(db, token, prefetched, { skipIds });
    } else {
      await refreshActiveSubjects(db, token, { skipIds });
    }
    await reapplyPendingReads(db);
    await writeSyncState(db, "lastSyncAt", String(now));
    return NextResponse.json({
      now,
      lastSyncAt: now,
      fresh: true,
      pollIntervalSecs: nextPoll,
      upserted: 0,
      markedDone: 0,
      discoveredRepos: 0,
      ...(await queueJson(db, now)),
      notModified: true,
    });
  }

  const summary = await upsertThreads(
    db,
    threads,
    probe.viewerLogin,
    now,
    (t) => resolveSubject(token, t)
  );
  let markedDone = 0;
  if (full) {
    // Check unreachable repositories before applyRemoteDone marks their
    // disappeared threads done, so active repos that were deleted or lost
    // access are still detected while historical done-only repos stay skipped.
    await refreshUnreachableFlags(token, new Set(summary.seenRepoIds));
    const seenIds = new Set(threads.map((t) => t.id));
    const queued = await getQueuedThreadIds(db);
    markedDone = (await applyRemoteDone(db, seenIds, queued)).markedDone;
  }

  const retried = await retryPendingSubjects(db, now, (thread) => resolveSubject(token, thread));
  const skipIds = new Set([...summary.resolvedIds, ...retried.resolvedIds]);
  if (prefetched) {
    await applyActiveSubjectUpdates(db, token, prefetched, { skipIds });
  } else {
    await refreshActiveSubjects(db, token, { skipIds });
  }
  // Upsert and thread refresh recompute isRead from the remote unread flag,
  // which would revert a locally-read row whose PATCH is still queued.
  // Restore those while the retry is pending; explicit unread rows
  // (localUnread=1) are left alone.
  await reapplyPendingReads(db);
  await writeSyncState(db, "lastSyncAt", String(now));

  return NextResponse.json({
    now,
    lastSyncAt: now,
    fresh: true,
    pollIntervalSecs: nextPoll,
    upserted: summary.upserted,
    markedDone,
    discoveredRepos: summary.discoveredRepos,
    ...(await queueJson(db, now)),
  });
}
