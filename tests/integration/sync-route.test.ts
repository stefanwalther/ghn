import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, test, vi } from "vitest";
import { eq } from "drizzle-orm";
import { db } from "../support/db-client.node";
import { seedTestDataset } from "../support/fixtures";
import {
  startGitHubStandIn,
  type StandIn,
  type StandInThread,
} from "../support/github-stand-in";
import { withEnv } from "../support/test-env";
import { notifications, repositories, syncState, writebackQueue } from "@/db/schema";

vi.mock("@/db/client", async () => {
  const mod = await import("../support/db-client.node");
  return { db: mod.db };
});

/**
 * `POST /api/sync`.
 *
 * The sync is the only path that writes into the database from the outside
 * world, so it is where the credential handling, the repository discovery,
 * the thread upsert and the write-back queue all come together.
 */

const NOW = Date.parse("2026-01-15T12:00:00Z");
const TOKEN = "test-token";

function buildThreads(baseUrl: string): StandInThread[] {
  return [
    {
      id: "t_001",
      unread: true,
      reason: "review_requested",
      updated_at: "2026-01-15T11:00:00Z",
      subject: {
        title: "Fix flaky login redirect",
        type: "PullRequest",
        url: `${baseUrl}/repos/acme/web/pulls/11`,
      },
      repository: {
        full_name: "acme/web",
        html_url: "https://github.com/acme/web",
        owner: { login: "acme" },
      },
      url: `${baseUrl}/notifications/threads/t_001`,
    },
    {
      id: "t_002",
      unread: false,
      reason: "subscribed",
      updated_at: "2026-01-15T10:00:00Z",
      subject: {
        title: "Bump dependency range",
        type: "Issue",
        url: `${baseUrl}/repos/test-user/mine/issues/3`,
      },
      repository: {
        full_name: "test-user/mine",
        html_url: "https://github.com/test-user/mine",
        owner: { login: "test-user" },
      },
      url: `${baseUrl}/notifications/threads/t_002`,
    },
  ];
}

let standIn: StandIn;
let restoreEnv: (() => void) | null = null;

async function sync(payload: Record<string, unknown> = {}) {
  const { POST } = await import("@/app/api/sync/route");
  const res = await POST(
    new Request("http://localhost/api/sync", {
      method: "POST",
      body: JSON.stringify(payload),
    })
  );
  expect(res.status).toBe(200);
  return (await res.json()) as Record<string, unknown>;
}

async function syncStateValue(key: string): Promise<string | null> {
  const rows = await db.select().from(syncState).where(eq(syncState.key, key));
  return rows[0]?.value ?? null;
}

beforeAll(async () => {
  // Two threads per page, so the listing has to follow the pagination link.
  standIn = await startGitHubStandIn({ token: TOKEN, perPage: 2 });
});

afterAll(async () => {
  await standIn.close();
});

beforeEach(async () => {
  standIn.reset();
  standIn.setThreads(buildThreads(standIn.url));
  standIn.setSubject("/repos/acme/web/pulls/11", {
    title: "Fix flaky login redirect",
    body: "The redirect races the session load.",
    state: "closed",
    draft: false,
    merged: true,
    user: { login: "octo" },
    html_url: "https://github.com/acme/web/pull/11",
    head: { sha: "0123456789abcdef0123456789abcdef01234567" },
  });
  standIn.setSubject("/repos/test-user/mine/issues/3", {
    title: "Bump dependency range",
    body: "Bumps the range.",
    state: "open",
    draft: false,
    merged: false,
    user: { login: "octo" },
    html_url: "https://github.com/test-user/mine/issues/3",
    head: { sha: "fedcba9876543210fedcba9876543210fedcba98" },
  });
  restoreEnv = withEnv({
    GHN_TOKEN: TOKEN,
    GHN_API_BASE: standIn.url,
    GHN_NOW: String(NOW),
  });
  await db.delete(writebackQueue);
  await db.delete(syncState);
  await db.delete(notifications);
  await db.delete(repositories);
  await seedTestDataset(db, NOW);
});

afterEach(() => {
  restoreEnv?.();
  restoreEnv = null;
});

