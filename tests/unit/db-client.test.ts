import { afterEach, beforeEach, describe, expect, test } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { notifications, repositories } from "@/db/schema";
import { PathCache } from "@/lib/db-cache";
import { createDb } from "../support/db-client.node";

/**
 * The handle cache.
 *
 * The production client keeps its handle on the global object and keys it on
 * the resolved path, so a changed location cannot hand back a handle to a
 * different file. The production module itself cannot run under the Node
 * runtime the suite uses, because it speaks `bun:sqlite`, so the rule lives
 * in a small helper that both clients use and that is covered here.
 */

let dir: string;

beforeEach(() => {
  // A directory of its own, so nothing outside it is ever touched.
  dir = mkdtempSync(join(tmpdir(), "ghn-client-"));
});

afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

describe("the path cache", () => {
  test("the same path gives back the same handle", () => {
    const cache = new PathCache<{ id: string }>();
    const created = { id: "one" };

    expect(cache.get("/tmp/a.db", () => created)).toBe(created);
    expect(cache.get("/tmp/a.db", () => ({ id: "two" }))).toBe(created);
  });

  test("a changed path gives back a new handle", () => {
    const cache = new PathCache<{ id: string }>();

    const first = cache.get("/tmp/a.db", () => ({ id: "one" }));
    const second = cache.get("/tmp/b.db", () => ({ id: "two" }));

    expect(second).not.toBe(first);
  });

  test("going back to the first path gives back a new handle", () => {
    const cache = new PathCache<{ id: string }>();

    const first = cache.get("/tmp/a.db", () => ({ id: "one" }));
    cache.get("/tmp/b.db", () => ({ id: "two" }));
    const again = cache.get("/tmp/a.db", () => ({ id: "three" }));

    expect(again).not.toBe(first);
  });

  test("an adopted handle is used for the same path", () => {
    const cache = new PathCache<{ id: string }>();
    const adopted = { id: "adopted" };

    cache.adopt("/tmp/a.db", adopted);

    expect(cache.get("/tmp/a.db", () => ({ id: "other" }))).toBe(adopted);
  });
});

describe("the test database", () => {
  test("each instance gets its own file", async () => {
    const one = createDb(join(dir, "one.db"));
    const two = createDb(join(dir, "two.db"));

    // The notifications reference a repository, and the foreign key is
    // enforced.
    await one.db.insert(repositories).values({
      id: "acme--web",
      fullName: "acme/web",
      ownership: "owned",
      rhythm: "immediate",
      createdAt: 0,
    });
    await one.db.insert(notifications).values({
      id: "one",
      repositoryId: "acme--web",
      subject: "Only in the first file",
      reason: "mention",
      createdAt: 0,
      sourceUrl: "https://github.com/acme/web/pull/1",
    });

    const inTwo = await two.db.select().from(notifications);
    const inOne = await one.db.select().from(notifications);

    expect(inTwo).toHaveLength(0);
    expect(inOne).toHaveLength(1);

    one.sqlite.close();
    two.sqlite.close();
  });
});
