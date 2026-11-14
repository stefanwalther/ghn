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

const resolve = async () => ({
  ok: true, url: "https://github.com/acme/web/pull/12", state: "open", merged: false,
});

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
      resolve
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

    await upsertThreads(db, [thread({ id: "t3" })], null, 1792000001000, resolve);
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
      resolve
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
      resolve
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
      resolve
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
      resolve
    );
    const rows = await db
      .select()
      .from(schema.notifications)
      .where(eq(schema.notifications.id, "t7"));
    expect(rows[0]?.subject).toBe("Untitled");
  });

  test.each([false, true])("successful snapshots persist state, merged and URL (existing=%s)", async (existing) => {
    const db = createMemoryDb().db;
    if (existing) await seedRow(db);
    await upsertThreads(db, [thread()], null, 1792000001000, async () => ({
      ok: true, url: "https://github.com/acme/web/pull/12", state: "closed", merged: true,
    }));
    expect((await db.select().from(schema.notifications))[0]).toMatchObject({
      subjectState: "closed", prMerged: 1, sourceUrl: "https://github.com/acme/web/pull/12",
    });
  });

  test("a failed snapshot keeps the stored state, merged flag and URL", async () => {
    const db = createMemoryDb().db;
    await seedRow(db, { subjectState: "closed", prMerged: 1 });
    await upsertThreads(db, [thread()], null, 1792000001000, async () => ({
      ok: false, url: "https://github.com/acme/web/pull/12", state: null, merged: null,
    }));
    expect((await db.select().from(schema.notifications))[0]).toMatchObject({
      subjectState: "closed", prMerged: 1, sourceUrl: "https://github.com/acme/web/pull/1",
    });
  });

  test("a new row with a failed snapshot stores unknown state and the fallback URL", async () => {
    const db = createMemoryDb().db;
    await upsertThreads(db, [thread()], null, 1792000001000, async () => ({
      ok: false, url: "https://github.com/acme/web/pull/12", state: null, merged: null,
    }));
    expect((await db.select().from(schema.notifications))[0]).toMatchObject({
      subjectState: null, prMerged: 0, sourceUrl: "https://github.com/acme/web/pull/12",
    });
  });

  test.each([1792000000000, 1791000000000])("a non-advanced timestamp %s is never resolved", async (updatedAt) => {
    const db = createMemoryDb().db;
    await seedRow(db, { githubUpdatedAt: thread().updatedAt, subjectState: "closed", prMerged: 1 });
    const resolver = vi.fn(resolve);
    await upsertThreads(db, [thread({ updatedAt })], null, 1792000001000, resolver);
    expect(resolver).not.toHaveBeenCalled();
    expect((await db.select().from(schema.notifications))[0]).toMatchObject({
      subjectState: "closed", prMerged: 1, sourceUrl: "https://github.com/acme/web/pull/1",
    });
  });

  test("only pull requests can store a merged flag", async () => {
    const db = createMemoryDb().db;
    await upsertThreads(db, [thread({ subjectType: "Issue" })], null, 1792000001000, async () => ({
      ok: true, url: "https://github.com/acme/web/issues/12", state: "closed", merged: true,
    }));
    expect((await db.select().from(schema.notifications))[0]?.prMerged).toBe(0);
  });
});
