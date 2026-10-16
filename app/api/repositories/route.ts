import { NextResponse } from "next/server";
import { and, count, eq } from "drizzle-orm";
import { notifications, repositories } from "@/db/schema";
import { formatDueDate, isDue } from "@/lib/digest";
import { formatSnoozeUntil, isSnoozed } from "@/lib/snooze";

export const dynamic = "force-dynamic";

export async function GET() {
  const { db } = await import("@/db/client");
  const repos = await db.select().from(repositories);
  const now = Date.now();
  const result = [];
  for (const repo of repos) {
    const [{ value: pendingCount }] = await db
      .select({ value: count() })
      .from(notifications)
      .where(
        and(
          eq(notifications.repositoryId, repo.id),
          eq(notifications.isDone, 0)
        )
      );
    const due = isDue(repo, now);
    result.push({
      id: repo.id,
      fullName: repo.fullName,
      ownership: repo.ownership,
      rhythm: repo.rhythm,
      lastPromotedAt: repo.lastPromotedAt,
      nextDueAt: repo.nextDueAt,
      nextDueLabel: formatDueDate(repo.nextDueAt),
      pendingCount: pendingCount ?? 0,
      isDue: due,
      snoozedUntil: repo.snoozedUntil,
      isSnoozed: isSnoozed(repo.snoozedUntil, now),
      snoozeLabel: formatSnoozeUntil(repo.snoozedUntil, now),
    });
  }
  return NextResponse.json({ repositories: result });
}
