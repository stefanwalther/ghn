import { Database } from "bun:sqlite";
import { ensureParentDir, getDatabasePath } from "@/lib/config";

export function ensureSchema(sqlite: Database): void {
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
  const repoCols = sqlite.query("PRAGMA table_info(repositories)").all() as {
    name: string;
  }[];
  if (!repoCols.some((c) => c.name === "snoozed_until")) {
    sqlite.exec("ALTER TABLE repositories ADD COLUMN snoozed_until INTEGER");
  }
  if (!repoCols.some((c) => c.name === "unreachable")) {
    sqlite.exec(
      "ALTER TABLE repositories ADD COLUMN unreachable INTEGER NOT NULL DEFAULT 0"
    );
  }
  const notifCols = sqlite.query("PRAGMA table_info(notifications)").all() as {
    name: string;
  }[];
  if (!notifCols.some((c) => c.name === "subject_type")) {
    sqlite.exec("ALTER TABLE notifications ADD COLUMN subject_type TEXT");
  }
  if (!notifCols.some((c) => c.name === "github_updated_at")) {
    sqlite.exec("ALTER TABLE notifications ADD COLUMN github_updated_at INTEGER");
  }
  if (!notifCols.some((c) => c.name === "local_unread")) {
    sqlite.exec(
      "ALTER TABLE notifications ADD COLUMN local_unread INTEGER NOT NULL DEFAULT 0"
    );
  }
  if (!notifCols.some((c) => c.name === "pr_merged")) {
    sqlite.exec(
      "ALTER TABLE notifications ADD COLUMN pr_merged INTEGER NOT NULL DEFAULT 0"
    );
  }
  if (!notifCols.some((c) => c.name === "subject_state")) {
    sqlite.exec("ALTER TABLE notifications ADD COLUMN subject_state TEXT");
  }
}

function main(): void {
  const dbPath = getDatabasePath();
  ensureParentDir(dbPath);
  const sqlite = new Database(dbPath, { create: true });
  ensureSchema(sqlite);
  console.log(JSON.stringify({ pushed: true }));
}

if (import.meta.path === Bun.main) {
  main();
}
