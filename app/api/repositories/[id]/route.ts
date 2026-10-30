import { NextResponse } from "next/server";
import { nowMs } from "@/lib/clock";
import { and, eq } from "drizzle-orm";
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

  // Write only the supplied fields (plus rhythm's dependent due-date
  // fields) so concurrent PATCHes cannot undo each other.
  const update: {
    rhythm?: Rhythm;
    nextDueAt?: number | null;
    lastPromotedAt?: number | null;
    snoozedUntil?: number | null;
    pinned?: number;
  } = {};
  if (rhythm !== undefined) update.rhythm = rhythm as Rhythm;
  if (rhythmChanged) {
    update.nextDueAt = nextDueAt;
    if (nextRhythm === "immediate") update.lastPromotedAt = now;
  }
  if (snoozedUntil !== undefined) {
    update.snoozedUntil = snoozedUntil as number | null;
  }
  if (pinned !== undefined) update.pinned = pinned ? 1 : 0;

  // A rhythm change writes only when the row still carries the rhythm
  // this request read. A concurrent rhythm PATCH wins once; the loser
  // gets a 409 instead of silently undoing the winner.
  const updated = await db
    .update(repositories)
    .set(update)
    .where(
      rhythm === undefined
        ? eq(repositories.id, id)
        : and(eq(repositories.id, id), eq(repositories.rhythm, repo.rhythm))
    )
    .returning();
  if (rhythm !== undefined && updated.length === 0) {
    return NextResponse.json(
      { error: "repository changed; retry" },
      { status: 409 }
    );
  }
  // The response is the row the database now holds, not the values this
  // request computed from the earlier read: a concurrent PATCH that won
  // in between belongs in the answer.
  const updatedRepo = updated[0];
  if (!updatedRepo) {
    return NextResponse.json({ error: "unknown repository" }, { status: 404 });
  }

  return NextResponse.json({
    id: updatedRepo.id,
    fullName: updatedRepo.fullName,
    ownership: updatedRepo.ownership,
    rhythm: updatedRepo.rhythm,
    lastPromotedAt: updatedRepo.lastPromotedAt,
    nextDueAt: updatedRepo.nextDueAt,
    nextDueLabel: formatDueDate(updatedRepo.nextDueAt),
    snoozedUntil: updatedRepo.snoozedUntil,
    isSnoozed: isSnoozed(updatedRepo.snoozedUntil, now),
    snoozeLabel: formatSnoozeUntil(updatedRepo.snoozedUntil, now),
    pinned: updatedRepo.pinned === 1,
  });
}
