import { NextResponse } from "next/server";
import { nowMs } from "@/lib/clock";
import { count, eq } from "drizzle-orm";
import { notifications, repositories } from "@/db/schema";
import { formatDueDate, isDue } from "@/lib/digest";
import { formatSnoozeUntil, isSnoozed } from "@/lib/snooze";

export const dynamic = "force-dynamic";

export async function GET() {
  const { db } = await import("@/db/client");
  const repos = await db.select().from(repositories);
  const now = nowMs();
  const counts = await db
    .select({ repositoryId: notifications.repositoryId, value: count() })
    .from(notifications)
    .where(eq(notifications.isDone, 0))
    .groupBy(notifications.repositoryId);
  const pendingByRepo = new Map(counts.map((c) => [c.repositoryId, c.value]));
  const result = [];
  for (const repo of repos) {
    const pendingCount = pendingByRepo.get(repo.id) ?? 0;
    const due = isDue(repo, now);
    result.push({
      id: repo.id,
      fullName: repo.fullName,
      ownership: repo.ownership,
      rhythm: repo.rhythm,
      lastPromotedAt: repo.lastPromotedAt,
      nextDueAt: repo.nextDueAt,
      nextDueLabel: formatDueDate(repo.nextDueAt),
      pendingCount,
      isDue: due,
      unreachable: repo.unreachable === 1,
      snoozedUntil: repo.snoozedUntil,
      isSnoozed: isSnoozed(repo.snoozedUntil, now),
      snoozeLabel: formatSnoozeUntil(repo.snoozedUntil, now),
    });
  }
  return NextResponse.json({ repositories: result });
}