describe("the unauthorized path", () => {
  test("without a credential the sync reports an auth failure", async () => {
    restoreEnv?.();
    restoreEnv = withEnv({
      GHN_TOKEN: "",
      GHN_API_BASE: standIn.url,
      GHN_NOW: String(NOW),
    });
    const body = await sync();
    expect(body).toMatchObject({
      now: NOW,
      lastSyncAt: null,
      fresh: false,
      reason: "auth",
      retryable: true,
      queueDepth: 0,
    });
    expect(standIn.requests).toHaveLength(0);
  });

  test("a rejected credential reports an auth failure", async () => {
    standIn.setScenario("/user", { status: 401 });
    const body = await sync();
    expect(body).toMatchObject({ fresh: false, reason: "auth", retryable: true });
  });

  test("an unreachable GitHub reports a network failure", async () => {
    restoreEnv?.();
    restoreEnv = withEnv({
      GHN_TOKEN: TOKEN,
      GHN_API_BASE: "http://127.0.0.1:1",
      GHN_NOW: String(NOW),
    });
    const body = await sync();
    expect(body).toMatchObject({ fresh: false, reason: "network", retryable: true });
  });

  test("a rate limited listing reports the rate limit", async () => {
    standIn.setScenario("/notifications", { status: 403, rateLimitRemaining: 0 });
    const body = await sync();
    expect(body).toMatchObject({
      fresh: false,
      reason: "rate_limited",
      retryable: true,
    });
  });

  test("a rejected listing reports the auth failure", async () => {
    standIn.setScenario("/notifications", { status: 401 });
    const body = await sync();
    expect(body).toMatchObject({ fresh: false, reason: "auth" });
  });
});

describe("the first sync", () => {
  test("it discovers the repositories and upserts the threads", async () => {
    const body = await sync();
    expect(body).toMatchObject({
      now: NOW,
      lastSyncAt: NOW,
      fresh: true,
      pollIntervalSecs: 60,
      upserted: 2,
      markedDone: 0,
      discoveredRepos: 2,
      queueDepth: 0,
    });

    const rows = await db.select().from(notifications);
    expect(rows.map((r) => r.id).sort()).toEqual(["t_001", "t_002"]);
    const thread = rows.find((r) => r.id === "t_001");
    expect(thread?.subject).toBe("Fix flaky login redirect");
    expect(thread?.subjectType).toBe("PullRequest");
    expect(thread?.subjectState).toBe("closed");
    expect(thread?.prMerged).toBe(1);
    expect(thread?.reason).toBe("review_requested");
    expect(thread?.isRead).toBe(0);
    expect(thread?.isDone).toBe(0);
    expect(thread?.createdAt).toBe(Date.parse("2026-01-15T11:00:00Z"));
    expect(thread?.sourceUrl).toBe("https://github.com/acme/web/pull/11");

    const read = rows.find((r) => r.id === "t_002");
    expect(read?.isRead).toBe(1);
    expect(read?.subjectState).toBe("open");
    expect(read?.prMerged).toBe(0);
  });

  test("it records the repository of every thread", async () => {
    await sync();
    const repos = await db.select().from(repositories);
    const watched = repos.find((r) => r.fullName === "acme/web");
    expect(watched?.id).toBe("acme--web");
    expect(watched?.ownership).toBe("watched");
    expect(watched?.rhythm).toBe("weekly");
    expect(watched?.nextDueAt).toBe(NOW + 7 * 24 * 60 * 60 * 1000);

    const owned = repos.find((r) => r.fullName === "test-user/mine");
    expect(owned?.ownership).toBe("owned");
    expect(owned?.rhythm).toBe("immediate");
    expect(owned?.nextDueAt).toBeNull();
  });

  test("it stores the sync state it needs for the next run", async () => {
    await sync();
    expect(await syncStateValue("lastSyncAt")).toBe(String(NOW));
    expect(await syncStateValue("pollIntervalSecs")).toBe("60");
    expect(await syncStateValue("lastModified")).toBe(
      "Fri, 16 Oct 2026 15:33:32 GMT"
    );
    expect(await syncStateValue("viewerLogin")).toBe("test-user");
  });

  test("the seeded rows are migrated away", async () => {
    await sync();
    const rows = await db.select().from(notifications);
    expect(rows.some((r) => r.id.startsWith("n_"))).toBe(false);
  });

  test("a thread that is gone from GitHub is marked done", async () => {
    await db.insert(notifications).values({
      id: "live_001",
      repositoryId: "acme--web",
      subject: "An item that vanished",
      subjectType: "Issue",
      subjectState: "open",
      reason: "mention",
      createdAt: NOW - 3600 * 1000,
      githubUpdatedAt: null,
      isRead: 0,
      isDone: 0,
      localUnread: 0,
      sourceUrl: "https://github.com/acme/web/issues/9",
    });
    const body = await sync();
    expect(body.markedDone).toBe(1);
    const rows = await db
      .select()
      .from(notifications)
      .where(eq(notifications.id, "live_001"));
    expect(rows[0]?.isDone).toBe(1);
  });

  test("the listing is paged through the stand-in", async () => {
    standIn.setThreads([
      ...buildThreads(standIn.url),
      {
        id: "t_003",
        unread: true,
        reason: "mention",
        updated_at: "2026-01-15T09:00:00Z",
        subject: {
          title: "Add empty state for inbox",
          type: "Issue",
          url: `${standIn.url}/repos/acme/web/issues/12`,
        },
        repository: {
          full_name: "acme/web",
          html_url: "https://github.com/acme/web",
          owner: { login: "acme" },
        },
        url: `${standIn.url}/notifications/threads/t_003`,
      },
    ]);
    const body = await sync();
    expect(body.upserted).toBe(3);
    const listings = standIn.requests.filter((r) => r.path === "/notifications");
    expect(listings).toHaveLength(2);
    const rows = await db.select().from(notifications);
    expect(rows.map((r) => r.id).sort()).toEqual(["t_001", "t_002", "t_003"]);
  });
});

