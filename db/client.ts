import { Database } from "bun:sqlite";
import { drizzle, type BunSQLiteDatabase } from "drizzle-orm/bun-sqlite";
import { ensureParentDir, getDatabasePath } from "@/lib/config";
import * as schema from "./schema";
import { ensureSchema } from "./ensure-schema";

const url = getDatabasePath();
ensureParentDir(url);

let db: BunSQLiteDatabase<typeof schema>;

declare global {
  var __quietDb: BunSQLiteDatabase<typeof schema> | undefined;
  var __quietDbPath: string | undefined;
}

// The cache is keyed on the resolved path. Keying it on nothing would hand
// back a handle to a different file whenever the configured location
// changes, which is exactly what the test suite does between runs.
if (globalThis.__quietDb && globalThis.__quietDbPath === url) {
  db = globalThis.__quietDb;
} else {
  const sqlite = new Database(url, { create: true });
  ensureSchema(sqlite);
  sqlite.exec("PRAGMA journal_mode = WAL;");
  db = drizzle(sqlite, { schema });
  globalThis.__quietDb = db;
  globalThis.__quietDbPath = url;
}

export { db };
export type Db = typeof db;
