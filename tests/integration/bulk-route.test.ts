import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, test, vi } from "vitest";
import { eq, inArray } from "drizzle-orm";
import { db } from "../support/db-client.node";
import { seedTestDataset } from "../support/fixtures";
import { startGitHubStandIn, type StandIn } from "../support/github-stand-in";
import { withEnv } from "../support/test-env";
import { mutedSubjects, notifications, writebackQueue } from "@/db/schema";

vi.mock("@/db/client", async () => {
  const mod = await import("../support/db-client.node");
  return { db: mod.db };
});

/**
 * `POST /api/notifications/bulk`.
 *
 * The bulk handler is the one place where a local change and a remote change
 * have to agree. Every action changes the database first and then tries to
 * tell GitHub about it. When the remote call fails, the work is queued for a
 * later retry instead of being lost, and the response says so.
 */

const NOW = Date.parse("2026-01-15T12:00:00Z");
const TOKEN = "test-token";

let standIn: StandIn;
let restoreEnv: (() => void) | null = null;

async function bulk(
  payload: unknown
): Promise<{ status: number; body: Record<string, unknown> }> {
  const { POST } = await import("@/app/api/notifications/bulk/route");
  const res = await POST(
    new Request("http://localhost/api/notifications/bulk", {
      method: "POST",
      body: JSON.stringify(payload),
    })
  );
  return { status: res.status, body: (await res.json()) as Record<string, unknown> };
}

async function row(id: string) {
  const rows = await db.select().from(notifications).where(eq(notifications.id, id));
  return rows[0];
}

async function queueRows() {
  return db.select().from(writebackQueue);
}

beforeAll(async () => {
  standIn = await startGitHubStandIn({ token: TOKEN });
});

afterAll(async () => {
  await standIn.close();
});

beforeEach(async () => {
  standIn.reset();
  restoreEnv = withEnv({
    GHN_TOKEN: TOKEN,
    GHN_API_BASE: standIn.url,
    GHN_NOW: String(NOW),
  });
  await db.delete(writebackQueue);
  await db.delete(mutedSubjects);
  await db.delete(notifications);
  await seedTestDataset(db, NOW);
});

afterEach(() => {
  restoreEnv?.();
  restoreEnv = null;
});

describe("the bulk input validation", () => {
  test("a missing id list is refused", async () => {
    const { status, body } = await bulk({ action: "done" });
    expect(status).toBe(400);
    expect(body.error).toBe(
      "ids must be non-empty and action one of done, unsubscribe, unread, read"
    );
  });

  test("an empty id list is refused", async () => {
    const { status } = await bulk({ ids: [], action: "done" });
    expect(status).toBe(400);
  });

  test("an id list that is not an array is refused", async () => {
    const { status } = await bulk({ ids: "n_001", action: "done" });
    expect(status).toBe(400);
  });

  test("an id list without a single string is refused", async () => {
    const { status } = await bulk({ ids: [1, 2, null], action: "done" });
    expect(status).toBe(400);
  });

  test("an unknown action is refused", async () => {
    const { status, body } = await bulk({ ids: ["n_001"], action: "explode" });
    expect(status).toBe(400);
    expect(body.error).toBe(
      "ids must be non-empty and action one of done, unsubscribe, unread, read"
    );
  });

  test("a missing action is refused", async () => {
    const { status } = await bulk({ ids: ["n_001"] });
    expect(status).toBe(400);
  });

  test("a refused request changes nothing", async () => {
    await bulk({ ids: [], action: "done" });
    expect(await queueRows()).toHaveLength(0);
    expect((await row("n_001"))?.isDone).toBe(0);
  });
});

describe("the bulk unknown id rejection", () => {
  test("an id that is not in the database is refused", async () => {
    const { status, body } = await bulk({
      ids: ["n_001", "does-not-exist"],
      action: "done",
    });
    expect(status).toBe(422);
    expect(body.error).toBe("unknown notification id");
  });

  test("a refused request changes nothing", async () => {
    await bulk({ ids: ["does-not-exist"], action: "done" });
    expect((await row("n_001"))?.isDone).toBe(0);
    expect(await queueRows()).toHaveLength(0);
  });

  test("duplicate ids are collapsed into one", async () => {
    const { status, body } = await bulk({
      ids: ["n_001", "n_001"],
      action: "unread",
    });
    expect(status).toBe(200);
    expect(body.updated).toBe(1);
  });
});