describe("the queue drain", () => {
  test("the queued work is sent before the listing and the queue is emptied", async () => {
    await db.insert(writebackQueue).values({
      threadId: "t_001",
      action: "done",
      attempts: 0,
      lastError: "auth",
      createdAt: NOW,
    });
    const body = await sync();
    expect(body.queueDepth).toBe(0);
    const queued = await db.select().from(writebackQueue);
    expect(queued).toHaveLength(0);
    const deletes = standIn.requests.filter((r) => r.method === "DELETE");
    expect(deletes.map((r) => r.path)).toEqual([
      "/notifications/threads/t_001",
    ]);
  });

  test("a queued write is sent as a patch", async () => {
    await db.insert(writebackQueue).values({
      threadId: "t_002",
      action: "read",
      attempts: 0,
      lastError: "auth",
      createdAt: NOW,
    });
    await sync();
    const patches = standIn.requests.filter((r) => r.method === "PATCH");
    expect(patches.map((r) => r.path)).toEqual([
      "/notifications/threads/t_002",
    ]);
  });

  test("a queued unsubscribe is sent to the subscription endpoint", async () => {
    await db.insert(writebackQueue).values({
      threadId: "t_002",
      action: "unsubscribe",
      attempts: 0,
      lastError: "auth",
      createdAt: NOW,
    });
    await sync();
    const puts = standIn.requests.filter((r) => r.method === "PUT");
    expect(puts.map((r) => r.path)).toEqual([
      "/notifications/threads/t_002/subscription",
    ]);
  });

  test("a failing drain keeps the work and counts the attempt", async () => {
    await db.insert(writebackQueue).values({
      threadId: "t_001",
      action: "done",
      attempts: 0,
      lastError: "auth",
      createdAt: NOW,
    });
    standIn.setScenario("/notifications/threads/t_001", { status: 500 });
    const body = await sync();
    expect(body.queueDepth).toBe(1);
    const queued = await db.select().from(writebackQueue);
    expect(queued).toHaveLength(1);
    expect(queued[0]?.attempts).toBe(1);
    expect(queued[0]?.lastError).toBe("unknown");
  });
});

describe("a repeated sync", () => {
  test("inside the poll interval nothing is fetched again", async () => {
    await sync();
    const requestsAfterFirst = standIn.requests.length;
    const body = await sync();
    expect(body).toMatchObject({
      fresh: true,
      upserted: 0,
      markedDone: 0,
      discoveredRepos: 0,
      notModified: true,
    });
    const paths = standIn.requests
      .slice(requestsAfterFirst)
      .map((r) => r.path);
    expect(paths).toEqual(["/user"]);
  });

  test("a forced sync fetches the listing again", async () => {
    await sync();
    const requestsAfterFirst = standIn.requests.length;
    const body = await sync({ full: true });
    expect(body.upserted).toBe(2);
    const paths = standIn.requests.slice(requestsAfterFirst).map((r) => r.path);
    expect(paths).toContain("/notifications");
  });
});
