import { describe, expect, test } from "bun:test";
import { Database } from "bun:sqlite";
import { drizzle, type BunSQLiteDatabase } from "drizzle-orm/bun-sqlite";
import { eq } from "drizzle-orm";
import * as schema from "@/db/schema";
import { ensureSchema } from "@/scripts/push";
import {
  applyRemoteDone,
  migrateSeedToLive,
  pruneEmptyRepositories,
  readSyncState,
  upsertThreads,
  writeSyncState,
} from "@/lib/sync";
import type { GhThread } from "@/lib/github";

type TestDb = BunSQLiteDatabase<typeof schema>;

function makeTestDb(): TestDb {
  const sqlite = new Database(":memory:");
  ensureSchema(sqlite);
  return drizzle(sqlite, { schema });
}

function thread(overrides: Partial<GhThread> = {}): GhThread {
  return {
    id: "1001",
    unread: true,
    reason: "subscribed",
    updatedAt: 1792000000000,
    subjectTitle: "Fix flaky login redirect",
    subjectType: "PullRequest",
    subjectApiUrl: "https://api.github.com/repos/acme/web/pulls/12",
    repoFullName: "acme/web",
    repoOwnerLogin: "acme",
    repoHtmlUrl: "https://github.com/acme/web",
    threadUrl: "https://api.github.com/notifications/threads/1001",
    ...overrides,
  };
}

const resolveUrl = async () => "https://github.com/acme/web/pull/12";

describe("thread-to-row mapping", () => {
  test("stores raw reason verbatim and inverts unread", async () => {
    const db = makeTestDb();
    const summary = await upsertThreads(db, [thread({ reason: "state_change" })], null, 1792000001000, resolveUrl);
    expect(summary.upserted).toBe(1);
    const rows = await db.select().from(schema.notifications);
    expect(rows).toHaveLength(1);
    expect(rows[0]?.reason).toBe("state_change");
    expect(rows[0]?.isRead).toBe(0);
    expect(rows[0]?.isDone).toBe(0);
    expect(rows[0]?.localUnread).toBe(0);
  });

  test("read threads map to isRead 1 with updated_at as sort key", async () => {
    const db = makeTestDb();
    await upsertThreads(db, [thread({ id: "1002", unread: false })], null, 1792000001000, resolveUrl);
    const rows = await db.select().from(schema.notifications).where(eq(schema.notifications.id, "1002"));
    expect(rows[0]?.isRead).toBe(1);
    expect(rows[0]?.createdAt).toBe(1792000000000);
    expect(rows[0]?.githubUpdatedAt).toBe(1792000000000);
    expect(rows[0]?.subjectType).toBe("PullRequest");
  });

  test("subject truncates to 200 chars with https source url", async () => {
    const db = makeTestDb();
    await upsertThreads(
      db,
      [thread({ id: "1003", subjectTitle: "x".repeat(250) })],
      null,
      1792000001000,
      resolveUrl
    );
    const rows = await db.select().from(schema.notifications).where(eq(schema.notifications.id, "1003"));
    expect(rows[0]?.subject).toHaveLength(200);
    expect(rows[0]?.sourceUrl.startsWith("https://")).toBe(true);
  });

  test("explicit local unread survives sync of a remotely read thread", async () => {
    const db = makeTestDb();
    await upsertThreads(db, [thread({ id: "1004" })], null, 1792000001000, resolveUrl);
    await db
      .update(schema.notifications)
      .set({ isDone: 0, isRead: 0, localUnread: 1 })
      .where(eq(schema.notifications.id, "1004"));
    await upsertThreads(
      db,
      [thread({ id: "1004", unread: false, updatedAt: 1792000002000 })],
      null,
      1792000003000,
      resolveUrl
    );
    const rows = await db.select().from(schema.notifications).where(eq(schema.notifications.id, "1004"));
    expect(rows[0]?.isRead).toBe(0);
    expect(rows[0]?.localUnread).toBe(1);
  });

  test("locally done rows stay done when the thread is still present", async () => {
    const db = makeTestDb();
    await upsertThreads(db, [thread({ id: "1005" })], null, 1792000001000, resolveUrl);
    await db
      .update(schema.notifications)
      .set({ isDone: 1, isRead: 1 })
      .where(eq(schema.notifications.id, "1005"));
    await upsertThreads(db, [thread({ id: "1005" })], null, 1792000002000, resolveUrl);
    const rows = await db.select().from(schema.notifications).where(eq(schema.notifications.id, "1005"));
    expect(rows[0]?.isDone).toBe(1);
  });

  test("duplicate thread ids in one payload insert once instead of throwing", async () => {
    const db = makeTestDb();
    const summary = await upsertThreads(
      db,
      [thread({ id: "1006" }), thread({ id: "1006" })],
      null,
      1792000001000,
      resolveUrl
    );
    expect(summary.upserted).toBe(1);
    const rows = await db.select().from(schema.notifications).where(eq(schema.notifications.id, "1006"));
    expect(rows).toHaveLength(1);
  });

  test("duplicate thread ids keep the freshest updatedAt", async () => {
    const db = makeTestDb();
    await upsertThreads(
      db,
      [
        thread({ id: "1007", updatedAt: 1792000000000, subjectTitle: "stale title" }),
        thread({ id: "1007", updatedAt: 1792000005000, subjectTitle: "fresh title" }),
      ],
      null,
      1792000001000,
      resolveUrl
    );
    const rows = await db.select().from(schema.notifications).where(eq(schema.notifications.id, "1007"));
    expect(rows).toHaveLength(1);
    expect(rows[0]?.subject).toBe("fresh title");
    expect(rows[0]?.githubUpdatedAt).toBe(1792000005000);
  });
});

