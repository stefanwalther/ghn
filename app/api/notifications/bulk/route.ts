import { NextResponse } from "next/server";
import { inArray } from "drizzle-orm";
import { mutedSubjects, notifications, writebackQueue } from "@/db/schema";
import { validateBulkInput } from "@/lib/bulk";
import {
  getStoredToken,
  markThreadDone,
  markThreadRead,
  setSubscriptionIgnored,
  type GhResult,
} from "@/lib/github";
import { enqueueWriteback, type WritebackAction } from "@/lib/queue";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const { db } = await import("@/db/client");
  const body = await request.json().catch(() => null);
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

  const now = Date.now();

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
      for (const n of existing) {
        const remote = await setSubscriptionIgnored(token, n.id, true);
        if (!remote.ok) {
          await enqueueWriteback(db, n.id, "unsubscribe", remote.reason ?? "unknown", now);
          queued += 1;
        }
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

  const remoteAction = action as WritebackAction;
  const applyRemote =
    action === "done" ? markThreadDone : markThreadRead;
  const token = await getStoredToken();
  // Local-first: hide immediately like unsubscribe does, then retry remote
  // via the writeback queue. Previously only remote-success rows were marked
  // done/read, so an auth or network failure silently resurrected the item
  // on the next load() with no error shown.
  if (action === "done") {
    await db
      .update(notifications)
      .set({ isDone: 1, localUnread: 0 })
      .where(inArray(notifications.id, cleanIds));
  } else {
    await db
      .update(notifications)
      .set({ isRead: 1, localUnread: 0 })
      .where(inArray(notifications.id, cleanIds));
  }
  let queued = 0;
  let firstError: GhResult<void> | null = null;
  for (const id of cleanIds) {
    const remote = token
      ? await applyRemote(token, id)
      : ({ ok: false, reason: "auth" } as GhResult<void>);
    if (!remote.ok) {
      firstError = remote;
      await enqueueWriteback(db, id, remoteAction, remote.reason ?? "unknown", now);
      queued += 1;
    }
  }
  if (queued > 0) {
    return NextResponse.json({
      updated: cleanIds.length,
      action,
      remote: "partial",
      queued,
      error: firstError?.reason ?? "unknown",
    });
  }
  return NextResponse.json({ updated: cleanIds.length, action });
}
