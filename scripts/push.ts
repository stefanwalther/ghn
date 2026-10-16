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
`);
console.log(JSON.stringify({ pushed: true }));
