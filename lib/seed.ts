import { and, eq } from "drizzle-orm";
import { mutedSubjects, notifications, repositories } from "@/db/schema";
import type { Db } from "@/db/client";
import { computeNextDueAt } from "@/lib/digest";
import { nowMs } from "@/lib/clock";
import { buildSeedNotifications, SEED_REPOS } from "@/lib/seed-data";

/**
 * Loads the shared dataset into the database.
 *
 * The dataset itself lives in `lib/seed-data.ts`, because the GitHub stand-in
 * serves the same one. Two copies would drift, and a drifted copy is what
 * makes a sync destroy the seeded data.
 */
export async function seedDatabase(
  now = nowMs(),
  injectedDb?: Db
): Promise<{ repositories: number; notifications: number }> {
  const db = injectedDb ?? (await import("@/db/client")).db;
  await db.delete(notifications);
  await db.delete(repositories);

  const createdAt = now;
  for (const repo of SEED_REPOS) {
    const nextDueAt =
      repo.rhythm === "immediate"
        ? null
        : computeNextDueAt(repo.rhythm, now - 2 * 24 * 60 * 60 * 1000);
    await db.insert(repositories).values({
      id: repo.id,
      fullName: repo.fullName,
      ownership: repo.ownership,
      rhythm: repo.rhythm,
      lastPromotedAt:
        repo.rhythm === "immediate" ? null : now - 2 * 24 * 60 * 60 * 1000,
      nextDueAt,
      createdAt,
    });
  }

  const items = buildSeedNotifications(now).map((item) => ({
    id: item.id,
    repositoryId: item.repositoryId,
    subject: item.subject.slice(0, 200),
    subjectType: item.subjectType,
    subjectState: item.subjectState,
    prMerged: item.prMerged ? 1 : 0,
    reason: item.reason,
    createdAt: item.createdAt,
    isRead: item.isRead ? 1 : 0,
    isDone: 0,
    sourceUrl: item.sourceUrl,
  }));

  if (items.length > 0) await db.insert(notifications).values(items);

  const muted = await db.select().from(mutedSubjects);
  for (const m of muted) {
    await db
      .update(notifications)
      .set({ isDone: 1 })
      .where(
        and(
          eq(notifications.repositoryId, m.repositoryId),
          eq(notifications.subject, m.subject)
        )
      );
  }

  return { repositories: SEED_REPOS.length, notifications: items.length };
}
