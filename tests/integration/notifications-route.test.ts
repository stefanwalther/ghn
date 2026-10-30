import { beforeEach, describe, expect, test, vi } from "vitest";
import { eq, inArray } from "drizzle-orm";
import { db } from "../support/db-client.node";
import { seedTestDataset } from "../support/fixtures";
import { withEnv } from "../support/test-env";
import { notifications, repositories, syncState } from "@/db/schema";
import { writeSyncState } from "@/lib/sync";
import { buildSeedNotifications } from "@/lib/seed-data";

vi.mock("@/db/client", async () => {
  const mod = await import("../support/db-client.node");
  return { db: mod.db };
});

/**
 * `GET /api/notifications` against the seeded dataset.
 *
 * The dataset is deterministic, so the counts below are exact. They were
 * derived from `lib/seed-data.ts` and verified against the route.
 */

const NOW = Date.parse("2026-01-15T12:00:00Z");

interface InboxItem {
  id: string;
  repositoryId: string;
  repositoryName: string;
  subject: string;
  subjectType: string | null;
  subjectState: string | null;
  reason: string;
  prMerged: boolean;
  createdAt: number;
  isRead: number;
  isDone: number;
  localUnread: boolean;
  sourceUrl: string;
  due: boolean;
  dueLabel: string | null;
}

interface TypeFacet {
  value: string;
  label: string;
  count: number;
}

interface RepoFacet {
  id: string;
  fullName: string;
  main: number;
  quiet: number;
  pending?: number;
  unread?: number;
  isSnoozed: boolean;
}

interface CollapsedGroup {
  repositoryId: string;
  repositoryName: string;
  rhythm: string;
  nextDueAt: number | null;
  nextDueLabel: string;
  pendingCount: number;
  unreadCount?: number;
  items: unknown[];
  isSnoozed: boolean;
  snoozeLabel: string;
}

interface InboxResponse {
  now: number;
  lastSyncAt: number | null;
  stale: boolean;
  mainFlow: InboxItem[];
  collapsedSection: CollapsedGroup[];
  facets: { types: TypeFacet[]; repos: RepoFacet[] };
}

async function load(query = ""): Promise<InboxResponse> {
  const { GET } = await import("@/app/api/notifications/route");
  const res = await GET(new Request(`http://localhost/api/notifications${query}`));
  expect(res.status).toBe(200);
  return (await res.json()) as InboxResponse;
}

function typeCount(facets: InboxResponse["facets"], value: string): number {
  const facet = facets.types.find((t) => t.value === value);
  if (!facet) throw new Error(`no type facet for ${value}`);
  return facet.count;
}

function repoFacet(facets: InboxResponse["facets"], id: string): RepoFacet {
  const facet = facets.repos.find((r) => r.id === id);
  if (!facet) throw new Error(`no repo facet for ${id}`);
  return facet;
}

beforeEach(async () => {
  const restore = withEnv({ GHN_NOW: String(NOW) });
  try {
    await db.delete(notifications);
    await db.delete(repositories);
    // The sync state carries the last sync instant and the stale flag, so
    // it has to be cleared as well. Otherwise a check that writes it leaks
    // into every later check and the file depends on the order it runs in.
    await db.delete(syncState);
    await seedTestDataset(db, NOW);
  } finally {
    restore();
  }
});

