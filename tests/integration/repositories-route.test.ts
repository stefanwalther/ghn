import { beforeEach, describe, expect, test, vi } from "vitest";
import { eq } from "drizzle-orm";
import { db } from "../support/db-client.node";
import { seedTestDataset } from "../support/fixtures";
import { withEnv } from "../support/test-env";
import { notifications, repositories } from "@/db/schema";
import { computeNextDueAt, formatDueDate } from "@/lib/digest";

vi.mock("@/db/client", async () => {
  const mod = await import("../support/db-client.node");
  return { db: mod.db };
});

/**
 * `GET /api/repositories` and `PATCH /api/repositories/[id]`.
 *
 * The repositories screen shows every repository with the number of items
 * waiting for it, when its digest is due, and whether it is snoozed. The
 * patch handler is what changes the rhythm and the snooze.
 */

const NOW = Date.parse("2026-01-15T12:00:00Z");
const DAY = 24 * 60 * 60 * 1000;

interface RepoView {
  id: string;
  fullName: string;
  ownership: "owned" | "watched";
  rhythm: "immediate" | "weekly" | "biweekly" | "monthly";
  lastPromotedAt: number | null;
  nextDueAt: number | null;
  nextDueLabel: string;
  pendingCount: number;
  isDue: boolean;
  unreachable: boolean;
  snoozedUntil: number | null;
  isSnoozed: boolean;
  snoozeLabel: string;
  pinned: boolean;
}

async function list(): Promise<RepoView[]> {
  const { GET } = await import("@/app/api/repositories/route");
  const res = await GET();
  expect(res.status).toBe(200);
  const body = (await res.json()) as { repositories: RepoView[] };
  return body.repositories;
}

async function patch(
  id: string,
  payload: unknown
): Promise<{ status: number; body: Record<string, unknown> }> {
  const { PATCH } = await import("@/app/api/repositories/[id]/route");
  const res = await PATCH(
    new Request(`http://localhost/api/repositories/${id}`, {
      method: "PATCH",
      body: JSON.stringify(payload),
    }),
    { params: Promise.resolve({ id }) }
  );
  return { status: res.status, body: (await res.json()) as Record<string, unknown> };
}

function repoView(views: RepoView[], id: string): RepoView {
  const found = views.find((r) => r.id === id);
  if (!found) throw new Error(`no repository ${id}`);
  return found;
}

beforeEach(async () => {
  const restore = withEnv({ GHN_NOW: String(NOW) });
  try {
    await db.delete(notifications);
    await db.delete(repositories);
    await seedTestDataset(db, NOW);
  } finally {
    restore();
  }
});

describe("GET /api/repositories", () => {
  test("it lists every repository with its pending count", async () => {
    const views = await list();
    expect(views).toHaveLength(10);
    expect(repoView(views, "acme--web").pendingCount).toBe(10);
    expect(repoView(views, "acme--api").pendingCount).toBe(10);
    expect(repoView(views, "acme--mobile").pendingCount).toBe(10);
    expect(repoView(views, "vendor--slow-dep").pendingCount).toBe(25);
    expect(repoView(views, "vendor--ui-kit").pendingCount).toBe(25);
    expect(repoView(views, "oss--router").pendingCount).toBe(24);
    expect(repoView(views, "oss--docs").pendingCount).toBe(24);
    const total = views.reduce((sum, r) => sum + r.pendingCount, 0);
    expect(total).toBe(200);
  });

  test("it reports the ownership and the rhythm", async () => {
    const views = await list();
    expect(repoView(views, "acme--web")).toMatchObject({
      fullName: "acme/web",
      ownership: "owned",
      rhythm: "immediate",
    });
    expect(repoView(views, "vendor--slow-dep")).toMatchObject({
      fullName: "vendor/slow-dep",
      ownership: "watched",
      rhythm: "weekly",
    });
    expect(repoView(views, "oss--bundler").rhythm).toBe("biweekly");
    expect(repoView(views, "oss--docs").rhythm).toBe("monthly");
  });

  test("an immediate repository is due and has no next due date", async () => {
    const views = await list();
    const repo = repoView(views, "acme--web");
    expect(repo.isDue).toBe(true);
    expect(repo.nextDueAt).toBeNull();
    expect(repo.nextDueLabel).toBe("Immediate");
    expect(repo.lastPromotedAt).toBeNull();
  });

  test("a digest repository is not due and carries its next due date", async () => {
    const views = await list();
    const repo = repoView(views, "vendor--slow-dep");
    expect(repo.isDue).toBe(false);
    expect(repo.nextDueAt).toBe(computeNextDueAt("weekly", NOW - 2 * DAY));
    expect(repo.nextDueLabel).toBe(formatDueDate(repo.nextDueAt));
    expect(repo.lastPromotedAt).toBe(NOW - 2 * DAY);
    const monthly = repoView(views, "oss--docs");
    expect(monthly.nextDueAt).toBe(computeNextDueAt("monthly", NOW - 2 * DAY));
  });

  test("nothing is snoozed and nothing is unreachable to begin with", async () => {
    const views = await list();
    for (const repo of views) {
      expect(repo.isSnoozed).toBe(false);
      expect(repo.snoozeLabel).toBe("Not snoozed");
      expect(repo.unreachable).toBe(false);
      expect(repo.snoozedUntil).toBeNull();
    }
  });

  test("a done notification stops counting towards the pending count", async () => {
    await db
      .update(notifications)
      .set({ isDone: 1 })
      .where(eq(notifications.id, "n_001"));
    const views = await list();
    expect(repoView(views, "acme--web").pendingCount).toBe(9);
  });
});

