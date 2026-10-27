import { NextResponse } from "next/server";
import { nowMs } from "@/lib/clock";
import { eq } from "drizzle-orm";
import { repositories } from "@/db/schema";
import { computeNextDueAt, formatDueDate, type Rhythm } from "@/lib/digest";
import { formatSnoozeUntil, isSnoozed } from "@/lib/snooze";

const RHYTHMS: Rhythm[] = ["immediate", "weekly", "biweekly", "monthly"];

export const dynamic = "force-dynamic";

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { db } = await import("@/db/client");
  const { id } = await params;
  const body = await request.json().catch(() => null);
  const rhythm: unknown = body?.rhythm;
  const snoozedUntil: unknown = body?.snoozedUntil;
  const pinned: unknown = body?.pinned;
  const now = nowMs();
  if (rhythm !== undefined && (typeof rhythm !== "string" || !(RHYTHMS as string[]).includes(rhythm))) {
    return NextResponse.json(
      { error: "`rhythm` must be `immediate`, `weekly`, `biweekly`, or `monthly`" },
      { status: 400 }
    );
  }
  if (typeof pinned !== "undefined" && typeof pinned !== "boolean") {
    return NextResponse.json(
      { error: "`pinned` must be a boolean" },
      { status: 400 }
    );
  }
  if (
    snoozedUntil !== undefined &&
    snoozedUntil !== null &&
    (typeof snoozedUntil !== "number" || snoozedUntil <= now)
  ) {
    return NextResponse.json(
      { error: "`snoozedUntil` must be null or a future timestamp" },
      { status: 400 }
    );
  }
  if (rhythm === undefined && snoozedUntil === undefined && pinned === undefined) {
    return NextResponse.json({ error: "nothing to update" }, { status: 400 });
  }
  const rows = await db.select().from(repositories).where(eq(repositories.id, id));
  const repo = rows[0];
  if (!repo) return NextResponse.json({ error: "unknown repository" }, { status: 404 });

  const rhythmChanged = rhythm !== undefined && rhythm !== repo.rhythm;
  const nextRhythm = (rhythm as Rhythm) ?? repo.rhythm;
  const nextDueAt = rhythmChanged
    ? nextRhythm === "immediate"
      ? null
      : computeNextDueAt(nextRhythm, now)
    : repo.nextDueAt;
  const lastPromotedAt =
    rhythmChanged && nextRhythm === "immediate" ? now : repo.lastPromotedAt;
  const nextSnoozedUntil =
    snoozedUntil === undefined ? repo.snoozedUntil : (snoozedUntil as number | null);
  const nextPinned = pinned === undefined ? repo.pinned : (pinned ? 1 : 0);

  await db
    .update(repositories)
    .set({
      rhythm: nextRhythm,
      nextDueAt,
      lastPromotedAt,
      snoozedUntil: nextSnoozedUntil,
      pinned: nextPinned,
    })
    .where(eq(repositories.id, id));

  return NextResponse.json({
    id,
    fullName: repo.fullName,
    ownership: repo.ownership,
    rhythm: nextRhythm,
    lastPromotedAt,
    nextDueAt,
    nextDueLabel: formatDueDate(nextDueAt),
    snoozedUntil: nextSnoozedUntil,
    isSnoozed: isSnoozed(nextSnoozedUntil, now),
    snoozeLabel: formatSnoozeUntil(nextSnoozedUntil, now),
    pinned: nextPinned === 1,
  });
}