describe("the done action", () => {
  test("it marks the notification done and tells GitHub", async () => {
    const { status, body } = await bulk({ ids: ["n_001"], action: "done" });
    expect(status).toBe(200);
    expect(body).toEqual({ updated: 1, action: "done" });
    expect(body.remote).toBeUndefined();

    const updated = await row("n_001");
    expect(updated?.isDone).toBe(1);
    expect(updated?.localUnread).toBe(0);

    const requests = standIn.requests.filter((r) => r.method === "DELETE");
    expect(requests.map((r) => r.path)).toEqual([
      "/notifications/threads/n_001",
    ]);
    expect(await queueRows()).toHaveLength(0);
  });

  test("it marks every notification of the batch", async () => {
    const { body } = await bulk({ ids: ["n_001", "n_002"], action: "done" });
    expect(body.updated).toBe(2);
    expect((await row("n_001"))?.isDone).toBe(1);
    expect((await row("n_002"))?.isDone).toBe(1);
  });
});

describe("the repo-wide done action", () => {
  test("another action with a repository id is refused", async () => {
    const { status, body } = await bulk({
      repositoryId: "acme--web",
      action: "unsubscribe",
    });
    expect(status).toBe(400);
    expect(body.error).toBe(
      "repositoryId must be non-empty and action one of done, read"
    );
    expect((await row("n_001"))?.isDone).toBe(0);
  });

  test("an empty repository id is refused", async () => {
    const { status } = await bulk({ repositoryId: "", action: "done" });
    expect(status).toBe(400);
  });

  test("it marks every pending notification of the repository done", async () => {
    const before = await db
      .select({ id: notifications.id })
      .from(notifications)
      .where(eq(notifications.repositoryId, "acme--web"));
    expect(before.length).toBeGreaterThan(1);

    const { status, body } = await bulk({
      repositoryId: "acme--web",
      action: "done",
    });
    expect(status).toBe(200);
    expect(body).toMatchObject({
      updated: before.length,
      action: "done",
      repositoryId: "acme--web",
    });

    const after = await db
      .select({ id: notifications.id, isDone: notifications.isDone })
      .from(notifications)
      .where(eq(notifications.repositoryId, "acme--web"));
    expect(after.every((r) => r.isDone === 1)).toBe(true);

    const other = await row("n_002");
    expect(other?.isDone).toBe(0);

    const requests = standIn.requests.filter((r) => r.method === "DELETE");
    expect(requests.length).toBe(before.length);
  });

  test("it reports zero when the repository has nothing pending", async () => {
    await bulk({ repositoryId: "acme--web", action: "done" });
    const { status, body } = await bulk({
      repositoryId: "acme--web",
      action: "done",
    });
    expect(status).toBe(200);
    expect(body).toEqual({
      updated: 0,
      action: "done",
      repositoryId: "acme--web",
    });
  });

  test("a failing remote call still hides the repo locally and queues the work", async () => {
    standIn.setScenario("/notifications/threads/n_001", { status: 500 });
    const { body } = await bulk({
      repositoryId: "acme--web",
      action: "done",
    });
    expect(body).toMatchObject({
      action: "done",
      repositoryId: "acme--web",
      remote: "partial",
      queued: 1,
    });
    expect((await row("n_001"))?.isDone).toBe(1);
    const queued = await queueRows();
    expect(queued.map((q) => q.threadId)).toContain("n_001");
  });
});

