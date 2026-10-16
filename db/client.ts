import { Database } from "bun:sqlite";
import { drizzle, type BunSQLiteDatabase } from "drizzle-orm/bun-sqlite";
import * as schema from "./schema";

const url = "./data/quiet-notifications.db";

let db: BunSQLiteDatabase<typeof schema>;

declare global {
  var __quietDb: BunSQLiteDatabase<typeof schema> | undefined;
}

if (globalThis.__quietDb) {
  db = globalThis.__quietDb;
} else {
  const sqlite = new Database(url, { create: true });
  sqlite.exec("PRAGMA journal_mode = WAL;");
  db = drizzle(sqlite, { schema });
  globalThis.__quietDb = db;
}

export { db };
export type Db = typeof db;
