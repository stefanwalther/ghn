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
import { enqueueWriteback } from "@/lib/queue";
import { mapWithLimit } from "@/lib/sync";
import type { Db } from "@/db/client";

export const dynamic = "force-dynamic";

// Remote write-back runs with bounded concurrency: a large selection used to
// fan out one GitHub call at a time, holding the request (and the UI's busy
// state) for minutes, with one stalled call hanging it forever.
const REMOTE_CONCURRENCY = 8;

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
  const remotes = await mapWithLimit(cleanIds, REMOTE_CONCURRENCY, (id) =>
    token
      ? markThreadDone(token, id)
      : Promise.resolve({ ok: false, reason: "auth" } as GhResult<void>)
  );
  let queued = 0;
  let firstError: GhResult<void> | null = null;
  for (const [idx, remote] of remotes.entries()) {
    const id = cleanIds[idx] as string;
    if (!remote.ok) {
      firstError ??= remote;
      await enqueueWriteback(db, id, "done", remote.reason ?? "unknown", now);
      queued += 1;
    }
  }
  const base = { updated: cleanIds.length, action: "done" as const };
  const extra =
    repositoryId !== undefined ? { repositoryId } : {};
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
  const remotes = await mapWithLimit(cleanIds, REMOTE_CONCURRENCY, (id) =>
    token
      ? markThreadRead(token, id)
      : Promise.resolve({ ok: false, reason: "auth" } as GhResult<void>)
  );
  let queued = 0;
  let firstError: GhResult<void> | null = null;
  for (const [idx, remote] of remotes.entries()) {
    const id = cleanIds[idx] as string;
    if (!remote.ok) {
      firstError ??= remote;
      await enqueueWriteback(db, id, "read", remote.reason ?? "unknown", now);
      queued += 1;
    }
  }
  const base = { updated: cleanIds.length, action: "read" as const };
  const extra =
    repositoryId !== undefined ? { repositoryId } : {};
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