describe("first-sync migration", () => {
  test("deletes n_* seed rows and keeps rhythm settings", async () => {
    const db = makeTestDb();
    await db.insert(schema.repositories).values({
      id: "acme-web",
      fullName: "acme/web",
      ownership: "owned",
      rhythm: "monthly",
      lastPromotedAt: 1791000000000,
      nextDueAt: 1793000000000,
      snoozedUntil: null,
      unreachable: 0,
      createdAt: 1791000000000,
    });
    await db.insert(schema.notifications).values({
      id: "n_001",
      repositoryId: "acme-web",
      subject: "Seeded item",
      subjectType: null,
      reason: "mention",
      createdAt: 1791000000000,
      githubUpdatedAt: null,
      isRead: 0,
      isDone: 0,
      localUnread: 0,
      sourceUrl: "https://github.com/acme/web/pull/1",
    });
    const migrated = await migrateSeedToLive(db);
    expect(migrated.deletedSeed).toBe(1);
    expect(await db.select().from(schema.notifications)).toHaveLength(0);
    const repos = await db.select().from(schema.repositories);
    expect(repos).toHaveLength(1);
    expect(repos[0]?.rhythm).toBe("monthly");
    expect(repos[0]?.nextDueAt).toBe(1793000000000);
  });

  test("discovered watched repos get a weekly due date, owned get immediate", async () => {
    const db = makeTestDb();
    const now = 1792000001000;
    const summary = await upsertThreads(
      db,
      [
        thread({ id: "2001", repoFullName: "vendor/slow-dep", repoOwnerLogin: "vendor" }),
        thread({ id: "2002", repoFullName: "me/mine", repoOwnerLogin: "me" }),
      ],
      "me",
      now,
      resolveUrl
    );
    expect(summary.discoveredRepos).toBe(2);
    const repos = await db.select().from(schema.repositories);
    const watched = repos.find((r) => r.fullName === "vendor/slow-dep");
    const owned = repos.find((r) => r.fullName === "me/mine");
    expect(watched?.ownership).toBe("watched");
    expect(watched?.rhythm).toBe("weekly");
    expect(watched?.nextDueAt).toBe(now + 7 * 24 * 60 * 60 * 1000);
    expect(owned?.ownership).toBe("owned");
    expect(owned?.rhythm).toBe("immediate");
    expect(owned?.nextDueAt).toBeNull();
  });

  test("backfills due dates for digest repos missing nextDueAt", async () => {
    const db = makeTestDb();
    const { backfillDueDates } = await import("@/lib/sync");
    const now = 1792000001000;
    await db.insert(schema.repositories).values({
      id: "vendor--nodate",
      fullName: "vendor/nodate",
      ownership: "watched",
      rhythm: "biweekly",
      lastPromotedAt: null,
      nextDueAt: null,
      snoozedUntil: null,
      unreachable: 0,
      createdAt: now,
    });
    const result = await backfillDueDates(db, now);
    expect(result.backfilled).toBe(1);
    const repos = await db.select().from(schema.repositories);
    expect(repos[0]?.nextDueAt).toBe(now + 14 * 24 * 60 * 60 * 1000);
  });

  test("existing rhythm is never overwritten by discovery", async () => {
    const db = makeTestDb();
    await db.insert(schema.repositories).values({
      id: "vendor--slow-dep",
      fullName: "vendor/slow-dep",
      ownership: "watched",
      rhythm: "monthly",
      lastPromotedAt: null,
      nextDueAt: 1793000000000,
      snoozedUntil: null,
      unreachable: 0,
      createdAt: 1791000000000,
    });
    await upsertThreads(
      db,
      [thread({ id: "2003", repoFullName: "vendor/slow-dep", repoOwnerLogin: "vendor" })],
      "me",
      1792000001000,
      resolveUrl
    );
    const repos = await db.select().from(schema.repositories);
    expect(repos).toHaveLength(1);
    expect(repos[0]?.rhythm).toBe("monthly");
  });
  test("prunes repositories left with zero notification rows", async () => {
    const db = makeTestDb();
    await upsertThreads(db, [thread({ id: "4001", repoFullName: "a/kept" })], null, 1792000001000, resolveUrl);
    await db.insert(schema.repositories).values({
      id: "stale--repo",
      fullName: "stale/repo",
      ownership: "watched",
      rhythm: "weekly",
      lastPromotedAt: null,
      nextDueAt: null,
      snoozedUntil: null,
      unreachable: 0,
      createdAt: 1791000000000,
    });
    const result = await pruneEmptyRepositories(db);
    expect(result.pruned).toBe(1);
    const repos = await db.select().from(schema.repositories);
    expect(repos.map((r) => r.fullName)).toEqual(["a/kept"]);
  });
});

