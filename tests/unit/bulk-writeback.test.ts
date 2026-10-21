import { describe, expect, test } from "vitest";
import { eq } from "drizzle-orm";
import { createMemoryDb } from "../support/db-client.node";
import * as schema from "@/db/schema";
import { enqueueWriteback } from "@/lib/queue";
import { reapplyPendingReads, upsertThreads } from "@/lib/sync";
import type { GhThread } from "@/lib/github";

function thread(overrides: Partial<GhThread> = {}): GhThread {
  return {
    id: "9001",
    unread: true,
    reason: "subscribed",
    updatedAt: 1792000001000,
    subjectTitle: "Fix flaky login",
    subjectType: "PullRequest",
    subjectApiUrl: "https://api.github.com/repos/acme/web/pulls/12",
    repoFullName: "acme/web",
    repoOwnerLogin: "acme",
    repoHtmlUrl: "https://github.com/acme/web",
    threadUrl: "https://api.github.com/notifications/threads/9001",
    ...overrides,
  };
}

const resolveUrl = async () => "https://github.com/acme/web/pull/12";

describe("pending read preservation across sync", () => {
  test("reapply restores a queued read that upsert reverted", async () => {
    const db = createMemoryDb().db;
    await upsertThreads(db, [thread({ unread: false })], null, 1792000000000, resolveUrl);
    await enqueueWriteback(db, "9001", "read", "network", 1792000000000);
    // GitHub still reports unread while the PATCH retry is pending.
    await upsertThreads(
      db,
      [thread({ unread: true, updatedAt: 1792000002000 })],
      null,
      1792000003000,
      resolveUrl
    );
    const reverted = await db
      .select()
      .from(schema.notifications)
      .where(eq(schema.notifications.id, "9001"));
    expect(reverted[0]?.isRead).toBe(0);
    await reapplyPendingReads(db);
    const restored = await db
      .select()
      .from(schema.notifications)
      .where(eq(schema.notifications.id, "9001"));
    expect(restored[0]?.isRead).toBe(1);
  });

  test("reapply respects an explicit local unread", async () => {
    const db = createMemoryDb().db;
    await upsertThreads(db, [thread({ unread: false })], null, 1792000000000, resolveUrl);
    await enqueueWriteback(db, "9001", "read", "network", 1792000000000);
    await db
      .update(schema.notifications)
      .set({ isRead: 0, localUnread: 1 })
      .where(eq(schema.notifications.id, "9001"));
    await reapplyPendingReads(db);
    const rows = await db
      .select()
      .from(schema.notifications)
      .where(eq(schema.notifications.id, "9001"));
    expect(rows[0]?.isRead).toBe(0);
  });
});
