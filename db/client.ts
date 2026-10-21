import { Database } from "bun:sqlite";
import { drizzle, type BunSQLiteDatabase } from "drizzle-orm/bun-sqlite";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import * as schema from "./schema";
import { ensureSchema } from "./ensure-schema";

const url = "./data/quiet-notifications.db";

let db: BunSQLiteDatabase<typeof schema>;

declare global {
  var __quietDb: BunSQLiteDatabase<typeof schema> | undefined;
}

if (globalThis.__quietDb) {
  db = globalThis.__quietDb;
} else {
  mkdirSync(dirname(url), { recursive: true });
  const sqlite = new Database(url, { create: true });
  ensureSchema(sqlite);
  sqlite.exec("PRAGMA journal_mode = WAL;");
  db = drizzle(sqlite, { schema });
  globalThis.__quietDb = db;
}

export { db };
export type Db = typeof db;
