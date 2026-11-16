import { afterEach, describe, expect, test, vi } from "vitest";
import { eq } from "drizzle-orm";
import { createMemoryDb } from "../support/db-client.node";
import * as schema from "@/db/schema";
import {
  markRepoUnreachable,
  upsertThreads,
} from "@/lib/sync";
import { resolveSubject, type GhThread } from "@/lib/github";

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

const resolve = async () => ({
  ok: true, url: "https://github.com/acme/web/pull/12", state: "open", merged: false,
});

afterEach(() => vi.unstubAllGlobals());

describe("subject freshness across calls", () => {
  test("two calls for one thread fetch the subject twice", async () => {
    const fetch = vi.fn()
      .mockResolvedValueOnce(Response.json({ state: "open", merged: false }))
      .mockResolvedValueOnce(Response.json({ state: "closed", merged: true }));
    vi.stubGlobal("fetch", fetch);
    expect(await resolveSubject("token", thread())).toMatchObject({ ok: true, state: "open", merged: false });
    expect(await resolveSubject("token", thread())).toMatchObject({ ok: true, state: "closed", merged: true });
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  test("a failed fetch returns unknown state and a later call retries", async () => {
    const fetch = vi.fn()
      .mockResolvedValueOnce(new Response("{}", { status: 500 }))
      .mockResolvedValueOnce(Response.json({ state: "closed", merged: true }));
    vi.stubGlobal("fetch", fetch);
    expect(await resolveSubject("token", thread())).toEqual({
      ok: false, url: "https://github.com/acme/web/pull/12", state: null, merged: null,
    });
    expect(await resolveSubject("token", thread())).toMatchObject({ ok: true, state: "closed", merged: true });
    expect(fetch).toHaveBeenCalledTimes(2);
  });
});

describe("unreachable repositories", () => {
  // A repository that cannot be reached is marked, so the inbox can say so
  // instead of showing an empty list.
  test("a repository that cannot be reached is marked unreachable", async () => {
    const db = createMemoryDb().db;
    await upsertThreads(db, [thread()], null, 1792000001000, resolve);

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
    await upsertThreads(db, [thread()], null, 1792000001000, resolve);
    await markRepoUnreachable(db, "acme--web");

    await upsertThreads(db, [thread({ id: "8002" })], null, 1792000002000, resolve);
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
      resolve
    );

    expect(summary.upserted).toBe(0);
    expect(summary.discoveredRepos).toBe(0);
    expect(summary.seenRepoIds).toEqual([]);
    expect(await db.select().from(schema.notifications)).toHaveLength(0);
    expect(await db.select().from(schema.repositories)).toHaveLength(0);
  });
});
