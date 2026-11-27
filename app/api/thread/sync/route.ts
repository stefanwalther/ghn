import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { notifications } from "@/db/schema";
import { nowMs } from "@/lib/clock";
import { recordSubjectResolution } from "@/lib/subject-retries";
import {
  fetchThread,
  getStoredToken,
  resolveSubject,
} from "@/lib/github";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const { db } = await import("@/db/client");
  const body = await request.json().catch(() => null);
  const id = typeof body?.id === "string" ? body.id : null;
  if (!id) {
    return NextResponse.json({ error: "missing id" }, { status: 400 });
  }
  const rows = await db.select().from(notifications).where(eq(notifications.id, id));
  const row = rows[0];
  if (!row) {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }
  const token = await getStoredToken();
  if (!token) {
    return NextResponse.json({ error: "auth", retryable: true }, { status: 503 });
  }
  const fetched = await fetchThread(token, id);
  if (!fetched.ok || !fetched.data) {
    if (fetched.status === 404) {
      await db.update(notifications).set({ isDone: 1 }).where(eq(notifications.id, id));
      return NextResponse.json({ gone: true, id });
    }
    return NextResponse.json(
      { error: fetched.reason ?? "unknown", retryable: true },
      { status: 502 }
    );
  }
  const thread = fetched.data;
  const noSubjectUrl = !thread.subjectApiUrl.trim();
  const snapshot = noSubjectUrl ? null : await resolveSubject(token, thread);
  const isRead = thread.unread ? 0 : row.localUnread === 1 ? 0 : 1;
  const [updated] = await db
    .update(notifications)
    .set({
      subject: thread.subjectTitle.slice(0, 200) || "Untitled",
      subjectType: thread.subjectType,
      reason: thread.reason,
      createdAt: thread.updatedAt,
      isRead,
      ...(noSubjectUrl ? { githubUpdatedAt: thread.updatedAt } : {}),
      ...(snapshot?.ok ? {
        githubUpdatedAt: thread.updatedAt,
        subjectState: snapshot.state ?? row.subjectState,
        prMerged: thread.subjectType === "PullRequest" && snapshot.merged === true ? 1 : 0,
        sourceUrl: snapshot.url,
      } : {}),
    })
    .where(eq(notifications.id, id))
    .returning({
      subjectState: notifications.subjectState,
      prMerged: notifications.prMerged,
      sourceUrl: notifications.sourceUrl,
    });
  if (!updated) {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }
  await recordSubjectResolution(db, thread, noSubjectUrl || Boolean(snapshot?.ok), nowMs());
  return NextResponse.json({
    gone: false,
    item: {
      id: thread.id,
      subject: thread.subjectTitle.slice(0, 200) || "Untitled",
      subjectType: thread.subjectType,
      subjectState: updated.subjectState,
      reason: thread.reason,
      prMerged: updated.prMerged === 1,
      createdAt: thread.updatedAt,
      isRead,
      sourceUrl: updated.sourceUrl,
    },
  });
}
