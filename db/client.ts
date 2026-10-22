import { Database } from "bun:sqlite";
import { drizzle, type BunSQLiteDatabase } from "drizzle-orm/bun-sqlite";
import { ensureParentDir, getDatabasePath } from "@/lib/config";
import { PathCache } from "@/lib/db-cache";
import * as schema from "./schema";
import { ensureSchema } from "./ensure-schema";

const url = getDatabasePath();
ensureParentDir(url);

declare global {
  var __ghnDb: BunSQLiteDatabase<typeof schema> | undefined;
  var __ghnDbPath: string | undefined;
}

// The cache is keyed on the resolved path. Keying it on nothing would hand
// back a handle to a different file whenever the configured location
// changes.
const cache = new PathCache<BunSQLiteDatabase<typeof schema>>();

// A handle that outlives the module, so a reload keeps the same file.
if (globalThis.__ghnDb && globalThis.__ghnDbPath === url) {
  cache.adopt(url, globalThis.__ghnDb);
}

export const db = cache.get(url, () => {
  const sqlite = new Database(url, { create: true });
  ensureSchema(sqlite);
  sqlite.exec("PRAGMA journal_mode = WAL;");
  const created = drizzle(sqlite, { schema });
  globalThis.__ghnDb = created;
  globalThis.__ghnDbPath = url;
  return created;
});

export type Db = typeof db;
