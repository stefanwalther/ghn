import { describe, expect, test } from "vitest";
import { createMemoryDb } from "../support/db-client.node";
import * as schema from "@/db/schema";
import {
  backfillDueDates,
  migrateSeedToLive,
  pruneEmptyRepositories,
  upsertThreads,
} from "@/lib/sync";
import type { GhThread } from "@/lib/github";

function thread(overrides: Partial<GhThread> = {}): GhThread {
  return {
    id: "t1",
    unread: true,
    reason: "subscribed",
    updatedAt: 1792000000000,
    subjectTitle: "Fix flaky login redirect",
    subjectType: "PullRequest",
    subjectApiUrl: "https://api.github.com/repos/acme/web/pulls/12",
    repoFullName: "acme/web",
    repoOwnerLogin: "acme",
    repoHtmlUrl: "https://github.com/acme/web",
    threadUrl: "https://api.github.com/notifications/threads/t1",
    ...overrides,
  };
}

const resolveUrl = async () => "https://github.com/acme/web/pull/12";

describe("the due date backfill", () => {
  // A repository that already has a due date is left alone, and a
  // repository that is promoted immediately never needs one.
  test("a repository that already has a due date is left alone", async () => {
    const db = createMemoryDb().db;
    await db.insert(schema.repositories).values([
      {
        id: "acme--web",
        fullName: "acme/web",
        ownership: "owned",
        rhythm: "immediate",
        lastPromotedAt: null,
        nextDueAt: null,
        unreachable: 0,
        createdAt: 1000,
      },
      {
        id: "vendor--slow-dep",
        fullName: "vendor/slow-dep",
        ownership: "watched",
        rhythm: "weekly",
        lastPromotedAt: null,
        nextDueAt: 1793000000000,
        unreachable: 0,
        createdAt: 1000,
      },
    ]);

    const result = await backfillDueDates(db, 1792000001000);
    expect(result.backfilled).toBe(0);

    const repos = await db.select().from(schema.repositories);
    expect(repos.find((r) => r.id === "vendor--slow-dep")?.nextDueAt).toBe(1793000000000);
    expect(repos.find((r) => r.id === "acme--web")?.nextDueAt).toBeNull();
  });
});

describe("the seed migration", () => {
  // A database that holds no seed rows has nothing to migrate.
  test("a database without seed rows has nothing to migrate", async () => {
    const db = createMemoryDb().db;
    await upsertThreads(db, [thread({ id: "9001" })], null, 1792000001000, resolveUrl);

    const result = await migrateSeedToLive(db);
    expect(result.deletedSeed).toBe(0);
    expect(await db.select().from(schema.notifications)).toHaveLength(1);
  });
});

describe("the empty repository prune", () => {
  // A repository that still holds notifications is kept.
  test("a repository that still holds notifications is kept", async () => {
    const db = createMemoryDb().db;
    await upsertThreads(db, [thread({ id: "9002" })], null, 1792000001000, resolveUrl);

    const result = await pruneEmptyRepositories(db);
    expect(result.pruned).toBe(0);
    expect(await db.select().from(schema.repositories)).toHaveLength(1);
  });
});