describe("stale and conditional sync state", () => {
  test("sync_state round-trips lastSyncAt and poll interval", async () => {
    const db = makeTestDb();
    expect(await readSyncState(db, "lastSyncAt")).toBeNull();
    await writeSyncState(db, "lastSyncAt", "1792000001000");
    await writeSyncState(db, "pollIntervalSecs", "60");
    expect(await readSyncState(db, "lastSyncAt")).toBe("1792000001000");
    expect(await readSyncState(db, "pollIntervalSecs")).toBe("60");
  });

  test("conditional 304 returns notModified without touching rows", async () => {
    let conditionalHits = 0;
    const server = Bun.serve({
      port: 0,
      fetch: (req) => {
        if (req.headers.get("if-modified-since")) conditionalHits += 1;
        return new Response("[]", {
          status: conditionalHits > 0 ? 304 : 200,
          headers: { "last-modified": "Fri, 16 Oct 2026 15:33:32 GMT", "x-poll-interval": "60" },
        });
      },
    });
    process.env.GHN_API_BASE = `http://localhost:${server.port}`;
    try {
      const github = await import("@/lib/github");
      const result = await github.listNotifications("t", {
        ifModifiedSince: "Fri, 16 Oct 2026 15:33:32 GMT",
        full: false,
      });
      expect(result.ok).toBe(true);
      expect(result.data?.notModified).toBe(true);
      expect(result.data?.threads).toHaveLength(0);
      expect(conditionalHits).toBe(1);
    } finally {
      delete process.env.GHN_API_BASE;
      server.stop(true);
    }
  });
});

