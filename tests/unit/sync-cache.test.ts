import { describe, expect, test } from "vitest";
import { eq } from "drizzle-orm";
import { createMemoryDb } from "../support/db-client.node";
import * as schema from "@/db/schema";
import {
  clearUrlCache,
  markRepoUnreachable,
  sharedUrlCache,
  upsertThreads,
} from "@/lib/sync";
import type { GhThread } from "@/lib/github";

function thread(overrides: Partial<GhThread> = {}): GhThread {
  return {
    id: "8001",
    unread: true,
    reason: "subscribed",
    updatedAt: 1792000000000,
    subjectTitle: "Fix flaky login redirect",
    subjectType: "PullRequest",
    subjectApiUrl: "https://api.github.com/repos/acme/web/pulls/12",
    repoFullName: "acme/web",
    repoOwnerLogin: "acme",
    repoHtmlUrl: "https://github.com/acme/web",
    threadUrl: "https://api.github.com/notifications/threads/8001",
    ...overrides,
  };
}

const resolveUrl = async () => "https://github.com/acme/web/pull/12";

describe("the shared url cache", () => {
  // The sync and the thread fetch share one cache, so a thread is only
  // looked up once per run.
  test("the cache is the same map every time it is asked for", () => {
    expect(sharedUrlCache()).toBe(sharedUrlCache());
  });

  // Clearing it throws away what the run resolved, so a fresh run starts
  // from nothing.
  test("clearing the cache empties it", () => {
    const cache = sharedUrlCache();
    cache.set("https://api.github.com/repos/acme/web/pulls/12", "https://github.com/acme/web/pull/12");
    expect(cache.size).toBeGreaterThan(0);

    clearUrlCache();
    expect(sharedUrlCache().size).toBe(0);
  });
});

describe("unreachable repositories", () => {
  // A repository that cannot be reached is marked, so the inbox can say so
  // instead of showing an empty list.
  test("a repository that cannot be reached is marked unreachable", async () => {
    const db = createMemoryDb().db;
    await upsertThreads(db, [thread()], null, 1792000001000, resolveUrl);

    await markRepoUnreachable(db, "acme--web");
    const rows = await db
      .select()
      .from(schema.repositories)
      .where(eq(schema.repositories.id, "acme--web"));
    expect(rows[0]?.unreachable).toBe(1);
  });

  // When the repository answers again, the mark is lifted.
  test("a repository that answers again is un-marked on the next sync", async () => {
    const db = createMemoryDb().db;
    await upsertThreads(db, [thread()], null, 1792000001000, resolveUrl);
    await markRepoUnreachable(db, "acme--web");

    await upsertThreads(db, [thread({ id: "8002" })], null, 1792000002000, resolveUrl);
    const rows = await db
      .select()
      .from(schema.repositories)
      .where(eq(schema.repositories.id, "acme--web"));
    expect(rows[0]?.unreachable).toBe(0);
  });
});

describe("threads without a repository", () => {
  // A thread with no repository name belongs to no repository, so it is
  // skipped rather than stored under an empty identifier.
  test("a thread without a repository name is skipped", async () => {
    const db = createMemoryDb().db;
    const summary = await upsertThreads(
      db,
      [thread({ id: "8003", repoFullName: "" })],
      null,
      1792000001000,
      resolveUrl
    );

    expect(summary.upserted).toBe(0);
    expect(summary.discoveredRepos).toBe(0);
    expect(summary.seenRepoIds).toEqual([]);
    expect(await db.select().from(schema.notifications)).toHaveLength(0);
    expect(await db.select().from(schema.repositories)).toHaveLength(0);
  });
});
