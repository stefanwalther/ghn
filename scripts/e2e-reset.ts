import { Database } from "bun:sqlite";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { drizzle } from "drizzle-orm/bun-sqlite";
import * as schema from "@/db/schema";
import { syncState } from "@/db/schema";
import { ensureSchema } from "@/db/ensure-schema";
import { resolveDatabasePath } from "@/lib/config";
import { seedDatabase } from "@/lib/seed";
import { nowMs } from "@/lib/clock";

/**
 * Resets the isolated end-to-end database.
 *
 * The tables are dropped and recreated in place. The file is never unlinked:
 * the running application server holds an open handle to it, and unlinking
 * would leave the server reading the old inode and serving stale data.
 *
 * The path is required, and it must never be the application's own database.
 */
const path = process.env.GHN_DB_PATH;
if (!path) {
  throw new Error("GHN_DB_PATH is required");
}

// The end-to-end suite must never touch the application's own database.
// The comparison is against the location the application resolves without
// the override, so the guard cannot compare the path with itself.
const configured = resolveDatabasePath({
  env: { ...process.env, GHN_DB_PATH: undefined },
});
if (path === configured) {
  throw new Error(
    "GHN_DB_PATH points at the application's own database. The end-to-end suite must never touch it."
  );
}

mkdirSync(dirname(path), { recursive: true });
const sqlite = new Database(path, { create: true });

for (const table of [
  "writeback_queue",
  "contribution_days",
  "muted_subjects",
  "sync_state",
  "notifications",
  "repositories",
]) {
  sqlite.exec(`DROP TABLE IF EXISTS ${table}`);
}

ensureSchema(sqlite);

const db = drizzle(sqlite, { schema });
const result = await seedDatabase(nowMs(), db);

// The one-shot prune removes the repositories that have no notifications.
// In a seeded database that would delete every repository, and the sync
// would then recreate them all with a weekly rhythm, which collapses the
// whole inbox. Marking the prune as done keeps the seeded rhythm intact, so
// a sync against the stand-in leaves the dataset unchanged.
db.insert(syncState)
  .values({ key: "seedReposPruned", value: "1" })
  .onConflictDoUpdate({ target: syncState.key, set: { value: "1" } })
  .run();

console.log(JSON.stringify({ path, ...result }));
sqlite.close();