describe("the main flow and the collapsed digest", () => {
  test("the due repositories fill the main flow and the rest collapse", async () => {
    const body = await load();
    expect(body.mainFlow).toHaveLength(30);
    expect(body.collapsedSection).toHaveLength(7);
    const collapsed = new Map(
      body.collapsedSection.map((group) => [group.repositoryId, group.pendingCount])
    );
    expect(collapsed.get("acme--web")).toBeUndefined();
    expect(collapsed.get("vendor--slow-dep")).toBe(25);
    expect(collapsed.get("vendor--ui-kit")).toBe(25);
    expect(collapsed.get("oss--router")).toBe(24);
    expect(collapsed.get("oss--bundler")).toBe(24);
    expect(collapsed.get("oss--linter")).toBe(24);
    expect(collapsed.get("vendor--analytics")).toBe(24);
    expect(collapsed.get("oss--docs")).toBe(24);
    const total = [...collapsed.values()].reduce((sum, n) => sum + n, 0);
    expect(total).toBe(170);
  });

  test("every main flow item belongs to an immediate repository", async () => {
    const body = await load();
    const repositoriesInFlow = new Set(body.mainFlow.map((item) => item.repositoryId));
    expect([...repositoriesInFlow].sort()).toEqual([
      "acme--api",
      "acme--mobile",
      "acme--web",
    ]);
    for (const item of body.mainFlow) {
      expect(item.due).toBe(true);
      expect(item.isDone).toBe(0);
    }
  });

  test("a collapsed group carries the digest rhythm and the next due date", async () => {
    const body = await load();
    const group = body.collapsedSection.find((g) => g.repositoryId === "vendor--slow-dep");
    expect(group).toBeDefined();
    expect(group?.repositoryName).toBe("vendor/slow-dep");
    expect(group?.rhythm).toBe("weekly");
    expect(group?.nextDueAt).toBe(NOW + 5 * 24 * 60 * 60 * 1000);
    expect(group?.nextDueLabel).not.toBe("");
    expect(group?.isSnoozed).toBe(false);
    expect(group?.snoozeLabel).toBe("Not snoozed");
  });

  test("the main flow is ordered newest first", async () => {
    const body = await load();
    const createdAt = body.mainFlow.map((item) => item.createdAt);
    expect([...createdAt].sort((a, b) => b - a)).toEqual(createdAt);
  });

  test("an item carries the fields the inbox needs", async () => {
    const body = await load();
    const item = body.mainFlow.find((i) => i.id === "n_001");
    expect(item).toBeDefined();
    expect(item?.repositoryName).toBe("acme/web");
    expect(item?.subject).toBe("Fix flaky login redirect");
    expect(item?.subjectType).toBe("PullRequest");
    expect(item?.subjectState).toBe("closed");
    expect(item?.reason).toBe("mention");
    expect(item?.prMerged).toBe(true);
    expect(item?.sourceUrl).toBe("https://github.com/acme/web/pull/1");
    expect(item?.createdAt).toBe(NOW - 60 * 60 * 1000);
  });
});

describe("the age filter", () => {
  // The ladder in lib/seed-data.ts puts 1, 2, 5, 9, 14, 20 and 23 hours
  // inside a day, then four more inside two days, five inside a week, three
  // inside two weeks, four inside a month and four beyond a year.
  const cases: Array<[string, number]> = [
    ["24h", 7],
    ["48h", 11],
    ["7d", 16],
    ["14d", 19],
    ["30d", 23],
    ["older", 4],
    ["all", 30],
  ];

  for (const [age, expected] of cases) {
    test(`the ${age} filter keeps ${expected} items in the main flow`, async () => {
      const body = await load(`?age=${age}`);
      expect(body.mainFlow).toHaveLength(expected);
    });
  }

  test("the year filter keeps the items created since the start of the year", async () => {
    // The year filter is measured against the local calendar year, so its
    // count depends on the time zone of the machine running the suite. The
    // expectation is derived from the dataset instead of hard coded.
    const body = await load("?age=year");
    const yearStart = new Date(new Date(NOW).getFullYear(), 0, 1).getTime();
    const expected = buildSeedNotifications(NOW)
      .filter((item) => item.createdAt >= yearStart)
      .map((item) => item.id)
      .sort();
    expect(expected.length).toBeGreaterThan(0);
    expect(body.mainFlow.map((item) => item.id).sort()).toEqual(expected);
  });

  test("an unknown age falls back to every item", async () => {
    const body = await load("?age=42y");
    expect(body.mainFlow).toHaveLength(30);
  });

  test("the age filter narrows the facets as well", async () => {
    const body = await load("?age=24h");
    expect(typeCount(body.facets, "pull_request")).toBe(3);
    expect(repoFacet(body.facets, "acme--web").main).toBe(3);
  });
});

