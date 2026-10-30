import { NextResponse } from "next/server";
import { nowMs } from "@/lib/clock";
import { notifications, repositories } from "@/db/schema";
import { formatDueDate, isDue } from "@/lib/digest";
import { formatSnoozeUntil, isSnoozed } from "@/lib/snooze";
import { isClosedItem, isMergedItem, matchAge, matchesTypeFilter, TYPE_FILTERS, type AgeFilter } from "@/lib/filters";
import { parsePaletteLimit } from "@/lib/view-state";
import { readSyncStatus } from "@/lib/sync";

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
  const limit = parsePaletteLimit(url.searchParams.get("limit"));
  const now = nowMs();

  const repos = await db.select().from(repositories);
  const reposById = new Map(repos.map((r) => [r.id, r]));
  const { lastSyncAt, stale } = await readSyncStatus(db, now);

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
    filtered = filtered.filter((n) =>
      matchesTypeFilter(n.reason, n.subjectType, typeFilter, {
        prMerged: (n.prMerged ?? 0) === 1,
        subjectState: n.subjectState ?? null,
      })
    );
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
    (ignore === "type" ||
      typeFilter === "all" ||
      matchesTypeFilter(n.reason, n.subjectType, typeFilter, {
        prMerged: (n.prMerged ?? 0) === 1,
        subjectState: n.subjectState ?? null,
      })) &&
    matchAge(n.createdAt, now, ageFilter);

  const placement = (n: (typeof rows)[number]): "main" | "quiet" => {
    if (n.isDone === 1) return "main";
    const repo = reposById.get(n.repositoryId);
    if (!repo) return "main";
    if (isSnoozed(repo.snoozedUntil, now)) return "quiet";
    return isDue(repo, now) ? "main" : "quiet";
  };

  const typeCounts = new Map<string, number>();
  let pullRequestCount = 0;
  let mergedCount = 0;
  let closedCount = 0;
  let totalMain = 0;
  for (const n of rows) {
    if (!matchBase(n, "type")) continue;
    if (placement(n) !== "main") continue;
    totalMain += 1;
    typeCounts.set(n.reason, (typeCounts.get(n.reason) ?? 0) + 1);
    if (n.subjectType === "PullRequest") pullRequestCount += 1;
    const prMerged = (n.prMerged ?? 0) === 1;
    const subjectState = n.subjectState ?? null;
    if (isMergedItem({ reason: n.reason, prMerged })) mergedCount += 1;
    if (isClosedItem({ reason: n.reason, prMerged, subjectState })) closedCount += 1;
  }
  const repoFacets = new Map<
    string,
    { main: number; quiet: number; pending: number; unread: number }
  >();
  for (const n of rows) {
    if (!matchBase(n, "repo")) continue;
    const entry = repoFacets.get(n.repositoryId) ?? {
      main: 0,
      quiet: 0,
      pending: 0,
      unread: 0,
    };
    entry[placement(n)] += 1;
    if (n.isDone === 0) entry.pending += 1;
    if (n.isRead === 0) entry.unread += 1;
    repoFacets.set(n.repositoryId, entry);
  }

  const facets = {
    types: TYPE_FILTERS.map((t) => ({
      value: t.value,
      label: t.label,
      count:
        t.value === "all"
          ? totalMain
          : t.value === "pull_request"
            ? pullRequestCount
            : t.value === "merged"
              ? mergedCount
              : t.value === "closed"
                ? closedCount
                : (typeCounts.get(t.value) ?? 0),
    })),
    repos: repos.map((r) => ({
      id: r.id,
      fullName: r.fullName,
      main: repoFacets.get(r.id)?.main ?? 0,
      quiet: repoFacets.get(r.id)?.quiet ?? 0,
      pending: repoFacets.get(r.id)?.pending ?? 0,
      unread: repoFacets.get(r.id)?.unread ?? 0,
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
        subjectType: n.subjectType ?? null,
        subjectState: n.subjectState ?? null,
        reason: n.reason,
        prMerged: (n.prMerged ?? 0) === 1,
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
      subjectType: n.subjectType ?? null,
      subjectState: n.subjectState ?? null,
      reason: n.reason,
      prMerged: (n.prMerged ?? 0) === 1,
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
    const items = entry.items as Array<{ isRead?: number }>;
    return {
      repositoryId: id,
      repositoryName: repo?.fullName ?? id,
      rhythm: repo?.rhythm ?? "weekly",
      nextDueAt: repo?.nextDueAt ?? null,
      nextDueLabel: formatDueDate(repo?.nextDueAt ?? null),
      pendingCount: items.length,
      unreadCount: items.filter((i) => (i.isRead ?? 0) === 0).length,
      items: stateFilter === "done" ? [] : [],
      isSnoozed: snoozed,
      snoozeLabel: formatSnoozeUntil(repo?.snoozedUntil ?? null, now),
    };
  });

  return NextResponse.json({ now, lastSyncAt, stale, mainFlow: limit !== null ? mainFlow.slice(0, limit) : mainFlow, collapsedSection, facets });
}
