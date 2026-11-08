import { Database } from "bun:sqlite";
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/bun-sqlite";
import * as schema from "@/db/schema";
import { notifications } from "@/db/schema";
import { ensureSchema } from "@/db/ensure-schema";
import { resolveDatabasePath } from "@/lib/config";

/**
 * Adds or removes the synthetic release row the release-preview journey
 * reads. The frozen dataset has no Release subject rows, so the row is
 * scripted per test rather than seeded.
 *
 * Usage: `bun run scripts/e2e-release-row.ts add|remove` with GHN_DB_PATH
 * pointing at the isolated end-to-end database.
 *
 * The id carries the `n_` prefix on purpose: the sync path never marks
 * `n_`-prefixed rows done when they are missing remotely, so a poll during
 * the journey cannot swallow the row.
 */
const mode = process.argv[2];
if (mode !== "add" && mode !== "remove") {
  throw new Error("usage: bun run scripts/e2e-release-row.ts add|remove");
}

const path = process.env.GHN_DB_PATH;
if (!path) {
  throw new Error("GHN_DB_PATH is required");
}

// The end-to-end suite must never touch the application's own database.
const resolved = resolveDatabasePath({
  env: { ...process.env, GHN_DB_PATH: path },
});
const configured = resolveDatabasePath({
  env: { ...process.env, GHN_DB_PATH: undefined },
});
if (resolved === configured) {
  throw new Error(
    "GHN_DB_PATH points at the application's own database. The end-to-end suite must never touch it."
  );
}

const sqlite = new Database(path, { create: true });
ensureSchema(sqlite);
const db = drizzle(sqlite, { schema });

const now = process.env.GHN_NOW ? Date.parse(process.env.GHN_NOW) : Date.now();

if (mode === "add") {
  await db.delete(notifications).where(eq(notifications.id, "n_rel_e2e"));
  await db.insert(notifications).values({
    id: "n_rel_e2e",
    repositoryId: "acme--web",
    subject: "E2E nightly v9.9.9-e2e",
    subjectType: "Release",
    subjectState: null,
    reason: "subscribed",
    prMerged: 0,
    createdAt: now - 3600 * 1000,
    githubUpdatedAt: null,
    isRead: 0,
    isDone: 0,
    localUnread: 0,
    sourceUrl: "https://github.com/acme/web/releases/tag/v9.9.9-e2e",
  });
  console.log("release row added");
} else {
  await db.delete(notifications).where(eq(notifications.id, "n_rel_e2e"));
  console.log("release row removed");
}

sqlite.close();