describe("the repo-wide read action", () => {
  test("it marks every unread notification of the repository read", async () => {
    const before = await db
      .select({ id: notifications.id })
      .from(notifications)
      .where(eq(notifications.repositoryId, "acme--api"));
    expect(before.length).toBeGreaterThan(1);

    const { status, body } = await bulk({
      repositoryId: "acme--api",
      action: "read",
    });
    expect(status).toBe(200);
    expect(body).toMatchObject({
      updated: before.length,
      action: "read",
      repositoryId: "acme--api",
    });

    const after = await db
      .select({
        id: notifications.id,
        isRead: notifications.isRead,
        isDone: notifications.isDone,
      })
      .from(notifications)
      .where(eq(notifications.repositoryId, "acme--api"));
    expect(after.every((r) => r.isRead === 1)).toBe(true);
    expect(after.every((r) => r.isDone === 0)).toBe(true);

    // Another repository is untouched: n_001 (acme/web, already read)
    // stays read and n_003 (acme/mobile, unread) stays unread.
    expect((await row("n_001"))?.isRead).toBe(1);
    expect((await row("n_003"))?.isRead).toBe(0);

    const requests = standIn.requests.filter((r) => r.method === "PATCH");
    expect(requests.length).toBe(before.length);
  });

  test("it marks done-but-unread notifications read", async () => {
    // Regression: accelins/it-pylon showed 202 done rows with 87 still
    // unread, but repo-wide read reported "No pending items" and changed
    // nothing because it filtered on isDone only.
    await bulk({ repositoryId: "acme--api", action: "done" });
    const doneRows = await db
      .select({ id: notifications.id, isRead: notifications.isRead })
      .from(notifications)
      .where(eq(notifications.repositoryId, "acme--api"));
    expect(doneRows.every((r) => r.isRead === 0)).toBe(true);

    const { status, body } = await bulk({
      repositoryId: "acme--api",
      action: "read",
    });
    expect(status).toBe(200);
    expect(body).toMatchObject({
      updated: doneRows.length,
      action: "read",
      repositoryId: "acme--api",
    });

    const after = await db
      .select({ id: notifications.id, isRead: notifications.isRead })
      .from(notifications)
      .where(eq(notifications.repositoryId, "acme--api"));
    expect(after.every((r) => r.isRead === 1)).toBe(true);
  });

  test("it reports zero when the repository is already fully read", async () => {
    // acme--web is seeded fully read, so the first call has nothing to do.
    const { status, body } = await bulk({
      repositoryId: "acme--web",
      action: "read",
    });
    expect(status).toBe(200);
    expect(body).toEqual({
      updated: 0,
      action: "read",
      repositoryId: "acme--web",
    });
  });

  test("it reports zero when the repository has nothing pending", async () => {
    await bulk({ repositoryId: "acme--web", action: "done" });
    const { status, body } = await bulk({
      repositoryId: "acme--web",
      action: "read",
    });
    expect(status).toBe(200);
    expect(body).toEqual({
      updated: 0,
      action: "read",
      repositoryId: "acme--web",
    });
  });
});

describe("the read action", () => {
  test("it marks the notification read and tells GitHub", async () => {
    const { status, body } = await bulk({ ids: ["n_001"], action: "read" });
    expect(status).toBe(200);
    expect(body).toEqual({ updated: 1, action: "read" });

    const updated = await row("n_001");
    expect(updated?.isRead).toBe(1);
    expect(updated?.localUnread).toBe(0);
    expect(updated?.isDone).toBe(0);

    const requests = standIn.requests.filter((r) => r.method === "PATCH");
    expect(requests.map((r) => r.path)).toEqual([
      "/notifications/threads/n_001",
    ]);
  });
});

describe("the unread action", () => {
  test("it marks the notification unread locally and asks nothing of GitHub", async () => {
    const { status, body } = await bulk({ ids: ["n_001"], action: "unread" });
    expect(status).toBe(200);
    expect(body).toEqual({ updated: 1, action: "unread" });

    const updated = await row("n_001");
    expect(updated?.isRead).toBe(0);
    expect(updated?.isDone).toBe(0);
    expect(updated?.localUnread).toBe(1);
    expect(standIn.requests).toHaveLength(0);
  });
});

describe("the unsubscribe action", () => {
  test("it marks the notification done and ignores the subscription", async () => {
    const { status, body } = await bulk({ ids: ["n_001"], action: "unsubscribe" });
    expect(status).toBe(200);
    expect(body).toEqual({ updated: 1, action: "unsubscribe" });
    expect(body.remote).toBeUndefined();

    expect((await row("n_001"))?.isDone).toBe(1);
    const muted = await db
      .select()
      .from(mutedSubjects)
      .where(eq(mutedSubjects.repositoryId, "acme--web"));
    expect(muted.map((m) => m.subject)).toEqual(["Fix flaky login redirect"]);

    const requests = standIn.requests.filter((r) => r.method === "PUT");
    expect(requests.map((r) => r.path)).toEqual([
      "/notifications/threads/n_001/subscription",
    ]);
    expect(requests[0]?.body).toBe(JSON.stringify({ ignored: true }));
    expect(await queueRows()).toHaveLength(0);
  });

  test("two repositories produce two remote calls", async () => {
    const { body } = await bulk({ ids: ["n_001", "n_002"], action: "unsubscribe" });
    expect(body.updated).toBe(2);
    const requests = standIn.requests.filter((r) => r.method === "PUT");
    expect(requests.map((r) => r.path).sort()).toEqual([
      "/notifications/threads/n_001/subscription",
      "/notifications/threads/n_002/subscription",
    ]);
  });
});

