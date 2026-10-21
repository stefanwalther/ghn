import { afterEach, describe, expect, test, vi } from "vitest";
import { rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const KEY = "GHN_DB_PATH";
let saved: string | undefined;

afterEach(() => {
  if (saved === undefined) delete process.env[KEY];
  else process.env[KEY] = saved;
  vi.resetModules();
});

describe("the seeder without an injected database", () => {
  // The seeder used from the command line uses the application's own
  // database, which the environment seam points at.
  test("the seeder uses the database the environment points at", async () => {
    const path = join(tmpdir(), `ghn-seed-default-${process.pid}.db`);
    saved = process.env[KEY];
    process.env[KEY] = path;
    // The database client reads the seam when it is first loaded, so the
    // module registry has to be reset for the new path to take effect.
    vi.resetModules();

    try {
      const { seedDatabase } = await import("@/lib/seed");
      const summary = await seedDatabase(Date.parse("2026-01-15T12:00:00Z"));
      expect(summary).toEqual({ repositories: 10, notifications: 200 });
    } finally {
      rmSync(path, { force: true });
      rmSync(`${path}-wal`, { force: true });
      rmSync(`${path}-shm`, { force: true });
    }
  });
});