describe("PATCH /api/repositories/[id]", () => {
  test("a rhythm change to a digest rhythm sets the next due date", async () => {
    const { status, body } = await patch("acme--web", { rhythm: "weekly" });
    expect(status).toBe(200);
    expect(body.rhythm).toBe("weekly");
    expect(body.nextDueAt).toBe(computeNextDueAt("weekly", NOW));
    expect(body.nextDueLabel).toBe(formatDueDate(computeNextDueAt("weekly", NOW)));
    expect(body.lastPromotedAt).toBeNull();

    const rows = await db
      .select()
      .from(repositories)
      .where(eq(repositories.id, "acme--web"));
    expect(rows[0]?.rhythm).toBe("weekly");
    expect(rows[0]?.nextDueAt).toBe(computeNextDueAt("weekly", NOW));
  });

  test("a rhythm change to immediate clears the due date and stamps the promotion", async () => {
    const { status, body } = await patch("vendor--slow-dep", { rhythm: "immediate" });
    expect(status).toBe(200);
    expect(body.rhythm).toBe("immediate");
    expect(body.nextDueAt).toBeNull();
    expect(body.nextDueLabel).toBe("Immediate");
    expect(body.lastPromotedAt).toBe(NOW);

    const rows = await db
      .select()
      .from(repositories)
      .where(eq(repositories.id, "vendor--slow-dep"));
    expect(rows[0]?.rhythm).toBe("immediate");
    expect(rows[0]?.nextDueAt).toBeNull();
    expect(rows[0]?.lastPromotedAt).toBe(NOW);
  });

  test("a rhythm change leaves the other fields alone", async () => {
    const { body } = await patch("acme--web", { rhythm: "biweekly" });
    expect(body.snoozedUntil).toBeNull();
    expect(body.isSnoozed).toBe(false);
    expect(body.snoozeLabel).toBe("Not snoozed");
    expect(body.fullName).toBe("acme/web");
    expect(body.ownership).toBe("owned");
  });

  test("a snooze sets the repository until the given instant", async () => {
    const until = NOW + 3 * 60 * 60 * 1000;
    const { status, body } = await patch("acme--web", { snoozedUntil: until });
    expect(status).toBe(200);
    expect(body.snoozedUntil).toBe(until);
    expect(body.isSnoozed).toBe(true);
    expect(body.snoozeLabel).not.toBe("Not snoozed");

    const rows = await db
      .select()
      .from(repositories)
      .where(eq(repositories.id, "acme--web"));
    expect(rows[0]?.snoozedUntil).toBe(until);
  });

  test("a snooze can be lifted again", async () => {
    await patch("acme--web", { snoozedUntil: NOW + 60 * 60 * 1000 });
    const { status, body } = await patch("acme--web", { snoozedUntil: null });
    expect(status).toBe(200);
    expect(body.snoozedUntil).toBeNull();
    expect(body.isSnoozed).toBe(false);
    expect(body.snoozeLabel).toBe("Not snoozed");
  });

  test("a rhythm and a snooze can change together", async () => {
    const until = NOW + 60 * 60 * 1000;
    const { status, body } = await patch("acme--web", {
      rhythm: "monthly",
      snoozedUntil: until,
    });
    expect(status).toBe(200);
    expect(body.rhythm).toBe("monthly");
    expect(body.nextDueAt).toBe(computeNextDueAt("monthly", NOW));
    expect(body.snoozedUntil).toBe(until);
    expect(body.isSnoozed).toBe(true);
  });

  test("the list reflects the change", async () => {
    await patch("acme--web", { rhythm: "weekly", snoozedUntil: NOW + 60 * 60 * 1000 });
    const views = await list();
    const repo = repoView(views, "acme--web");
    expect(repo.rhythm).toBe("weekly");
    expect(repo.isSnoozed).toBe(true);
    expect(repo.snoozeLabel).not.toBe("Not snoozed");
    expect(repo.nextDueAt).toBe(computeNextDueAt("weekly", NOW));
  });

  test("an unknown rhythm is refused", async () => {
    const { status, body } = await patch("acme--web", { rhythm: "hourly" });
    expect(status).toBe(400);
    expect(body.error).toBe(
      "`rhythm` must be `immediate`, `weekly`, `biweekly`, or `monthly`"
    );
  });

  test("a rhythm of the wrong type is refused", async () => {
    const { status } = await patch("acme--web", { rhythm: 7 });
    expect(status).toBe(400);
  });

  test("a snooze in the past is refused", async () => {
    const { status, body } = await patch("acme--web", {
      snoozedUntil: NOW - 1000,
    });
    expect(status).toBe(400);
    expect(body.error).toBe("`snoozedUntil` must be null or a future timestamp");
  });

  test("a snooze that is not a timestamp is refused", async () => {
    const { status } = await patch("acme--web", { snoozedUntil: "tomorrow" });
    expect(status).toBe(400);
  });

  test("an empty change is refused", async () => {
    const { status, body } = await patch("acme--web", {});
    expect(status).toBe(400);
    expect(body.error).toBe("nothing to update");
  });

  test("an unknown repository is reported as not found", async () => {
    const { status, body } = await patch("nope--nope", { rhythm: "weekly" });
    expect(status).toBe(404);
    expect(body.error).toBe("unknown repository");
  });
});

