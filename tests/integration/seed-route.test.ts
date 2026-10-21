import { afterEach, beforeAll, beforeEach, describe, expect, test, vi } from "vitest";
import { eq } from "drizzle-orm";
import { db } from "../support/db-client.node";
import { seedTestDataset } from "../support/fixtures";
import { withEnv } from "../support/test-env";
import { mutedSubjects, notifications, repositories } from "@/db/schema";

vi.mock("@/db/client", async () => {
  const mod = await import("../support/db-client.node");
  return { db: mod.db };
});

/**
 * `POST /api/notifications/seed`.
 *
 * The seed route replaces the inbox with the shared dataset. It is the one
 * route that can destroy data, so it refuses to run in production and it
 * refuses to run over live rows unless it is forced.
 */

const NOW = Date.parse("2026-01-15T12:00:00Z");

type SeedRoute = typeof import("@/app/api/notifications/seed/route");

let seedRoute: SeedRoute;

async function seed(payload: unknown = {}): Promise<{
  status: number;
  body: Record<string, unknown>;
}> {
  const res = await seedRoute.POST(
    new Request("http://localhost/api/notifications/seed", {
      method: "POST",
      body: JSON.stringify(payload),
    })
  );
  return { status: res.status, body: (await res.json()) as Record<string, unknown> };
}

beforeAll(async () => {
  seedRoute = await import("@/app/api/notifications/seed/route");
});

let restoreEnv: (() => void) | null = null;

beforeEach(async () => {
  restoreEnv = withEnv({ GHN_NOW: String(NOW) });
  await db.delete(mutedSubjects);
  await db.delete(notifications);
  await db.delete(repositories);
  await seedTestDataset(db, NOW);
});

afterEach(() => {
  restoreEnv?.();
  restoreEnv = null;
});

describe("the production refusal", () => {
  test("the seed does not run in production", async () => {
    restoreEnv?.();
    restoreEnv = withEnv({ GHN_NOW: String(NOW), NODE_ENV: "production" });
    const { status, body } = await seed();
    expect(status).toBe(403);
    expect(body.error).toBe("disabled");
  });

  test("nothing was changed by the refused seed", async () => {
    restoreEnv?.();
    restoreEnv = withEnv({ GHN_NOW: String(NOW), NODE_ENV: "production" });
    await seed();
    const rows = await db.select().from(notifications);
    expect(rows).toHaveLength(200);
  });
});

describe("the live data guard", () => {
  test("the seed refuses to run over live rows", async () => {
    await db.insert(notifications).values({
      id: "live_001",
      repositoryId: "acme--web",
      subject: "A live notification",
      subjectType: "Issue",
      subjectState: "open",
      reason: "mention",
      createdAt: NOW,
      githubUpdatedAt: null,
      isRead: 0,
      isDone: 0,
      localUnread: 0,
      sourceUrl: "https://github.com/acme/web/issues/1",
    });
    const { status, body } = await seed();
    expect(status).toBe(409);
    expect(body.error).toBe(
      "live rows present; reseed refused without { force: true }"
    );
  });

  test("the refused seed left the live row alone", async () => {
    await db.insert(notifications).values({
      id: "live_001",
      repositoryId: "acme--web",
      subject: "A live notification",
      subjectType: "Issue",
      subjectState: "open",
      reason: "mention",
      createdAt: NOW,
      githubUpdatedAt: null,
      isRead: 0,
      isDone: 0,
      localUnread: 0,
      sourceUrl: "https://github.com/acme/web/issues/1",
    });
    await seed();
    const rows = await db
      .select()
      .from(notifications)
      .where(eq(notifications.id, "live_001"));
    expect(rows).toHaveLength(1);
  });
});

describe("the reseed", () => {
  test("it loads the shared dataset", async () => {
    const { status, body } = await seed();
    expect(status).toBe(200);
    expect(body).toEqual({ repositories: 10, notifications: 200 });

    const rows = await db.select().from(notifications);
    expect(rows).toHaveLength(200);
    const repos = await db.select().from(repositories);
    expect(repos).toHaveLength(10);
  });

  test("it uses the pinned clock", async () => {
    await seed();
    const rows = await db.select().from(notifications);
    const newest = Math.max(...rows.map((r) => r.createdAt));
    expect(newest).toBe(NOW - 60 * 60 * 1000);
    const oldest = Math.min(...rows.map((r) => r.createdAt));
    expect(oldest).toBe(NOW - 16800 * 60 * 60 * 1000);
  });

  test("it replaces what was there before", async () => {
    await db
      .update(notifications)
      .set({ subject: "changed" })
      .where(eq(notifications.id, "n_001"));
    await seed();
    const rows = await db
      .select()
      .from(notifications)
      .where(eq(notifications.id, "n_001"));
    expect(rows[0]?.subject).toBe("Fix flaky login redirect");
  });

  test("a forced reseed goes over the live rows", async () => {
    await db.insert(notifications).values({
      id: "live_001",
      repositoryId: "acme--web",
      subject: "A live notification",
      subjectType: "Issue",
      subjectState: "open",
      reason: "mention",
      createdAt: NOW,
      githubUpdatedAt: null,
      isRead: 0,
      isDone: 0,
      localUnread: 0,
      sourceUrl: "https://github.com/acme/web/issues/1",
    });
    const { status, body } = await seed({ force: true });
    expect(status).toBe(200);
    expect(body).toEqual({ repositories: 10, notifications: 200 });

    const rows = await db.select().from(notifications);
    expect(rows).toHaveLength(200);
    expect(rows.some((r) => r.id === "live_001")).toBe(false);
  });

  test("a muted subject lands done", async () => {
    await db.insert(mutedSubjects).values({
      repositoryId: "acme--web",
      subject: "Fix flaky login redirect",
    });
    await seed();
    const rows = await db
      .select()
      .from(notifications)
      .where(eq(notifications.id, "n_001"));
    expect(rows[0]?.isDone).toBe(1);
  });
});
