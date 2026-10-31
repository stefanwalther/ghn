import { NextResponse } from "next/server";
import { nowMs } from "@/lib/clock";
import { and, eq, inArray } from "drizzle-orm";
import { mutedSubjects, notifications, writebackQueue } from "@/db/schema";
import { validateBulkInput, validateBulkRepoInput } from "@/lib/bulk";
import {
  getStoredToken,
  markThreadDone,
  markThreadRead,
  setSubscriptionIgnored,
  type GhResult,
} from "@/lib/github";
import { mapWithLimit } from "@/lib/sync";
import type { Db } from "@/db/client";

export const dynamic = "force-dynamic";

// Remote write-back runs with bounded concurrency: a large selection used to
// fan out one GitHub call at a time, holding the request (and the UI's busy
// state) for minutes, with one stalled call hanging it forever.
const REMOTE_CONCURRENCY = 8;

// Bulk requests used to await one GitHub call per row before responding. A
// repo with hundreds of pending rows held the request (and the UI busy
// state) for tens of seconds, blocking triage of every other repo. Only the
// first REMOTE_SYNC_LIMIT rows attempt the remote write inline; the rest are
// queued for the background sync drain and reported as deferred so the
// response stays fast regardless of repo size.
const REMOTE_SYNC_LIMIT = 25;

/** Batch-enqueue write-backs in chunks so a large repo does not pay per-row latency. */
async function enqueueMany(
  db: Db,
  items: { threadId: string; action: "done" | "read" | "unsubscribe"; lastError: string | null }[],
  now: number
): Promise<void> {
  const CHUNK = 100;
  for (let i = 0; i < items.length; i += CHUNK) {
    const chunk = items.slice(i, i + CHUNK);
    await db.insert(writebackQueue).values(
      chunk.map((item) => ({
        threadId: item.threadId,
        action: item.action,
        attempts: 0,
        lastError: item.lastError,
        createdAt: now,
      }))
    );
  }
}

/** Shared local-first done path for id lists and repo-wide done. */
async function applyDone(
  db: Db,
  cleanIds: string[],
  repositoryId?: string
) {
  const now = nowMs();
  const token = await getStoredToken();
  await db
    .update(notifications)
    .set({ isDone: 1, localUnread: 0 })
    .where(inArray(notifications.id, cleanIds));
  // Bound the synchronous remote fan-out: only the first slice is attempted
  // inline so the response stays fast. The remainder is queued for the sync
  // drain with a "deferred" marker (not a failure) and reported the same way.
  const syncIds = cleanIds.slice(0, REMOTE_SYNC_LIMIT);
  const deferredIds = cleanIds.slice(REMOTE_SYNC_LIMIT);
  const remotes = await mapWithLimit(syncIds, REMOTE_CONCURRENCY, (id) =>
    token
      ? markThreadDone(token, id)
      : Promise.resolve({ ok: false, reason: "auth" } as GhResult<void>)
  );
  const failures: { threadId: string; lastError: string }[] = [];
  let firstErrorReason: string | null = null;
  for (const [idx, remote] of remotes.entries()) {
    const id = syncIds[idx] as string;
    if (!remote.ok) {
      firstErrorReason ??= remote.reason ?? "unknown";
      failures.push({ threadId: id, lastError: remote.reason ?? "unknown" });
    }
  }
  if (failures.length > 0) {
    await enqueueMany(
      db,
      failures.map((f) => ({ ...f, action: "done" as const })),
      now
    );
  }
  if (deferredIds.length > 0) {
    await enqueueMany(
      db,
      deferredIds.map((id) => ({ threadId: id, action: "done" as const, lastError: "deferred" })),
      now
    );
    firstErrorReason ??= "deferred";
  }
  const queued = failures.length + deferredIds.length;
  const base = { updated: cleanIds.length, action: "done" as const };
  const extra =
    repositoryId !== undefined ? { repositoryId } : {};
  if (queued > 0) {
    return NextResponse.json({
      ...base,
      ...extra,
      remote: "partial",
      queued,
      error: firstErrorReason ?? "unknown",
    });
  }
  return NextResponse.json({ ...base, ...extra });
}