describe("PATCH /api/repositories/[id] pin", () => {
  test("repositories start unpinned in the list shape", async () => {
    const views = await list();
    for (const repo of views) {
      expect(repo.pinned).toBe(false);
    }
  });

  test("pinning flips the flag in the response and the database", async () => {
    const { status, body } = await patch("acme--web", { pinned: true });
    expect(status).toBe(200);
    expect(body.pinned).toBe(true);
    const rows = await db
      .select()
      .from(repositories)
      .where(eq(repositories.id, "acme--web"));
    expect(rows[0]?.pinned).toBe(1);
    const views = await list();
    expect(repoView(views, "acme--web").pinned).toBe(true);
  });

  test("a pin-only patch leaves rhythm and due dates untouched", async () => {
    await patch("acme--web", { rhythm: "weekly" });
    const before = await db
      .select()
      .from(repositories)
      .where(eq(repositories.id, "acme--web"));
    const { status } = await patch("acme--web", { pinned: true });
    expect(status).toBe(200);
    const rows = await db
      .select()
      .from(repositories)
      .where(eq(repositories.id, "acme--web"));
    expect(rows[0]?.rhythm).toBe("weekly");
    expect(rows[0]?.nextDueAt).toBe(before[0]?.nextDueAt);
    expect(rows[0]?.snoozedUntil).toBe(before[0]?.snoozedUntil);
    expect(rows[0]?.pinned).toBe(1);
  });
});
