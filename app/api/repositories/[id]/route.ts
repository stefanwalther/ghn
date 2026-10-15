import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { repositories } from "@/db/schema";
import { computeNextDueAt, formatDueDate, type Rhythm } from "@/lib/digest";

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
  if (typeof rhythm !== "string" || !(RHYTHMS as string[]).includes(rhythm)) {
    return NextResponse.json(
      { error: "`rhythm` must be `immediate`, `weekly`, `biweekly`, or `monthly`" },
      { status: 400 }
    );
  }
  const rows = await db.select().from(repositories).where(eq(repositories.id, id));
  const repo = rows[0];
  if (!repo) return NextResponse.json({ error: "unknown repository" }, { status: 404 });

  const now = Date.now();
  const nextDueAt =
    rhythm === "immediate" ? null : computeNextDueAt(rhythm as Rhythm, now);
  const lastPromotedAt = rhythm === "immediate" ? now : repo.lastPromotedAt;

  await db
    .update(repositories)
    .set({ rhythm: rhythm as Rhythm, nextDueAt, lastPromotedAt })
    .where(eq(repositories.id, id));

  return NextResponse.json({
    id,
    fullName: repo.fullName,
    ownership: repo.ownership,
    rhythm,
    lastPromotedAt,
    nextDueAt,
    nextDueLabel: formatDueDate(nextDueAt),
  });
}
