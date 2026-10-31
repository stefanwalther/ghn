import { Database } from "bun:sqlite";
import {
  ensureParentDir,
  getDatabasePath,
  isExplicitDatabasePath,
  migrateLegacyDatabase,
} from "@/lib/config";
import { ensureSchema } from "@/db/ensure-schema";

function main(): void {
  const dbPath = getDatabasePath();
  ensureParentDir(dbPath);
  if (!isExplicitDatabasePath()) {
    migrateLegacyDatabase(dbPath);
  }
  const sqlite = new Database(dbPath, { create: true });
  ensureSchema(sqlite);
  console.log(JSON.stringify({ pushed: true }));
}

if (import.meta.path === Bun.main) {
  main();
}
