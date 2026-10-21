import { DatabaseSync, type StatementSync } from "node:sqlite";
import { drizzle } from "drizzle-orm/sqlite-proxy";
import { tmpdir } from "node:os";
import { join } from "node:path";
import * as schema from "@/db/schema";
import { ensureSchema } from "@/db/ensure-schema";
import type { Db } from "@/db/client";

export interface TestDb {
  db: Db;
  sqlite: DatabaseSync;
  close(): void;
}

/**
 * The column names of a statement, in order.
 *
 * `node:sqlite` returns result rows as objects, but the Drizzle proxy driver
 * expects positional rows, so every row has to be mapped back into column
 * order before it is handed over.
 */
function columnNames(stmt: StatementSync, rows: unknown[]): string[] {
  const withColumns = stmt as unknown as {
    columns?: () => Array<{ name: string }>;
  };
  if (typeof withColumns.columns === "function") {
    return withColumns.columns().map((column) => column.name);
  }
  const first = rows[0];
  return first && typeof first === "object" ? Object.keys(first as object) : [];
}

function toPositional(
  stmt: StatementSync,
  rows: Record<string, unknown>[]
): unknown[][] {
  const names = columnNames(stmt, rows);
  return rows.map((row) => names.map((name) => row[name]));
}

/**
 * A Drizzle client over `node:sqlite`, for the tests that need a real
 * database on the Node runtime.
 *
 * The production client uses `bun:sqlite`. This one speaks to `node:sqlite`
 * through the proxy driver so the same schema and the same query code run in
 * both places.
 */
export function createDb(path: string): TestDb {
  const sqlite = new DatabaseSync(path);
  sqlite.exec("PRAGMA journal_mode = WAL;");
  ensureSchema(sqlite);

  const db = drizzle(
    async (sql, params, method) => {
      const stmt = sqlite.prepare(sql);
      const args = params as never[];

      if (method === "run") {
        stmt.run(...args);
        return { rows: [] };
      }

      if (method === "get") {
        const row = stmt.get(...args) as Record<string, unknown> | undefined;
        return { rows: row ? toPositional(stmt, [row])[0] : [] };
      }

      const rows = stmt.all(...args) as Record<string, unknown>[];
      return { rows: toPositional(stmt, rows) };
    },
    { schema }
  ) as unknown as Db;

  return {
    db,
    sqlite,
    close: () => sqlite.close(),
  };
}

export function createMemoryDb(): TestDb {
  return createDb(":memory:");
}

/**
 * The path the test suite's database client opens.
 *
 * It never falls back to the application's own database file. A test that
 * opened the real database would be able to delete the maintainer's inbox.
 */
export const TEST_DB_PATH: string =
  process.env.GHN_DB_PATH ?? join(tmpdir(), `ghn-test-${process.pid}.db`);

const instance = createDb(TEST_DB_PATH);

/** The database the aliased `@/db/client` resolves to inside a test. */
export const db: Db = instance.db;

export const sqlite: DatabaseSync = instance.sqlite;
