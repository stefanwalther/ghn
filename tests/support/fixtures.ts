import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createDb, createMemoryDb, type TestDb } from "./db-client.node";
import { seedDatabase } from "@/lib/seed";

export interface ThreadOverrides {
  id?: string;
  title?: string;
  type?: string;
  state?: string;
  reason?: string;
  unread?: boolean;
  merged?: boolean;
  repo?: string;
  updatedAt?: string;
}

/** A GitHub-shaped thread, as the stand-in and the sync path both use it. */
export function makeThread(overrides: ThreadOverrides = {}) {
  const repo = overrides.repo ?? "acme/web";
  const id = overrides.id ?? "t_001";
  const number = 42;
  return {
    id,
    unread: overrides.unread ?? true,
    reason: overrides.reason ?? "mention",
    updated_at: overrides.updatedAt ?? "2026-01-15T11:00:00Z",
    subject: {
      title: overrides.title ?? "Fix flaky login redirect",
      type: overrides.type ?? "PullRequest",
      url: `https://api.github.com/repos/${repo}/pulls/${number}`,
    },
    repository: {
      full_name: repo,
      html_url: `https://github.com/${repo}`,
      owner: { login: repo.split("/")[0] },
    },
    url: `https://api.github.com/notifications/threads/${id}`,
    state: overrides.state ?? "open",
    merged: overrides.merged ?? false,
  };
}

export interface RepoOverrides {
  id?: string;
  fullName?: string;
  ownership?: "owned" | "watched";
  rhythm?: "immediate" | "weekly" | "biweekly" | "monthly";
}

/** A repository row with sensible defaults. */
export function makeRepo(overrides: RepoOverrides = {}) {
  return {
    id: overrides.id ?? "acme--web",
    fullName: overrides.fullName ?? "acme/web",
    ownership: overrides.ownership ?? "owned",
    rhythm: overrides.rhythm ?? "immediate",
    lastPromotedAt: null,
    nextDueAt: null,
    snoozedUntil: null,
    unreachable: 0,
    createdAt: 1_700_000_000_000,
  };
}

/**
 * A database with the full schema, on disk in a temporary directory.
 *
 * On disk rather than in memory because the routes and the stand-in both
 * open their own handles to the same file.
 */
export function makeTestDb(): TestDb & { cleanup(): void } {
  const dir = mkdtempSync(join(tmpdir(), "ghn-fixture-"));
  const path = join(dir, "fixture.db");
  const instance = createDb(path);
  return {
    ...instance,
    cleanup: () => {
      instance.close();
      rmSync(dir, { recursive: true, force: true });
    },
  };
}

/** A database with the full schema, in memory. */
export function makeMemoryDb(): TestDb {
  return createMemoryDb();
}

/**
 * Loads the shared dataset into a database at a fixed instant.
 *
 * The counts are returned so a check can assert them without recounting.
 */
export async function seedTestDataset(
  db: TestDb["db"],
  now: number
): Promise<{ repositories: number; notifications: number }> {
  return seedDatabase(now, db);
}
