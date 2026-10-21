import { describe, expect, test, vi } from "vitest";
import { eq } from "drizzle-orm";
import { createMemoryDb } from "../support/db-client.node";
import * as schema from "@/db/schema";
import { upsertThreads } from "@/lib/sync";
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

async function seedRow(
  db: ReturnType<typeof createMemoryDb>["db"],
  values: Partial<typeof schema.notifications.$inferInsert> = {}
): Promise<void> {
  await db
    .insert(schema.repositories)
    .values({
      id: "acme--web",
      fullName: "acme/web",
      ownership: "owned",
      rhythm: "immediate",
      lastPromotedAt: null,
      nextDueAt: null,
      snoozedUntil: null,
      unreachable: 0,
      createdAt: 1000,
    })
    .onConflictDoNothing();
  await db.insert(schema.notifications).values({
    id: "t1",
    repositoryId: "acme--web",
    subject: "Old subject",
    subjectType: "PullRequest",
    subjectState: "open",
    reason: "subscribed",
    prMerged: 0,
    createdAt: 1000,
    githubUpdatedAt: 1791000000000,
    isRead: 1,
    isDone: 0,
    localUnread: 0,
    sourceUrl: "https://github.com/acme/web/pull/1",
    ...values,
  });
}

describe("the thread upsert", () => {
  // A thread without a subject title is stored under a placeholder, so
  // the row is never blank.
  test("a thread without a subject title is stored as untitled", async () => {
    const db = createMemoryDb().db;
    await upsertThreads(
      db,
      [thread({ id: "t2", subjectTitle: "" })],
      null,
      1792000001000,
      resolveUrl
    );
    const rows = await db
      .select()
      .from(schema.notifications)
      .where(eq(schema.notifications.id, "t2"));
    expect(rows[0]?.subject).toBe("Untitled");
  });

  // A stored row that has no GitHub timestamp is older than anything, so
  // it is refreshed.
  test("a stored row without a github timestamp is refreshed", async () => {
    const db = createMemoryDb().db;
    await seedRow(db, { id: "t3", githubUpdatedAt: null });

    await upsertThreads(db, [thread({ id: "t3" })], null, 1792000001000, resolveUrl);
    const rows = await db
      .select()
      .from(schema.notifications)
      .where(eq(schema.notifications.id, "t3"));
    expect(rows[0]?.githubUpdatedAt).toBe(thread().updatedAt);
    expect(rows[0]?.sourceUrl).toBe("https://github.com/acme/web/pull/12");
  });

  // A stored row that has not changed keeps the state it already had.
  test("a stored row that has not changed keeps its own state", async () => {
    const db = createMemoryDb().db;
    await seedRow(db, {
      id: "t4",
      githubUpdatedAt: 1792000000000,
      subjectState: null,
    });

    await upsertThreads(
      db,
      [thread({ id: "t4", updatedAt: 1791000000000 })],
      null,
      1792000001000,
      resolveUrl
    );
    const rows = await db
      .select()
      .from(schema.notifications)
      .where(eq(schema.notifications.id, "t4"));
    expect(rows[0]?.subjectState).toBeNull();
    expect(rows[0]?.prMerged).toBe(0);
    expect(rows[0]?.sourceUrl).toBe("https://github.com/acme/web/pull/1");
  });

  // A thread that arrives unread marks the stored row unread again.
  test("an unread thread marks the stored row unread", async () => {
    const db = createMemoryDb().db;
    await seedRow(db, { id: "t5", isRead: 1, localUnread: 0 });

    await upsertThreads(
      db,
      [thread({ id: "t5", unread: true })],
      null,
      1792000001000,
      resolveUrl
    );
    const rows = await db
      .select()
      .from(schema.notifications)
      .where(eq(schema.notifications.id, "t5"));
    expect(rows[0]?.isRead).toBe(0);
  });

  // A thread that arrives read marks the stored row read, unless the user
  // marked it unread locally.
  test("a read thread marks the stored row read", async () => {
    const db = createMemoryDb().db;
    await seedRow(db, { id: "t6", isRead: 0, localUnread: 0 });

    await upsertThreads(
      db,
      [thread({ id: "t6", unread: false })],
      null,
      1792000001000,
      resolveUrl
    );
    const rows = await db
      .select()
      .from(schema.notifications)
      .where(eq(schema.notifications.id, "t6"));
    expect(rows[0]?.isRead).toBe(1);
  });

  // A stored row whose subject title is replaced by an empty one keeps a
  // placeholder, never a blank.
  test("a stored row that gets an empty subject title keeps a placeholder", async () => {
    const db = createMemoryDb().db;
    await seedRow(db, { id: "t7", githubUpdatedAt: 1791000000000 });

    await upsertThreads(
      db,
      [thread({ id: "t7", subjectTitle: "" })],
      null,
      1792000001000,
      resolveUrl
    );
    const rows = await db
      .select()
      .from(schema.notifications)
      .where(eq(schema.notifications.id, "t7"));
    expect(rows[0]?.subject).toBe("Untitled");
  });

  // A stored row that is refreshed picks up the merged flag of its
  // subject, so the merged filter stays correct.
  test("a stored row that is refreshed picks up the merged flag", async () => {
    const apiUrl = "https://api.example.test/repos/acme/web/pulls/77";
    vi.stubGlobal(
      "fetch",
      async () =>
        new Response(
          JSON.stringify({ html_url: "https://github.com/acme/web/pull/77", merged: true }),
          { headers: { "Content-Type": "application/json" } }
        )
    );
    const github = await import("@/lib/github");
    await github.resolveSubjectHtmlUrl(
      "token",
      thread({ id: "t8", subjectApiUrl: apiUrl }),
      new Map()
    );
    vi.unstubAllGlobals();

    const db = createMemoryDb().db;
    await seedRow(db, { id: "t8", githubUpdatedAt: 1791000000000 });

    await upsertThreads(
      db,
      [thread({ id: "t8", subjectApiUrl: apiUrl })],
      null,
      1792000001000,
      resolveUrl
    );
    const rows = await db
      .select()
      .from(schema.notifications)
      .where(eq(schema.notifications.id, "t8"));
    expect(rows[0]?.prMerged).toBe(1);
  });
});