describe("the type filter", () => {
  test("the pull request filter keeps the pull requests", async () => {
    const body = await load("?type=pull_request");
    expect(body.mainFlow).toHaveLength(10);
    expect(body.mainFlow.every((item) => item.subjectType === "PullRequest")).toBe(true);
  });

  test("the merged filter keeps the merged pull requests", async () => {
    const body = await load("?type=merged");
    expect(body.mainFlow).toHaveLength(5);
    expect(body.mainFlow.every((item) => item.prMerged)).toBe(true);
  });

  test("the closed filter keeps the closed items that are not merged", async () => {
    const body = await load("?type=closed");
    expect(body.mainFlow).toHaveLength(5);
    expect(body.mainFlow.every((item) => item.subjectState === "closed")).toBe(true);
    expect(body.mainFlow.every((item) => !item.prMerged)).toBe(true);
  });

  test("the release filter keeps the release reasons", async () => {
    const body = await load("?type=release");
    expect(body.mainFlow).toHaveLength(4);
    expect(body.mainFlow.every((item) => item.reason === "release")).toBe(true);
  });

  test("a reason filter matches the reason verbatim", async () => {
    const body = await load("?type=review_requested");
    expect(body.mainFlow).toHaveLength(5);
    expect(body.mainFlow.every((item) => item.reason === "review_requested")).toBe(true);
  });

  test("the facets stay independent of the type filter", async () => {
    const unfiltered = await load();
    const filtered = await load("?type=pull_request");
    expect(typeCount(filtered.facets, "pull_request")).toBe(
      typeCount(unfiltered.facets, "pull_request")
    );
    expect(typeCount(filtered.facets, "merged")).toBe(
      typeCount(unfiltered.facets, "merged")
    );
  });
});

describe("the state filter", () => {
  test("the default filter hides the done items", async () => {
    await db
      .update(notifications)
      .set({ isDone: 1 })
      .where(inArray(notifications.id, ["n_001", "n_002"]));
    const body = await load();
    expect(body.mainFlow).toHaveLength(28);
    expect(body.mainFlow.some((item) => item.isDone === 1)).toBe(false);
  });

  test("the done filter shows the done items", async () => {
    await db
      .update(notifications)
      .set({ isDone: 1 })
      .where(inArray(notifications.id, ["n_001", "n_002"]));
    const body = await load("?state=done");
    expect(body.mainFlow).toHaveLength(2);
    expect(body.mainFlow.map((item) => item.id).sort()).toEqual(["n_001", "n_002"]);
    expect(body.collapsedSection).toHaveLength(0);
  });

  test("the all filter counts the done items too", async () => {
    await db
      .update(notifications)
      .set({ isDone: 1 })
      .where(inArray(notifications.id, ["n_001", "n_002"]));
    const body = await load("?state=all");
    expect(body.mainFlow).toHaveLength(30);
    expect(body.collapsedSection).toHaveLength(7);
  });

  test("the done filter reports empty facets when nothing is done", async () => {
    const body = await load("?state=done");
    expect(body.mainFlow).toHaveLength(0);
    expect(typeCount(body.facets, "pull_request")).toBe(0);
    expect(repoFacet(body.facets, "acme--web").main).toBe(0);
  });
});

describe("the repository filter", () => {
  test("a repository filter keeps that repository's items", async () => {
    const body = await load("?repo=acme--web");
    expect(body.mainFlow).toHaveLength(10);
    expect(body.mainFlow.every((item) => item.repositoryId === "acme--web")).toBe(true);
    expect(body.collapsedSection).toHaveLength(0);
  });

  test("a repository filter on a digest repository leaves nothing in the main flow", async () => {
    const body = await load("?repo=vendor--slow-dep");
    expect(body.mainFlow).toHaveLength(0);
    expect(body.collapsedSection).toHaveLength(1);
    expect(body.collapsedSection[0]?.repositoryId).toBe("vendor--slow-dep");
    expect(body.collapsedSection[0]?.pendingCount).toBe(25);
  });

  test("the repository facets keep covering every repository", async () => {
    // The repository facets are the sidebar counts, so they are not narrowed
    // by the repository filter itself. The type facets are.
    const body = await load("?repo=acme--web");
    expect(repoFacet(body.facets, "acme--web").main).toBe(10);
    expect(repoFacet(body.facets, "acme--api").main).toBe(10);
    expect(repoFacet(body.facets, "vendor--slow-dep").quiet).toBe(25);
    expect(typeCount(body.facets, "pull_request")).toBe(10);
    expect(typeCount(body.facets, "merged")).toBe(5);
  });
});