/** Shared local-first read path for id lists and repo-wide read. */
async function applyRead(
  db: Db,
  cleanIds: string[],
  repositoryId?: string
) {
  const now = nowMs();
  const token = await getStoredToken();
  await db
    .update(notifications)
    .set({ isRead: 1, localUnread: 0 })
    .where(inArray(notifications.id, cleanIds));
  const syncIds = cleanIds.slice(0, REMOTE_SYNC_LIMIT);
  const deferredIds = cleanIds.slice(REMOTE_SYNC_LIMIT);
  const remotes = await mapWithLimit(syncIds, REMOTE_CONCURRENCY, (id) =>
    token
      ? markThreadRead(token, id)
      : Promise.resolve({ ok: false, reason: "auth" } as GhResult<void>)
  );
  const failures: { threadId: string; lastError: string }[] = [];
  let firstErrorReason: string | null = null;
  for (const [idx, remote] of remotes.entries()) {
    const id = syncIds[idx] as string;
    if (!remote.ok) {
      firstErrorReason ??= remote.reason ?? "unknown";
      failures.push({ threadId: id, lastError: remote.reason ?? "unknown" });
    }
  }
  if (failures.length > 0) {
    await enqueueMany(
      db,
      failures.map((f) => ({ ...f, action: "read" as const })),
      now
    );
  }
  if (deferredIds.length > 0) {
    await enqueueMany(
      db,
      deferredIds.map((id) => ({ threadId: id, action: "read" as const, lastError: "deferred" })),
      now
    );
    firstErrorReason ??= "deferred";
  }
  const queued = failures.length + deferredIds.length;
  const base = { updated: cleanIds.length, action: "read" as const };
  const extra =
    repositoryId !== undefined ? { repositoryId } : {};
  if (queued > 0) {
    return NextResponse.json({
      ...base,
      ...extra,
      remote: "partial",
      queued,
      error: firstErrorReason ?? "unknown",
    });
  }
  return NextResponse.json({ ...base, ...extra });
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
    await db
      .update(notifications)
      .set({ isDone: 0, isRead: 0, localUnread: 1 })
      .where(inArray(notifications.id, cleanIds));
    // The user's latest intent wins: drop superseded retries so a queued
    // done/read cannot resurrect the row on the next sync drain.
    await db
      .delete(writebackQueue)
      .where(inArray(writebackQueue.threadId, cleanIds));
    return NextResponse.json({ updated: cleanIds.length, action });
  }

  if (action === "unsubscribe") {
    await db
      .update(notifications)
      .set({ isDone: 1 })
      .where(inArray(notifications.id, cleanIds));
    const pairs = new Map(
      existing.map((n) => [`${n.repositoryId}::${n.subject}`, n])
    );
    for (const n of pairs.values()) {
      await db
        .insert(mutedSubjects)
        .values({ repositoryId: n.repositoryId, subject: n.subject })
        .onConflictDoNothing();
    }
    const token = await getStoredToken();
    // Same bound as done/read: only the first slice hits GitHub inline.
    const syncExisting = existing.slice(0, REMOTE_SYNC_LIMIT);
    const deferredExisting = existing.slice(REMOTE_SYNC_LIMIT);
    let queued = 0;
    let firstError: string | null = null;
    if (token) {
      const remotes = await mapWithLimit(syncExisting, REMOTE_CONCURRENCY, (n) =>
        setSubscriptionIgnored(token, n.id, true)
      );
      const failures: { threadId: string; lastError: string }[] = [];
      for (const [idx, remote] of remotes.entries()) {
        if (remote.ok) continue;
        const n = syncExisting[idx] as (typeof syncExisting)[number];
        firstError ??= remote.reason ?? "unknown";
        failures.push({ threadId: n.id, lastError: remote.reason ?? "unknown" });
      }
      if (failures.length > 0) {
        await enqueueMany(
          db,
          failures.map((f) => ({ ...f, action: "unsubscribe" as const })),
          now
        );
        queued += failures.length;
      }
    } else {
      await enqueueMany(
        db,
        syncExisting.map((n) => ({
          threadId: n.id,
          action: "unsubscribe" as const,
          lastError: "auth",
        })),
        now
      );
      queued += syncExisting.length;
      firstError ??= "auth";
    }
    if (deferredExisting.length > 0) {
      await enqueueMany(
        db,
        deferredExisting.map((n) => ({
          threadId: n.id,
          action: "unsubscribe" as const,
          lastError: "deferred",
        })),
        now
      );
      queued += deferredExisting.length;
      firstError ??= "deferred";
    }
    if (queued > 0) {
      return NextResponse.json({
        updated: cleanIds.length,
        action,
        remote: "partial",
        queued,
        error: firstError ?? "unknown",
      });
    }
    return NextResponse.json({ updated: cleanIds.length, action });
  }

  if (action === "done") {
    return applyDone(db, cleanIds);
  }

  return applyRead(db, cleanIds);
}
