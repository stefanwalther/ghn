import { NextResponse } from "next/server";
import { nowMs } from "@/lib/clock";
import { and, eq, inArray } from "drizzle-orm";
import { mutedSubjects, notifications, writebackQueue } from "@/db/schema";
import { BULK_CONFIRM_THRESHOLD, validateBulkInput, validateBulkRepoInput } from "@/lib/bulk";
import {
  getStoredToken,
  markThreadDone,
  markThreadRead,
  setSubscriptionIgnored,
  type GhResult,
} from "@/lib/github";
import {
  chunkIds,
  drainWritebacks,
  enqueueWriteback,
  enqueueWritebacks,
  enqueueWritebacksSync,
} from "@/lib/queue";
import { mapWithLimit } from "@/lib/sync";
import type { Db } from "@/db/client";

export const dynamic = "force-dynamic";

// Remote write-back runs with bounded concurrency: a large selection used to
// fan out one GitHub call at a time, holding the request (and the UI's busy
// state) for minutes, with one stalled call hanging it forever.
const REMOTE_CONCURRENCY = 8;
// Background drains run slower than foreground retries so a 1000-item repo
// cannot trip GitHub secondary rate limits while the user keeps triaging.
const BACKGROUND_CONCURRENCY = 4;

/** Chunked local update so 1000+ id lists stay under SQLite variable caps. */
async function updateNotificationsChunked(
  db: Db,
  cleanIds: string[],
  set: Partial<typeof notifications.$inferInsert>
): Promise<void> {
  for (const chunk of chunkIds(cleanIds)) {
    await db
      .update(notifications)
      .set(set)
      .where(inArray(notifications.id, chunk));
  }
}

/**
 * Synchronous chunked update for use inside `db.transaction`. Same
 * atomicity note as `enqueueWritebacksSync`: `.run()`, never await.
 */
function updateNotificationsChunkedSync(
  tx: Pick<Db, "update">,
  cleanIds: string[],
  set: Partial<typeof notifications.$inferInsert>
): void {
  for (const chunk of chunkIds(cleanIds)) {
    tx
      .update(notifications)
      .set(set)
      .where(inArray(notifications.id, chunk))
      .run();
  }
}

/**
 * Best-effort background drain for one bulk. Failures stay queued with their
 * reason so the next /api/sync retry picks them up; the response has already
 * gone out, so nothing here may throw.
 */
async function drainInBackground(
  cleanIds: string[],
  action: "done" | "read" | "unsubscribe"
): Promise<void> {
  try {
    const { db } = await import("@/db/client");
    const token = await getStoredToken();
    if (!token) return;
    await drainWritebacks(db, token, cleanIds, action, BACKGROUND_CONCURRENCY);
  } catch {
    // Sync retry is the net; never fail the already-sent response.
  }
}

/**
 * Runs the drain after the response when the platform supports it, else
 * detached. Response timing never depends on which branch is taken.
 */
function scheduleBackground(
  cleanIds: string[],
  action: "done" | "read" | "unsubscribe"
): void {
  void (async () => {
    try {
      const mod = (await import("next/server").catch(() => null)) as unknown as {
        after?: (fn: () => void) => void;
      } | null;
      if (mod && typeof mod.after === "function") {
        try {
          mod.after(() => {
            void drainInBackground(cleanIds, action);
          });
          return;
        } catch {
          // after() outside a request scope throws: fall through below.
        }
      }
    } catch {
      // Fall through to detached run below.
    }
    void drainInBackground(cleanIds, action);
  })();
}

/**
 * Local-first bulk with a split path: small selections keep the current
 * await-the-remote behavior (strong consistency, exact partial errors);
 * large selections enqueue and return in ms with background write-back.
 */
async function applyBulkWithRemote(
  db: Db,
  cleanIds: string[],
  action: "done" | "read" | "unsubscribe",
  localSet: Partial<typeof notifications.$inferInsert>,
  remoteFn: (token: string, id: string) => Promise<GhResult<void>>,
  repositoryId?: string
) {
  const now = nowMs();
  if (cleanIds.length > BULK_CONFIRM_THRESHOLD) {
    // One transaction: a queue failure must never leave rows hidden
    // without their matching writebacks.
    db.transaction((tx) => {
      updateNotificationsChunkedSync(tx, cleanIds, localSet);
      enqueueWritebacksSync(tx, cleanIds, action, null, now);
    });
    scheduleBackground(cleanIds, action);
    const base = { updated: cleanIds.length, action };
    const extra = repositoryId !== undefined ? { repositoryId } : {};
    return NextResponse.json({
      ...base,
      ...extra,
      remote: "background",
      queued: cleanIds.length,
    });
  }
  await updateNotificationsChunked(db, cleanIds, localSet);
  const token = await getStoredToken();
  const remotes = await mapWithLimit(cleanIds, REMOTE_CONCURRENCY, (id) =>
    token
      ? remoteFn(token, id)
      : Promise.resolve({ ok: false, reason: "auth" } as GhResult<void>)
  );
  let queued = 0;
  let firstError: GhResult<void> | null = null;
  for (const [idx, remote] of remotes.entries()) {
    const id = cleanIds[idx] as string;
    if (!remote.ok) {
      firstError ??= remote;
      await enqueueWriteback(db, id, action, remote.reason ?? "unknown", now);
      queued += 1;
    }
  }
  const base = { updated: cleanIds.length, action };
  const extra = repositoryId !== undefined ? { repositoryId } : {};
  if (queued > 0) {
    return NextResponse.json({
      ...base,
      ...extra,
      remote: "partial",
      queued,
      error: firstError?.reason ?? "unknown",
    });
  }
  return NextResponse.json({ ...base, ...extra });
}

