import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, test, vi } from "vitest";
import { eq } from "drizzle-orm";
import { db, sqlite } from "../support/db-client.node";
import {
  startGitHubStandIn,
  type StandIn,
  type StandInRequest,
  type StandInThread,
} from "../support/github-stand-in";
import { withEnv } from "../support/test-env";
import { notifications, repositories, syncState, writebackQueue } from "@/db/schema";

const ghShell = vi.hoisted(() => ({
  calls: [] as string[],
  token: "test-token",
}));

vi.mock("bun", () => ({
  $: (strings: TemplateStringsArray) => {
    ghShell.calls.push(strings.join(""));
    return {
      quiet() {
        return this;
      },
      nothrow() {
        return this;
      },
      async text() {
        return `${ghShell.token}\n`;
      },
    };
  },
}));

vi.mock("@/db/client", async () => {
  const mod = await import("../support/db-client.node");
  return { db: mod.db, sqlite: mod.sqlite };
});

/**
 * Sync performance contracts at the public `POST /api/sync` + `GET /api/notifications`
 * seam. Uses scripted stand-in latency plus deterministic request-count,
 * overlap, and peak-concurrency assertions so regressions are caught without
 * flaky wall-clock timers.
 */

const NOW = Date.parse("2026-01-15T12:00:00Z");
const TOKEN = "test-token";

let standIn: StandIn;
let restoreEnv: (() => void) | null = null;
let syncPost: (req: Request) => Promise<Response>;
let notificationsGet: (req: Request) => Promise<Response>;

function peakConcurrency(reqs: StandInRequest[]): number {
  const events: Array<{ t: number; delta: number }> = [];
  for (const r of reqs) {
    events.push({ t: r.startedAt, delta: 1 });
    events.push({ t: r.finishedAt, delta: -1 });
  }
  events.sort((a, b) => a.t - b.t || a.delta - b.delta);
  let cur = 0;
  let peak = 0;
  for (const e of events) {
    cur += e.delta;
    if (cur > peak) peak = cur;
  }
  return peak;
}

async function seedSkewedInbox(repoCount: number, totalSubjects: number) {
  const repoRows = Array.from({ length: repoCount }, (_, r) => ({
    id: `org--repo-${r}`,
    fullName: `org/repo-${r}`,
    ownership: "owned" as const,
    rhythm: "immediate" as const,
    lastPromotedAt: null,
    nextDueAt: null,
    snoozedUntil: null,
    pinned: 0,
    unreachable: 0,
    createdAt: NOW - 86_400_000,
  }));
  await db.insert(repositories).values(repoRows);

  // Skew distribution like a real inbox: first 8 repos hold ~18-30 items each,
  // remaining repos hold the tail (2-6 items each).
  const notifRows: Array<typeof notifications.$inferInsert> = [];
  let created = 0;
  for (let r = 0; r < repoCount && created < totalSubjects; r += 1) {
    const remainingRepos = repoCount - r;
    const remainingItems = totalSubjects - created;
    const target =
      remainingRepos === 1
        ? remainingItems
        : r < 8
          ? Math.min(remainingItems - (remainingRepos - 1), 24)
          : Math.ceil(remainingItems / remainingRepos);
    for (let j = 0; j < target && created < totalSubjects; j += 1) {
      const id = `live_${created}`;
      const isIssue = created % 10 === 0;
      const num = j + 1;
      notifRows.push({
        id,
        repositoryId: `org--repo-${r}`,
        subject: `${isIssue ? "Issue" : "PR"} #${num} in repo-${r}`,
        subjectType: isIssue ? "Issue" : "PullRequest",
        subjectState: "open",
        reason: "author",
        prMerged: 0,
        createdAt: NOW - 3_600_000 - created * 1000,
        githubUpdatedAt: NOW - 3_600_000 - created * 1000,
        isRead: 1,
        isDone: 0,
        localUnread: 0,
        sourceUrl: `https://github.com/org/repo-${r}/${isIssue ? "issues" : "pull"}/${num}`,
      });
      created += 1;
    }
  }
  await db.insert(notifications).values(notifRows);
  await db.insert(syncState).values([
    { key: "lastSyncAt", value: String(NOW - 120_000) },
    { key: "lastModified", value: "Thu, 15 Jan 2026 11:58:00 GMT" },
    { key: "pollIntervalSecs", value: "60" },
    { key: "seedReposPruned", value: "1" },
  ]);
  return notifRows;
}

async function postSync(payload: Record<string, unknown> = {}) {
  const res = await syncPost(
    new Request("http://localhost/api/sync", {
      method: "POST",
      body: JSON.stringify(payload),
    })
  );
  expect(res.status).toBe(200);
  return (await res.json()) as Record<string, unknown>;
}

async function getNotifications(query = "") {
  const res = await notificationsGet(
    new Request(`http://localhost/api/notifications${query}`)
  );
  expect(res.status).toBe(200);
  return (await res.json()) as {
    mainFlow: Array<{ id: string; prMerged: boolean; subjectState: string | null; isRead: number }>;
    facets: { types: Array<{ value: string; count: number }> };
  };
}