describe("merged-status capture", () => {
  test("persists merged flag from the subject payload", async () => {
    const server = Bun.serve({
      port: 0,
      fetch: () =>
        new Response(
          JSON.stringify({ html_url: "https://github.com/acme/web/pull/12", merged: true }),
          { headers: { "Content-Type": "application/json" } }
        ),
    });
    try {
      const github = await import("@/lib/github");
      const db = makeTestDb();
      const apiUrl = `http://localhost:${server.port}/repos/acme/web/pulls/12`;
      await upsertThreads(
        db,
        [thread({ id: "5001", subjectApiUrl: apiUrl })],
        null,
        1792000001000,
        (t) => github.resolveSubjectHtmlUrl("token", t, new Map())
      );
      expect(github.readPrMerged(apiUrl)).toBe(true);
      const rows = await db.select().from(schema.notifications).where(eq(schema.notifications.id, "5001"));
      expect(rows[0]?.prMerged).toBe(1);
    } finally {
      server.stop(true);
    }
  });

  test("open PRs persist unmerged", async () => {
    const server = Bun.serve({
      port: 0,
      fetch: () =>
        new Response(
          JSON.stringify({ html_url: "https://github.com/acme/web/pull/13", merged: false }),
          { headers: { "Content-Type": "application/json" } }
        ),
    });
    try {
      const github = await import("@/lib/github");
      const db = makeTestDb();
      const apiUrl = `http://localhost:${server.port}/repos/acme/web/pulls/13`;
      await upsertThreads(
        db,
        [thread({ id: "5002", subjectApiUrl: apiUrl })],
        null,
        1792000001000,
        (t) => github.resolveSubjectHtmlUrl("token", t, new Map())
      );
      const rows = await db.select().from(schema.notifications).where(eq(schema.notifications.id, "5002"));
      expect(rows[0]?.prMerged).toBe(0);
    } finally {
      server.stop(true);
    }
  });
});

describe("seed shape", () => {
  test("seeds ten repos and two hundred valid notifications", async () => {
    const { seedDatabase } = await import("@/lib/seed");
    const db = makeTestDb();
    const summary = await seedDatabase(1792000000000, db);
    expect(summary).toEqual({ repositories: 10, notifications: 200 });
    const rows = await db.select().from(schema.notifications);
    expect(rows).toHaveLength(200);
    for (const r of rows) {
      expect(r.subject.length).toBeGreaterThan(0);
      expect(r.subject.length).toBeLessThanOrEqual(200);
      expect(r.sourceUrl.startsWith("https://")).toBe(true);
    }
  });

  test("muted subjects land done", async () => {
    const { seedDatabase } = await import("@/lib/seed");
    const db = makeTestDb();
    const now = 1792000000000;
    await seedDatabase(now, db);
    const first = (await db.select().from(schema.notifications))[0];
    if (!first) throw new Error("seed produced no rows");
    await db
      .insert(schema.mutedSubjects)
      .values({ repositoryId: first.repositoryId, subject: first.subject });
    await seedDatabase(now, db);
    const rows = await db
      .select()
      .from(schema.notifications)
      .where(eq(schema.notifications.id, first.id));
    expect(rows[0]?.isDone).toBe(1);
  });
});

describe("remote-done propagation", () => {
  test("threads absent from a full pass become done", async () => {
    const db = makeTestDb();
    await upsertThreads(db, [thread({ id: "3001" }), thread({ id: "3002" })], null, 1792000001000, resolveUrl);
    const result = await applyRemoteDone(db, new Set(["3001"]), new Set());
    expect(result.markedDone).toBe(1);
    const rows = await db.select().from(schema.notifications).where(eq(schema.notifications.id, "3002"));
    expect(rows[0]?.isDone).toBe(1);
  });

  test("queued threads and seed rows are excluded from remote-done", async () => {
    const db = makeTestDb();
    await upsertThreads(db, [thread({ id: "3003" })], null, 1792000001000, resolveUrl);
    await db.insert(schema.notifications).values({
      id: "n_009",
      repositoryId: "acme--web",
      subject: "leftover seed",
      subjectType: null,
      reason: "mention",
      createdAt: 1791000000000,
      githubUpdatedAt: null,
      isRead: 0,
      isDone: 0,
      localUnread: 0,
      sourceUrl: "https://github.com/acme/web/pull/9",
    });
    const result = await applyRemoteDone(db, new Set(), new Set(["3003"]));
    expect(result.markedDone).toBe(0);
    const rows = await db.select().from(schema.notifications).where(eq(schema.notifications.id, "3003"));
    expect(rows[0]?.isDone).toBe(0);
  });
});
