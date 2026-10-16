import { NextResponse } from "next/server";
import { notifications, repositories } from "@/db/schema";
import { formatDueDate, isDue } from "@/lib/digest";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const { db } = await import("@/db/client");
  const url = new URL(request.url);
  const repoFilter = url.searchParams.get("repo") || "all";
  const stateFilter = url.searchParams.get("state") || "unread";
  const now = Date.now();

  const repos = await db.select().from(repositories);
  const reposById = new Map(repos.map((r) => [r.id, r]));

  const rows = await db.select().from(notifications);
  const repoName = (id: string) => reposById.get(id)?.fullName ?? id;

  let filtered = rows.filter((n) => n.isDone === 0);
  if (stateFilter === "done") {
    filtered = rows.filter((n) => n.isDone === 1);
  } else if (stateFilter === "all") {
    filtered = rows.filter((n) => (repoFilter === "all" ? true : n.repositoryId === repoFilter));
  } else {
    filtered = rows.filter(
      (n) =>
        n.isDone === 0 &&
        (repoFilter === "all" ? true : n.repositoryId === repoFilter)
    );
  }
  if (stateFilter === "done" && repoFilter !== "all") {
    filtered = filtered.filter((n) => n.repositoryId === repoFilter);
  }

  filtered.sort((a, b) => b.createdAt - a.createdAt);

  const mainFlow: unknown[] = [];
  const collapsedByRepo = new Map<
    string,
    { repositoryId: string; items: unknown[] }
  >();

  for (const n of filtered) {
    if (n.isDone === 1) {
      mainFlow.push({
        id: n.id,
        repositoryId: n.repositoryId,
        repositoryName: repoName(n.repositoryId),
        subject: n.subject,
        reason: n.reason,
        createdAt: n.createdAt,
        isRead: n.isRead,
        isDone: n.isDone,
        sourceUrl: n.sourceUrl,
        due: true,
        dueLabel: null,
      });
      continue;
    }
    const repo = reposById.get(n.repositoryId);
    const due = repo ? isDue(repo, now) : true;
    const item = {
      id: n.id,
      repositoryId: n.repositoryId,
      repositoryName: repoName(n.repositoryId),
      subject: n.subject,
      reason: n.reason,
      createdAt: n.createdAt,
      isRead: n.isRead,
      isDone: n.isDone,
      sourceUrl: n.sourceUrl,
      due,
      dueLabel: repo && due && repo.rhythm !== "immediate" ? "Digest due" : null,
    };
    if (due) {
      mainFlow.push(item);
    } else {
      const entry = collapsedByRepo.get(n.repositoryId) ?? {
        repositoryId: n.repositoryId,
        items: [],
      };
      (entry.items as unknown[]).push(item);
      collapsedByRepo.set(n.repositoryId, entry);
    }
  }

  const collapsedSection = [...collapsedByRepo.entries()].map(([id, entry]) => {
    const repo = reposById.get(id);
    return {
      repositoryId: id,
      repositoryName: repo?.fullName ?? id,
      rhythm: repo?.rhythm ?? "weekly",
      nextDueAt: repo?.nextDueAt ?? null,
      nextDueLabel: formatDueDate(repo?.nextDueAt ?? null),
      pendingCount: (entry.items as unknown[]).length,
      items: stateFilter === "done" ? [] : [],
    };
  });

  return NextResponse.json({ now, mainFlow, collapsedSection });
}