/** Shared local-first done path for id lists and repo-wide done. */
async function applyDone(
  db: Db,
  cleanIds: string[],
  repositoryId?: string
) {
  return applyBulkWithRemote(
    db,
    cleanIds,
    "done",
    { isDone: 1, localUnread: 0 },
    (token, id) => markThreadDone(token, id),
    repositoryId
  );
}

/** Shared local-first read path for id lists and repo-wide read. */
async function applyRead(
  db: Db,
  cleanIds: string[],
  repositoryId?: string
) {
  return applyBulkWithRemote(
    db,
    cleanIds,
    "read",
    { isRead: 1, localUnread: 0 },
    (token, id) => markThreadRead(token, id),
    repositoryId
  );
}

/** Bulk triage endpoint: id-list actions plus repo-wide done/read. */
export async function POST(request: Request) {
  const { db } = await import("@/db/client");
  const body = await request.json().catch(() => null);

  // Repo-wide bulk: { repositoryId, action: "done" | "read" } applies to
  // every pending notification of one repository, including quiet digests
  // and rows hidden by the current list filter. The client never has those
  // ids.
  if (body != null && typeof body === "object" && "repositoryId" in body) {
    const checked = validateBulkRepoInput(
      (body as { repositoryId?: unknown }).repositoryId,
      (body as { action?: unknown }).action
    );
    if (!checked.ok) {
      return NextResponse.json(
        { error: "repositoryId must be non-empty and action one of done, read" },
        { status: checked.status }
      );
    }
    const { repositoryId, action } = checked;
    const pending = await db
      .select({ id: notifications.id })
      .from(notifications)
      .where(
        and(
          eq(notifications.repositoryId, repositoryId),
          eq(notifications.isDone, 0)
        )
      );
    const cleanIds = pending.map((n) => n.id);
    if (cleanIds.length === 0) {
      return NextResponse.json({ updated: 0, action, repositoryId });
    }
    if (action === "read") return applyRead(db, cleanIds, repositoryId);
    return applyDone(db, cleanIds, repositoryId);
  }

  const checked = validateBulkInput(body?.ids, body?.action);
  if (!checked.ok) {
    return NextResponse.json(
      { error: "ids must be non-empty and action one of done, unsubscribe, unread, read" },
      { status: checked.status }
    );
  }
  const { ids: cleanIds, action } = checked;

  const existing = await db
    .select({
      id: notifications.id,
      repositoryId: notifications.repositoryId,
      subject: notifications.subject,
    })
    .from(notifications)
    .where(inArray(notifications.id, cleanIds));
  if (existing.length !== cleanIds.length) {
    return NextResponse.json({ error: "unknown notification id" }, { status: 422 });
  }

  const now = nowMs();

  if (action === "unread") {
    await updateNotificationsChunked(db, cleanIds, { isDone: 0, isRead: 0, localUnread: 1 });
    // The user's latest intent wins: drop superseded retries so a queued
    // done/read cannot resurrect the row on the next sync drain.
    for (const chunk of chunkIds(cleanIds)) {
      await db
        .delete(writebackQueue)
        .where(inArray(writebackQueue.threadId, chunk));
    }
    return NextResponse.json({ updated: cleanIds.length, action });
  }

  if (action === "unsubscribe") {
    const pairs = new Map(
      existing.map((n) => [`${n.repositoryId}::${n.subject}`, n])
    );
    if (cleanIds.length > BULK_CONFIRM_THRESHOLD) {
      // One transaction: local unsubscribe, mutes, and queue replacement
      // commit together or not at all.
      db.transaction((tx) => {
        updateNotificationsChunkedSync(tx, cleanIds, { isDone: 1 });
        for (const n of pairs.values()) {
          tx
            .insert(mutedSubjects)
            .values({ repositoryId: n.repositoryId, subject: n.subject })
            .onConflictDoNothing()
            .run();
        }
        enqueueWritebacksSync(tx, cleanIds, "unsubscribe", null, now);
      });
      scheduleBackground(cleanIds, "unsubscribe");
      return NextResponse.json({
        updated: cleanIds.length,
        action,
        remote: "background",
        queued: cleanIds.length,
      });
    }
    await updateNotificationsChunked(db, cleanIds, { isDone: 1 });
    for (const n of pairs.values()) {
      await db
        .insert(mutedSubjects)
        .values({ repositoryId: n.repositoryId, subject: n.subject })
        .onConflictDoNothing();
    }
    const token = await getStoredToken();
    let queued = 0;
    if (token) {
      const remotes = await mapWithLimit(existing, REMOTE_CONCURRENCY, (n) =>
        setSubscriptionIgnored(token, n.id, true)
      );
      for (const [idx, remote] of remotes.entries()) {
        if (remote.ok) continue;
        const n = existing[idx] as (typeof existing)[number];
        await enqueueWriteback(db, n.id, "unsubscribe", remote.reason ?? "unknown", now);
        queued += 1;
      }
    } else {
      for (const n of existing) {
        await enqueueWriteback(db, n.id, "unsubscribe", "auth", now);
        queued += 1;
      }
    }
    if (queued > 0) {
      return NextResponse.json({ updated: cleanIds.length, action, remote: "partial", queued });
    }
    return NextResponse.json({ updated: cleanIds.length, action });
  }

  if (action === "done") {
    return applyDone(db, cleanIds);
  }

  return applyRead(db, cleanIds);
}
