import { NextResponse } from "next/server";
import { notifications, repositories } from "@/db/schema";
import { formatDueDate, isDue } from "@/lib/digest";
import { formatSnoozeUntil, isSnoozed } from "@/lib/snooze";
import { matchAge, TYPE_FILTERS, type AgeFilter } from "@/lib/filters";
import { readSyncState } from "@/lib/sync";

export const dynamic = "force-dynamic";

const AGES = ["all", "24h", "48h", "7d", "14d", "30d", "year", "older"] as const;

export async function GET(request: Request) {
  const { db } = await import("@/db/client");
  const url = new URL(request.url);
  const repoFilter = url.searchParams.get("repo") || "all";
  const stateFilter = url.searchParams.get("state") || "unread";
  const typeFilter = url.searchParams.get("type") || "all";
  const rawAge = url.searchParams.get("age") || "all";
  const ageFilter: AgeFilter = (AGES as readonly string[]).includes(rawAge)
    ? (rawAge as AgeFilter)
    : "all";
  const now = Date.now();

  const repos = await db.select().from(repositories);
  const reposById = new Map(repos.map((r) => [r.id, r]));
  const lastSyncRaw = await readSyncState(db, "lastSyncAt");
  const pollRaw = await readSyncState(db, "pollIntervalSecs");
  const lastSyncAt = lastSyncRaw ? Number.parseInt(lastSyncRaw, 10) : null;
  const pollIntervalSecs = Number.parseInt(pollRaw ?? "60", 10) || 60;
  const stale = lastSyncAt !== null && now - lastSyncAt > 2 * pollIntervalSecs * 1000;

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
  if (typeFilter !== "all") {
    filtered = filtered.filter((n) => n.reason === typeFilter);
  }
  if (ageFilter !== "all") {
    filtered = filtered.filter((n) => matchAge(n.createdAt, now, ageFilter));
  }

  const matchState = (isDone: number) =>
    stateFilter === "done" ? isDone === 1 : stateFilter === "all" ? true : isDone === 0;
  const matchBase = (
    n: (typeof rows)[number],
    ignore: "type" | "repo" | "none"
  ) =>
    matchState(n.isDone) &&
    (ignore === "repo" || repoFilter === "all" || n.repositoryId === repoFilter) &&
    (ignore === "type" || typeFilter === "all" || n.reason === typeFilter) &&
    matchAge(n.createdAt, now, ageFilter);

  const placement = (n: (typeof rows)[number]): "main" | "quiet" => {
    if (n.isDone === 1) return "main";
    const repo = reposById.get(n.repositoryId);
    if (!repo) return "main";
    if (isSnoozed(repo.snoozedUntil, now)) return "quiet";
    return isDue(repo, now) ? "main" : "quiet";
  };

  const typeCounts = new Map<string, number>();
  for (const n of rows) {
    if (!matchBase(n, "type")) continue;
    if (placement(n) !== "main") continue;
    typeCounts.set(n.reason, (typeCounts.get(n.reason) ?? 0) + 1);
  }
  const repoFacets = new Map<string, { main: number; quiet: number }>();
  for (const n of rows) {
    if (!matchBase(n, "repo")) continue;
    const entry = repoFacets.get(n.repositoryId) ?? { main: 0, quiet: 0 };
    entry[placement(n)] += 1;
    repoFacets.set(n.repositoryId, entry);
  }

  const facets = {
    types: TYPE_FILTERS.filter((t) => t.value !== "all").map((t) => ({
      value: t.value,
      label: t.label,
      count: typeCounts.get(t.value) ?? 0,
    })),
    repos: repos.map((r) => ({
      id: r.id,
      fullName: r.fullName,
      main: repoFacets.get(r.id)?.main ?? 0,
      quiet: repoFacets.get(r.id)?.quiet ?? 0,
      isSnoozed: isSnoozed(r.snoozedUntil, now),
    })),
  };

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
        localUnread: n.localUnread === 1,
        sourceUrl: n.sourceUrl,
        due: true,
        dueLabel: null,
      });
      continue;
    }
    const repo = reposById.get(n.repositoryId);
    const snoozed = repo ? isSnoozed(repo.snoozedUntil, now) : false;
    const due = (repo ? isDue(repo, now) : true) && !snoozed;
    const justPromoted =
      !!repo &&
      repo.rhythm === "immediate" &&
      repo.lastPromotedAt != null &&
      now - repo.lastPromotedAt < 24 * 3600 * 1000;
    const item = {
      id: n.id,
      repositoryId: n.repositoryId,
      repositoryName: repoName(n.repositoryId),
      subject: n.subject,
      reason: n.reason,
      createdAt: n.createdAt,
      isRead: n.isRead,
      isDone: n.isDone,
      localUnread: n.localUnread === 1,
      sourceUrl: n.sourceUrl,
      due,
      dueLabel: repo && due && (repo.rhythm !== "immediate" || justPromoted) ? "Digest due" : null,
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
    const snoozed = repo ? isSnoozed(repo.snoozedUntil, now) : false;
    return {
      repositoryId: id,
      repositoryName: repo?.fullName ?? id,
      rhythm: repo?.rhythm ?? "weekly",
      nextDueAt: repo?.nextDueAt ?? null,
      nextDueLabel: formatDueDate(repo?.nextDueAt ?? null),
      pendingCount: (entry.items as unknown[]).length,
      items: stateFilter === "done" ? [] : [],
      isSnoozed: snoozed,
      snoozeLabel: formatSnoozeUntil(repo?.snoozedUntil ?? null, now),
    };
  });

  return NextResponse.json({ now, lastSyncAt, stale, mainFlow, collapsedSection, facets });
}
