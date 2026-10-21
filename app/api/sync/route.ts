import { NextResponse } from "next/server";
import { inArray } from "drizzle-orm";
import { notifications, repositories } from "@/db/schema";
import {
  checkRepoExists,
  getStoredToken,
  listNotifications,
  markThreadDone,
  markThreadRead,
  probeConnection,
  resolveSubjectHtmlUrl,
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
  sharedUrlCache,
  upsertThreads,
  writeSyncState,
} from "@/lib/sync";
import { drainQueue, getQueuedThreadIds, queueDepth } from "@/lib/queue";

export const dynamic = "force-dynamic";

async function refreshUnreachableFlags(
  token: string,
  seenRepoIds: Set<string>
): Promise<void> {
  const { db } = await import("@/db/client");
  const rows = await db
    .select({ id: notifications.id, repositoryId: notifications.repositoryId })
    .from(notifications);
  const liveByRepo = new Map<string, boolean>();
  for (const row of rows) {
    if (row.id.startsWith("n_")) continue;
    if (seenRepoIds.has(row.repositoryId)) continue;
    liveByRepo.set(row.repositoryId, true);
  }
  const repoIds = [...liveByRepo.keys()];
  const fullNames = new Map<string, string>();
  for (const repoId of repoIds) {
    const repoRows = await db
      .select({ fullName: repositories.fullName })
      .from(repositories)
      .where(inArray(repositories.id, [repoId]));
    const fullName = repoRows[0]?.fullName;
    if (fullName) fullNames.set(repoId, fullName);
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
  const now = Date.now();

  const probe = await probeConnection();
  if (!probe.connected) {
    const lastSyncAt = Number.parseInt((await readSyncState(db, "lastSyncAt")) ?? "0", 10) || null;
    const depth = await queueDepth(db);
    return NextResponse.json({
      now,
      lastSyncAt,
      fresh: false,
      reason: probe.reason ?? "auth",
      retryable: true,
      queueDepth: depth,
    });
  }
  const token = (await getStoredToken()) as string;

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
      queueDepth: await queueDepth(db),
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
  const listed = await listNotifications(token, {
    since: full || !lastSyncAt ? null : new Date(lastSyncAt).toISOString(),
    ifModifiedSince: full ? null : lastModified,
    full,
  });
  if (!listed.ok || !listed.data) {
    const depth = await queueDepth(db);
    return NextResponse.json({
      now,
      lastSyncAt,
      fresh: false,
      reason: listed.reason ?? "unknown",
      retryable: true,
      queueDepth: depth,
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
    await writeSyncState(db, "lastSyncAt", String(now));
    return NextResponse.json({
      now,
      lastSyncAt: now,
      fresh: true,
      pollIntervalSecs: nextPoll,
      upserted: 0,
      markedDone: 0,
      discoveredRepos: 0,
      queueDepth: await queueDepth(db),
      notModified: true,
    });
  }

  const cache = sharedUrlCache();
  const summary = await upsertThreads(
    db,
    threads,
    probe.viewerLogin,
    now,
    (t) => resolveSubjectHtmlUrl(token, t, cache)
  );
  // Upsert recomputes isRead from the remote unread flag, which would revert
  // a locally-read row whose PATCH is still queued. Restore those while the
  // retry is pending; explicit unread rows (localUnread=1) are left alone.
  await reapplyPendingReads(db);
  let markedDone = 0;
  if (full) {
    const seenIds = new Set(threads.map((t) => t.id));
    const queued = await getQueuedThreadIds(db);
    markedDone = (await applyRemoteDone(db, seenIds, queued)).markedDone;
    await refreshUnreachableFlags(token, new Set(summary.seenRepoIds));
  }

  await writeSyncState(db, "lastSyncAt", String(now));

  return NextResponse.json({
    now,
    lastSyncAt: now,
    fresh: true,
    pollIntervalSecs: nextPoll,
    upserted: summary.upserted,
    markedDone,
    discoveredRepos: summary.discoveredRepos,
    queueDepth: await queueDepth(db),
  });
}