describe("the facet counts", () => {
  test("the type facets count the visible items", async () => {
    const body = await load();
    expect(typeCount(body.facets, "pull_request")).toBe(10);
    expect(typeCount(body.facets, "merged")).toBe(5);
    expect(typeCount(body.facets, "closed")).toBe(5);
    expect(typeCount(body.facets, "release")).toBe(4);
    expect(typeCount(body.facets, "mention")).toBe(5);
    expect(typeCount(body.facets, "review_requested")).toBe(5);
  });

  test("the type facets carry a label for every filter", async () => {
    const body = await load();
    // "All" is the first type filter, and it counts the whole main flow.
    expect(body.facets.types[0]?.value).toBe("all");
    expect(body.facets.types[0]?.count).toBe(body.mainFlow.length);
    for (const facet of body.facets.types) {
      expect(facet.label.length).toBeGreaterThan(0);
    }
  });

  test("the repository facets split the main flow from the digest", async () => {
    const body = await load();
    expect(repoFacet(body.facets, "acme--web")).toMatchObject({
      fullName: "acme/web",
      main: 10,
      quiet: 0,
      isSnoozed: false,
    });
    expect(repoFacet(body.facets, "vendor--slow-dep")).toMatchObject({
      fullName: "vendor/slow-dep",
      main: 0,
      quiet: 25,
      isSnoozed: false,
    });
    const main = body.facets.repos.reduce((sum, r) => sum + r.main, 0);
    const quiet = body.facets.repos.reduce((sum, r) => sum + r.quiet, 0);
    expect(main).toBe(30);
    expect(quiet).toBe(170);
  });

  test("the repository facets carry actionable pending and unread counts", async () => {
    const body = await load();
    // acme/web is seeded fully read: 10 pending but 0 unread.
    expect(repoFacet(body.facets, "acme--web")).toMatchObject({
      pending: 10,
      unread: 0,
    });
    // acme/api is seeded fully unread: 10 pending and 10 unread.
    expect(repoFacet(body.facets, "acme--api")).toMatchObject({
      pending: 10,
      unread: 10,
    });
    // A quiet repo reports both totals: 25 pending, 16 unread.
    expect(repoFacet(body.facets, "vendor--slow-dep")).toMatchObject({
      pending: 25,
      unread: 16,
    });
    const group = body.collapsedSection.find(
      (g) => g.repositoryId === "vendor--slow-dep"
    );
    expect(group?.pendingCount).toBe(25);
    expect(group?.unreadCount).toBe(16);
  });

  test("the all-state facets keep done rows visible but report zero pending", async () => {
    const body = await load("?state=all");
    // In the all view the main badge still counts done rows, but the
    // done button must see zero actionable rows once everything is done.
    // Seed has nothing done, so pending still equals the visible total.
    expect(repoFacet(body.facets, "acme--web").pending).toBe(10);
  });
});

describe("the sync state in the response", () => {
  test("the response reports the pinned instant and no sync yet", async () => {
    const body = await load();
    expect(body.now).toBe(NOW);
    expect(body.lastSyncAt).toBeNull();
    expect(body.stale).toBe(false);
  });

  test("an old sync makes the inbox stale", async () => {
    await writeSyncState(db, "lastSyncAt", String(NOW - 10 * 60 * 1000));
    const body = await load();
    expect(body.lastSyncAt).toBe(NOW - 10 * 60 * 1000);
    expect(body.stale).toBe(true);
  });

  test("a recent sync is not stale", async () => {
    await writeSyncState(db, "lastSyncAt", String(NOW - 10 * 1000));
    const body = await load();
    expect(body.stale).toBe(false);
  });
});

describe("a snoozed repository", () => {
  test("its items leave the main flow and the facet reports the snooze", async () => {
    await db
      .update(repositories)
      .set({ snoozedUntil: NOW + 60 * 60 * 1000 })
      .where(eq(repositories.id, "acme--web"));
    const body = await load();
    expect(body.mainFlow).toHaveLength(20);
    expect(body.mainFlow.some((item) => item.repositoryId === "acme--web")).toBe(false);
    expect(body.collapsedSection).toHaveLength(8);
    const group = body.collapsedSection.find((g) => g.repositoryId === "acme--web");
    expect(group?.isSnoozed).toBe(true);
    expect(group?.pendingCount).toBe(10);
    expect(repoFacet(body.facets, "acme--web")).toMatchObject({
      main: 0,
      quiet: 10,
      isSnoozed: true,
    });
  });
});
