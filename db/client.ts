import { Database } from "bun:sqlite";
import { drizzle, type BunSQLiteDatabase } from "drizzle-orm/bun-sqlite";
import { ensureParentDir, getDatabasePath } from "@/lib/config";
import * as schema from "./schema";
import { ensureSchema } from "./ensure-schema";

const url = getDatabasePath();
ensureParentDir(url);

let db: BunSQLiteDatabase<typeof schema>;

declare global {
  var __ghnDb: BunSQLiteDatabase<typeof schema> | undefined;
}

if (globalThis.__ghnDb) {
  db = globalThis.__ghnDb;
} else {
  const sqlite = new Database(url, { create: true });
  ensureSchema(sqlite);
  sqlite.exec("PRAGMA journal_mode = WAL;");
  db = drizzle(sqlite, { schema });
  globalThis.__ghnDb = db;
}

export { db };
export type Db = typeof db;
