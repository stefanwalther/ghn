import { and, eq } from "drizzle-orm";
import { mutedSubjects, notifications, repositories } from "@/db/schema";
import type { Db } from "@/db/client";
import { computeNextDueAt, type Rhythm } from "@/lib/digest";

interface SeedRepo {
  id: string;
  fullName: string;
  ownership: "owned" | "watched";
  rhythm: Rhythm;
}

const REPOS: SeedRepo[] = [
  { id: "acme-web", fullName: "acme/web", ownership: "owned", rhythm: "immediate" },
  { id: "acme-api", fullName: "acme/api", ownership: "owned", rhythm: "immediate" },
  { id: "acme-mobile", fullName: "acme/mobile", ownership: "owned", rhythm: "immediate" },
  { id: "vendor-slow-dep", fullName: "vendor/slow-dep", ownership: "watched", rhythm: "weekly" },
  { id: "vendor-ui-kit", fullName: "vendor/ui-kit", ownership: "watched", rhythm: "weekly" },
  { id: "oss-router", fullName: "oss/router", ownership: "watched", rhythm: "weekly" },
  { id: "oss-bundler", fullName: "oss/bundler", ownership: "watched", rhythm: "biweekly" },
  { id: "oss-linter", fullName: "oss/linter", ownership: "watched", rhythm: "biweekly" },
  { id: "vendor-analytics", fullName: "vendor/analytics", ownership: "watched", rhythm: "monthly" },
  { id: "oss-docs", fullName: "oss/docs", ownership: "watched", rhythm: "monthly" },
];

const SUBJECTS = [
  "Fix flaky login redirect",
  "Bump dependency range",
  "Add empty state for inbox",
  "CI failed on main",
  "Review requested on auth refactor",
  "Docs update for digest settings",
  "Handle rate-limit retry",
  "Dark mode contrast fix",
  "Keyboard focus audit",
  "Weekly digest summary",
  "Release pipeline failed on main",
  "v2.4.0 released",
  "chore(deps): bump sonner from 2.0.7 to 2.0.8 (#818)",
  "chore(deps): bump postgres from 3.4.7 to 3.4.9 (#819)",
];

const REASONS = [
  "mention",
  "review_requested",
  "action_failed",
  "ci_failed",
  "release",
  "merged",
  "assign",
  "subscribed",
] as const;

function seededRandom(seed: number): () => number {
  let s = seed;
  return () => {
    s = (s * 1103515245 + 12345) % 2147483648;
    return s / 2147483648;
  };
}

export async function seedDatabase(
  now = Date.now(),
  injectedDb?: Db
): Promise<{ repositories: number; notifications: number }> {
  const db = injectedDb ?? (await import("@/db/client")).db;
  const rand = seededRandom(42);
  await db.delete(notifications);
  await db.delete(repositories);

  const createdAt = now;
  for (const repo of REPOS) {
    const nextDueAt =
      repo.rhythm === "immediate" ? null : computeNextDueAt(repo.rhythm, now - 2 * 24 * 60 * 60 * 1000);
    await db.insert(repositories).values({
      id: repo.id,
      fullName: repo.fullName,
      ownership: repo.ownership,
      rhythm: repo.rhythm,
      lastPromotedAt: repo.rhythm === "immediate" ? null : now - 2 * 24 * 60 * 60 * 1000,
      nextDueAt,
      createdAt,
    });
  }

  const items: (typeof notifications.$inferInsert)[] = [];
  for (let i = 0; i < 200; i++) {
    const repo = REPOS[Math.floor(rand() * REPOS.length)];
    const subject = SUBJECTS[i % SUBJECTS.length];
    if (!subject) continue;
    const reason = REASONS[i % REASONS.length] ?? "subscribed";
    const roll = rand();
    const ageDays =
      roll < 0.6
        ? Math.floor(rand() * 30)
        : roll < 0.85
          ? 30 + Math.floor(rand() * 300)
          : 366 + Math.floor(rand() * 200);
    const created = now - ageDays * 24 * 60 * 60 * 1000 - i * 60 * 1000;
    const isRead = rand() > 0.7 ? 1 : 0;
    items.push({
      id: `n_${String(i + 1).padStart(3, "0")}`,
      repositoryId: repo.id,
      subject: subject.slice(0, 200),
      reason,
      createdAt: created,
      isRead,
      isDone: 0,
      sourceUrl: `https://github.com/${repo.fullName}/pull/${(i % 80) + 1}#discussion_r${i + 1}`,
    });
  }
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
  return { repositories: REPOS.length, notifications: items.length };
}
