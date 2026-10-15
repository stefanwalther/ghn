import { NextResponse } from "next/server";
import { inArray } from "drizzle-orm";
import { notifications } from "@/db/schema";
import { validateBulkInput } from "@/lib/bulk";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const { db } = await import("@/db/client");
  const body = await request.json().catch(() => null);
  const checked = validateBulkInput(body?.ids, body?.action);
  if (!checked.ok) {
    return NextResponse.json(
      { error: "ids must be non-empty and action one of done, unread, read" },
      { status: checked.status }
    );
  }
  const { ids: cleanIds, action } = checked;

  const existing = await db
    .select({ id: notifications.id })
    .from(notifications)
    .where(inArray(notifications.id, cleanIds));
  if (existing.length !== cleanIds.length) {
    return NextResponse.json({ error: "unknown notification id" }, { status: 422 });
  }

  if (action === "done") {
    await db
      .update(notifications)
      .set({ isDone: 1 })
      .where(inArray(notifications.id, cleanIds));
  } else if (action === "unread") {
    await db
      .update(notifications)
      .set({ isDone: 0, isRead: 0 })
      .where(inArray(notifications.id, cleanIds));
  } else {
    await db
      .update(notifications)
      .set({ isRead: 1 })
      .where(inArray(notifications.id, cleanIds));
  }

  return NextResponse.json({ updated: cleanIds.length, action });
}