describe("the remote failure path", () => {
  test("a failing done call hides the notification locally and queues the work", async () => {
    standIn.setScenario("/notifications/threads/n_001", { status: 500 });
    const { status, body } = await bulk({ ids: ["n_001"], action: "done" });
    expect(status).toBe(200);
    expect(body).toMatchObject({
      updated: 1,
      action: "done",
      remote: "partial",
      queued: 1,
      error: "unknown",
    });

    expect((await row("n_001"))?.isDone).toBe(1);
    const queued = await queueRows();
    expect(queued).toHaveLength(1);
    expect(queued[0]?.threadId).toBe("n_001");
    expect(queued[0]?.action).toBe("done");
    expect(queued[0]?.lastError).toBe("unknown");
    expect(queued[0]?.attempts).toBe(0);
    expect(queued[0]?.createdAt).toBe(NOW);
  });

  test("a failing subscription call queues the unsubscribe", async () => {
    standIn.setScenario("/notifications/threads/n_001/subscription", {
      status: 500,
    });
    const { status, body } = await bulk({
      ids: ["n_001"],
      action: "unsubscribe",
    });
    expect(status).toBe(200);
    expect(body).toMatchObject({
      updated: 1,
      action: "unsubscribe",
      remote: "partial",
      queued: 1,
    });
    const queued = await queueRows();
    expect(queued).toHaveLength(1);
    expect(queued[0]?.action).toBe("unsubscribe");
    expect(queued[0]?.lastError).toBe("unknown");
  });

  test("a rejected credential queues the work with an auth reason", async () => {
    standIn.setScenario("/notifications/threads/n_001", { status: 401 });
    const { body } = await bulk({ ids: ["n_001"], action: "done" });
    expect(body).toMatchObject({
      updated: 1,
      remote: "partial",
      queued: 1,
      error: "auth",
    });
    expect((await row("n_001"))?.isDone).toBe(1);
    const queued = await queueRows();
    expect(queued[0]?.lastError).toBe("auth");
  });

  test("mixed remote failures report the first error reason", async () => {
    standIn.setScenario("/notifications/threads/n_001", { status: 500 });
    standIn.setScenario("/notifications/threads/n_002", { status: 401 });
    const { body } = await bulk({ ids: ["n_001", "n_002"], action: "done" });
    expect(body).toMatchObject({
      updated: 2,
      remote: "partial",
      queued: 2,
      error: "unknown",
    });
  });
});

describe("the write-back queue fallback", () => {
  test("without a credential the work is queued instead of lost", async () => {
    restoreEnv?.();
    restoreEnv = withEnv({
      GHN_TOKEN: "",
      GHN_API_BASE: standIn.url,
      GHN_NOW: String(NOW),
    });
    const { status, body } = await bulk({ ids: ["n_001"], action: "done" });
    expect(status).toBe(200);
    expect(body).toMatchObject({
      updated: 1,
      action: "done",
      remote: "partial",
      queued: 1,
      error: "auth",
    });
    expect(standIn.requests).toHaveLength(0);
    expect((await row("n_001"))?.isDone).toBe(1);

    const queued = await queueRows();
    expect(queued).toHaveLength(1);
    expect(queued[0]?.threadId).toBe("n_001");
    expect(queued[0]?.action).toBe("done");
    expect(queued[0]?.lastError).toBe("auth");
  });

  test("without a credential an unsubscribe is queued as well", async () => {
    restoreEnv?.();
    restoreEnv = withEnv({
      GHN_TOKEN: "",
      GHN_API_BASE: standIn.url,
      GHN_NOW: String(NOW),
    });
    const { body } = await bulk({ ids: ["n_001"], action: "unsubscribe" });
    expect(body).toMatchObject({
      updated: 1,
      remote: "partial",
      queued: 1,
    });
    expect(standIn.requests).toHaveLength(0);
    const queued = await queueRows();
    expect(queued).toHaveLength(1);
    expect(queued[0]?.action).toBe("unsubscribe");
  });

  test("without a credential the unread action stays local", async () => {
    restoreEnv?.();
    restoreEnv = withEnv({
      GHN_TOKEN: "",
      GHN_API_BASE: standIn.url,
      GHN_NOW: String(NOW),
    });
    const { body } = await bulk({ ids: ["n_001"], action: "unread" });
    expect(body).toEqual({ updated: 1, action: "unread" });
    expect(await queueRows()).toHaveLength(0);
    expect((await row("n_001"))?.localUnread).toBe(1);
  });

  test("the queued work names the notifications it belongs to", async () => {
    standIn.setScenario("/notifications/threads/n_001", { status: 500 });
    standIn.setScenario("/notifications/threads/n_002", { status: 500 });
    await bulk({ ids: ["n_001", "n_002"], action: "done" });
    const queued = await queueRows();
    expect(queued.map((q) => q.threadId).sort()).toEqual(["n_001", "n_002"]);
    const rows = await db
      .select()
      .from(notifications)
      .where(inArray(notifications.id, ["n_001", "n_002"]));
    expect(rows.every((r) => r.isDone === 1)).toBe(true);
  });
});
