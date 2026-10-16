import { Database } from "bun:sqlite";

const sqlite = new Database("./data/quiet-notifications.db", { create: true });
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
`);
const repoCols = sqlite
  .query("PRAGMA table_info(repositories)")
  .all() as { name: string }[];
if (!repoCols.some((c) => c.name === "snoozed_until")) {
  sqlite.exec("ALTER TABLE repositories ADD COLUMN snoozed_until INTEGER");
}
console.log(JSON.stringify({ pushed: true }));
