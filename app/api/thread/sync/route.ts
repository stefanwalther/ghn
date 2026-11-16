import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { notifications } from "@/db/schema";
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
  const snapshot = await resolveSubject(token, thread);
  const changed = (row.githubUpdatedAt ?? 0) < thread.updatedAt;
  const subjectState = snapshot.ok ? (snapshot.state ?? row.subjectState) : row.subjectState;
  const prMerged = snapshot.ok ? snapshot.merged === true : row.prMerged === 1;
  const sourceUrl = snapshot.ok && changed ? snapshot.url : row.sourceUrl;
  const isRead = thread.unread ? 0 : row.localUnread === 1 ? 0 : 1;
  await db
    .update(notifications)
    .set({
      subject: thread.subjectTitle.slice(0, 200) || "Untitled",
      subjectType: thread.subjectType,
      subjectState,
      reason: thread.reason,
      createdAt: thread.updatedAt,
      githubUpdatedAt: thread.updatedAt,
      isRead,
      prMerged: prMerged ? 1 : 0,
      sourceUrl,
    })
    .where(eq(notifications.id, id));
  return NextResponse.json({
    gone: false,
    item: {
      id: thread.id,
      subject: thread.subjectTitle.slice(0, 200) || "Untitled",
      subjectType: thread.subjectType,
      subjectState,
      reason: thread.reason,
      prMerged,
      createdAt: thread.updatedAt,
      isRead,
      sourceUrl,
    },
  });
}