beforeAll(async () => {
  standIn = await startGitHubStandIn({ token: TOKEN });
  syncPost = (await import("@/app/api/sync/route")).POST;
  notificationsGet = (await import("@/app/api/notifications/route")).GET;
});

afterAll(async () => {
  await standIn.close();
});

beforeEach(async () => {
  standIn.reset();
  ghShell.calls.length = 0;
  ghShell.token = TOKEN;
  restoreEnv = withEnv({
    GHN_TOKEN: TOKEN,
    GHN_API_BASE: standIn.url,
    GHN_NOW: String(NOW),
  });
  await db.delete(writebackQueue);
  await db.delete(syncState);
  await db.delete(notifications);
  await db.delete(repositories);
});

afterEach(() => {
  restoreEnv?.();
  restoreEnv = null;
});

describe("sync performance at realistic inbox scale", () => {
  test("450 active PRs/Issues across 64 repos refresh in <=6 balanced concurrent GraphQL calls with zero thread REST fan-out when unchanged", async () => {
    await seedSkewedInbox(64, 450);
    // Mark 2 PRs from different repos merged on GitHub while /notifications returns 304.
    standIn.setSubject("/repos/org/repo-0/pulls/2", {
      state: "closed",
      merged: true,
      html_url: "https://github.com/org/repo-0/pull/2",
    });
    standIn.setSubject("/repos/org/repo-40/pulls/1", {
      state: "closed",
      merged: true,
      html_url: "https://github.com/org/repo-40/pull/1",
    });
    standIn.setScenario("/notifications", { status: 304 });
    standIn.setDelay("/graphql", 80);

    const t0 = performance.now();
    const body = await postSync();
    const elapsedMs = performance.now() - t0;

    expect(body.fresh).toBe(true);
    const gqlReqs = standIn.requests.filter((r) => r.path === "/graphql");
    const threadReqs = standIn.requests.filter((r) => r.path.startsWith("/notifications/threads/"));

    expect(gqlReqs.length).toBeLessThanOrEqual(6);
    expect(peakConcurrency(gqlReqs)).toBeGreaterThanOrEqual(5);
    expect(threadReqs).toHaveLength(0);
    // Smoke bound: single wave of 80ms batches should finish well under 1.5s.
    expect(elapsedMs).toBeLessThan(1500);

    const inbox = await getNotifications("?type=merged");
    expect(inbox.facets.types.find((t) => t.value === "merged")?.count).toBe(2);
    expect(inbox.mainFlow.map((i) => i.prMerged)).toEqual([true, true]);
  });

  test("incremental sync overlaps /notifications and GraphQL subject fetches in parallel, discarding prefetched states if /notifications fails", async () => {
    await seedSkewedInbox(12, 120);
    standIn.setSubject("/repos/org/repo-0/pulls/2", {
      state: "closed",
      merged: true,
      html_url: "https://github.com/org/repo-0/pull/2",
    });
    standIn.setDelay("/notifications", 120);
    standIn.setDelay("/graphql", 120);
    standIn.setScenario("/notifications", { status: 304 });

    const okBody = await postSync();
    expect(okBody.fresh).toBe(true);

    const notifReq = standIn.requests.find((r) => r.path === "/notifications")!;
    const gqlReqs = standIn.requests.filter((r) => r.path === "/graphql");
    expect(gqlReqs.length).toBeGreaterThan(0);
    // GraphQL must begin before /notifications finishes, proving both legs overlap.
    const firstGqlStart = Math.min(...gqlReqs.map((r) => r.startedAt));
    expect(firstGqlStart).toBeLessThan(notifReq.finishedAt);

    // Safety check: when /notifications fails, prefetched GraphQL state changes must not be persisted.
    standIn.setSubject("/repos/org/repo-1/pulls/1", {
      state: "closed",
      merged: true,
      html_url: "https://github.com/org/repo-1/pull/1",
    });
    standIn.setScenario("/notifications", { status: 500 });
    process.env.GHN_NOW = String(NOW + 120_000);
    const errBody = await postSync();
    expect(errBody.fresh).toBe(false);

    const inbox = await getNotifications("?type=merged");
    // Only the PR merged during the successful sync is persisted, not repo-1/pull/1.
    expect(inbox.facets.types.find((t) => t.value === "merged")?.count).toBe(1);
  });

  test("mass merge caps per-thread REST reconciliation at 12 concurrent calls while preserving localUnread and handling 404/403", async () => {
    const seeded = await seedSkewedInbox(1, 30);
    // Keep all 30 seeded rows unread PullRequests (replace the 3 Issue rows for a uniform 30-PR batch).
    for (let i = 0; i < seeded.length; i += 1) {
      const row = seeded[i]!;
      const num = i + 1;
      await db
        .update(notifications)
        .set({
          subjectType: "PullRequest",
          isRead: 0,
          localUnread: i === 0 ? 1 : 0,
          sourceUrl: `https://github.com/org/repo-0/pull/${num}`,
        })
        .where(eq(notifications.id, row.id));
      standIn.setSubject(`/repos/org/repo-0/pulls/${num}`, {
        state: "closed",
        merged: true,
        html_url: `https://github.com/org/repo-0/pull/${num}`,
      });
    }

    // Thread 1 (live_1) is gone (404), thread 2 (live_2) returns 403, threads 3..29 are read on GitHub.
    const threads: StandInThread[] = seeded
      .filter((_, i) => i !== 1)
      .map((row, idx) => ({
        id: row.id,
        unread: false,
        reason: "author",
        updated_at: new Date(NOW - 30_000).toISOString(),
        subject: {
          title: row.subject,
          type: "PullRequest",
          url: `${standIn.url}/repos/org/repo-0/pulls/${idx + 1}`,
        },
        repository: {
          full_name: "org/repo-0",
          html_url: "https://github.com/org/repo-0",
          owner: { login: "org" },
        },
        url: `${standIn.url}/notifications/threads/${row.id}`,
      }));
    standIn.setThreads(threads);
    standIn.setScenario("/notifications/threads/live_2", { status: 403 });
    standIn.setScenario("/notifications", { status: 304 });
    standIn.setDelay("/notifications/threads/*", 60);

    const body = await postSync();
    expect(body.fresh).toBe(true);

    const threadReqs = standIn.requests.filter((r) => r.path.startsWith("/notifications/threads/"));
    expect(threadReqs.length).toBeLessThanOrEqual(12);
    expect(peakConcurrency(threadReqs)).toBeGreaterThanOrEqual(4);
    // localUnread row (live_0) is never fetched or cleared.
    expect(threadReqs.some((r) => r.path.endsWith("/live_0"))).toBe(false);

    const allMerged = await getNotifications("?type=merged&state=all");
    expect(allMerged.mainFlow).toHaveLength(30);
    expect(allMerged.mainFlow.find((i) => i.id === "live_0")?.isRead).toBe(0);
    expect(allMerged.mainFlow.find((i) => i.id === "live_2")?.prMerged).toBe(true);

    const doneOnly = await getNotifications("?state=done");
    expect(doneOnly.mainFlow.map((i) => i.id)).toEqual(["live_1"]);
  });

  test("POST /api/sync invokes the gh credential helper at most once per sync", async () => {
    await seedSkewedInbox(2, 10);
    standIn.setScenario("/notifications", { status: 304 });
    restoreEnv?.();
    restoreEnv = withEnv({
      GHN_TOKEN: undefined,
      GH_TOKEN: undefined,
      GITHUB_TOKEN: undefined,
      GHN_API_BASE: standIn.url,
      GHN_NOW: String(NOW),
    });

    const body = await postSync();
    expect(body.fresh).toBe(true);
    expect(ghShell.calls).toEqual(["gh auth token"]);
  });

  test("full sync avoids N+1 repository lookups when upserting 500 threads across 25 repos", async () => {
    const threads: StandInThread[] = Array.from({ length: 500 }, (_, i) => {
      const repoIdx = i % 25;
      const num = Math.floor(i / 25) + 1;
      return {
        id: `bulk_${i}`,
        unread: i % 2 === 0,
        reason: "subscribed",
        updated_at: new Date(NOW - 3_600_000 - i * 1000).toISOString(),
        subject: {
          title: `PR #${num}`,
          type: "PullRequest",
          url: `${standIn.url}/repos/org/repo-${repoIdx}/pulls/${num}`,
        },
        repository: {
          full_name: `org/repo-${repoIdx}`,
          html_url: `https://github.com/org/repo-${repoIdx}`,
          owner: { login: "org" },
        },
        url: `${standIn.url}/notifications/threads/bulk_${i}`,
      };
    });
    standIn.setThreads(threads);

    // First sync seeds the 500 threads; measure the subsequent full re-upsert.
    await postSync({ full: true });

    let repoSelectCount = 0;
    const origPrepare = sqlite.prepare.bind(sqlite);
    const spy = vi.spyOn(sqlite, "prepare").mockImplementation((sqlText: string) => {
      if (/^\s*select\b/i.test(sqlText) && /\bfrom\s+"?repositories"?/i.test(sqlText)) {
        repoSelectCount += 1;
      }
      return origPrepare(sqlText);
    });
    try {
      const t0 = performance.now();
      const res = await postSync({ full: true });
      const elapsedMs = performance.now() - t0;
      expect(res.fresh).toBe(true);
      expect(res.upserted).toBe(500);
      // Preloaded repo map means O(1) repository SELECTs (backfill + preload), not 500+.
      expect(repoSelectCount).toBeLessThanOrEqual(5);
      expect(elapsedMs).toBeLessThan(1500);
    } finally {
      spy.mockRestore();
    }
  });
});
