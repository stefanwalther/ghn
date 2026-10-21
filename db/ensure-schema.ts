/**
 * The subset of the SQLite API this module needs.
 *
 * The production client speaks `bun:sqlite` and the test client speaks
 * `node:sqlite`. Both satisfy this shape, so the schema has one definition
 * and the test suite does not have to keep its own copy of the DDL.
 */
export interface SqliteLike {
  exec(sql: string): void;
  query?(sql: string): { all(...params: unknown[]): unknown[] };
  prepare?(sql: string): { all(...params: unknown[]): unknown[] };
}

function tableInfo(sqlite: SqliteLike, table: string): string[] {
  const sql = `PRAGMA table_info(${table})`;
  const rows = sqlite.query
    ? sqlite.query(sql).all()
    : sqlite.prepare
      ? sqlite.prepare(sql).all()
      : [];
  return rows.map((row) => (row as { name: string }).name);
}

export function ensureSchema(sqlite: SqliteLike): void {
  sqlite.exec("PRAGMA journal_mode = WAL;");
  sqlite.exec(`
CREATE TABLE IF NOT EXISTS repositories (
  id TEXT PRIMARY KEY,
  full_name TEXT NOT NULL UNIQUE,
  ownership TEXT NOT NULL,
  rhythm TEXT NOT NULL,
  last_promoted_at INTEGER,
  next_due_at INTEGER,
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS repositories_rhythm_idx ON repositories (rhythm);
CREATE TABLE IF NOT EXISTS notifications (
  id TEXT PRIMARY KEY,
  repository_id TEXT NOT NULL REFERENCES repositories(id),
  subject TEXT NOT NULL,
  reason TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  is_read INTEGER NOT NULL DEFAULT 0,
  is_done INTEGER NOT NULL DEFAULT 0,
  source_url TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS notifications_repo_idx ON notifications (repository_id);
CREATE INDEX IF NOT EXISTS notifications_done_idx ON notifications (is_done);
CREATE TABLE IF NOT EXISTS muted_subjects (
  repository_id TEXT NOT NULL,
  subject TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS contribution_days (
  date TEXT PRIMARY KEY,
  count INTEGER NOT NULL,
  fetched_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS sync_state (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS writeback_queue (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  thread_id TEXT NOT NULL,
  action TEXT NOT NULL,
  attempts INTEGER NOT NULL DEFAULT 0,
  last_error TEXT,
  created_at INTEGER NOT NULL
);
`);
  const repoCols = tableInfo(sqlite, "repositories");
  if (!repoCols.includes("snoozed_until")) {
    sqlite.exec("ALTER TABLE repositories ADD COLUMN snoozed_until INTEGER");
  }
  if (!repoCols.includes("unreachable")) {
    sqlite.exec(
      "ALTER TABLE repositories ADD COLUMN unreachable INTEGER NOT NULL DEFAULT 0"
    );
  }
  const notifCols = tableInfo(sqlite, "notifications");
  if (!notifCols.includes("subject_type")) {
    sqlite.exec("ALTER TABLE notifications ADD COLUMN subject_type TEXT");
  }
  if (!notifCols.includes("github_updated_at")) {
    sqlite.exec("ALTER TABLE notifications ADD COLUMN github_updated_at INTEGER");
  }
  if (!notifCols.includes("local_unread")) {
    sqlite.exec(
      "ALTER TABLE notifications ADD COLUMN local_unread INTEGER NOT NULL DEFAULT 0"
    );
  }
  if (!notifCols.includes("pr_merged")) {
    sqlite.exec(
      "ALTER TABLE notifications ADD COLUMN pr_merged INTEGER NOT NULL DEFAULT 0"
    );
  }
  if (!notifCols.includes("subject_state")) {
    sqlite.exec("ALTER TABLE notifications ADD COLUMN subject_state TEXT");
  }
}
