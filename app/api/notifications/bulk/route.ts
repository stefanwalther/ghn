import { NextResponse } from "next/server";
import { inArray } from "drizzle-orm";
import { mutedSubjects, notifications } from "@/db/schema";
import { validateBulkInput } from "@/lib/bulk";
import {
  getStoredToken,
  markThreadDone,
  markThreadRead,
  setSubscriptionIgnored,
  type GhResult,
} from "@/lib/github";
import { enqueueWriteback, type WritebackAction } from "@/lib/queue";
import { mapWithLimit } from "@/lib/sync";

export const dynamic = "force-dynamic";

// Remote write-back runs with bounded concurrency: a large selection used to
// fan out one GitHub call at a time, holding the request (and the UI's busy
// state) for minutes, with one stalled call hanging it forever.
const REMOTE_CONCURRENCY = 8;

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
      const pairList = [...pairs.values()];
      const remotes = await mapWithLimit(pairList, REMOTE_CONCURRENCY, (n) =>
        setSubscriptionIgnored(token, n.id, true)
      );
      for (const [idx, remote] of remotes.entries()) {
        if (remote.ok) continue;
        const n = pairList[idx] as (typeof pairList)[number];
        await enqueueWriteback(db, n.id, "unsubscribe", remote.reason ?? "unknown", now);
        queued += 1;
      }
    } else {
      for (const n of pairs.values()) {
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
  const remotes = await mapWithLimit(cleanIds, REMOTE_CONCURRENCY, (id) =>
    token
      ? applyRemote(token, id)
      : Promise.resolve({ ok: false, reason: "auth" } as GhResult<void>)
  );
  const succeeded: string[] = [];
  let queued = 0;
  let firstError: GhResult<void> | null = null;
  for (const [idx, remote] of remotes.entries()) {
    const id = cleanIds[idx] as string;
    if (remote.ok) {
      succeeded.push(id);
    } else {
      firstError = remote;
      await enqueueWriteback(db, id, remoteAction, remote.reason ?? "unknown", now);
      queued += 1;
    }
  }
  if (succeeded.length > 0) {
    if (action === "done") {
      await db
        .update(notifications)
        .set({ isDone: 1, localUnread: 0 })
        .where(inArray(notifications.id, succeeded));
    } else {
      await db
        .update(notifications)
        .set({ isRead: 1, localUnread: 0 })
        .where(inArray(notifications.id, succeeded));
    }
  }
  if (queued > 0) {
    return NextResponse.json({
      updated: succeeded.length,
      action,
      remote: "partial",
      queued,
      error: firstError?.reason ?? "unknown",
    });
  }
  return NextResponse.json({ updated: cleanIds.length, action });
}
