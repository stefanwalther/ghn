import { describe, expect, test } from "vitest";
import {
  buildSeedNotifications,
  buildSeedThreads,
  FROZEN_EPOCH,
  IMMEDIATE_REPOS,
  SEED_REPOS,
} from "@/lib/seed-data";
import { matchAge, matchesTypeFilter, type AgeFilter } from "@/lib/filters";
import { isDue } from "@/lib/digest";

const EPOCH = Date.parse(FROZEN_EPOCH);

describe("the shared dataset", () => {
  test("is identical on every build", () => {
    const first = buildSeedNotifications(EPOCH);
    const second = buildSeedNotifications(EPOCH);
    expect(second).toEqual(first);
    expect(first).toHaveLength(200);
  });

  test("uses the same repository identifiers as the sync path", () => {
    // The identifiers are derived, so a seeded database and a synced one
    // cannot collide on the unique constraint.
    expect(SEED_REPOS.map((repo) => repo.id)).toContain("acme--web");
    expect(SEED_REPOS.every((repo) => repo.id.includes("--"))).toBe(true);
  });

  test("keeps the visible items in the repositories that are due", () => {
    const items = buildSeedNotifications(EPOCH);
    const immediate = new Set(IMMEDIATE_REPOS.map((repo) => repo.id));
    const visible = items.filter((item) => immediate.has(item.repositoryId));
    expect(visible).toHaveLength(30);
    expect(items).toHaveLength(200);

    for (const repo of IMMEDIATE_REPOS) {
      const due = isDue(
        {
          id: repo.id,
          rhythm: repo.rhythm,
          lastPromotedAt: null,
          nextDueAt: null,
        },
        EPOCH
      );
      expect(due).toBe(true);
    }
  });

  test("gives every age filter a known, non-zero count in the visible set", () => {
    const items = buildSeedNotifications(EPOCH);
    const immediate = new Set(IMMEDIATE_REPOS.map((repo) => repo.id));
    const visible = items.filter((item) => immediate.has(item.repositoryId));

    const count = (age: AgeFilter) =>
      visible.filter((item) => matchAge(item.createdAt, EPOCH, age)).length;

    expect(count("24h")).toBe(7);
    expect(count("48h")).toBe(11);
    expect(count("7d")).toBe(16);
    expect(count("14d")).toBe(19);
    // The 30 day cutoff is inclusive, so the item that sits exactly on it
    // counts here as well.
    expect(count("30d")).toBe(23);
    // "This year" means since the local first of January. At the frozen
    // instant that is fourteen and a half days back, so it holds the
    // fourteen-day band and nothing more.
    expect(count("year")).toBe(19);
    expect(count("older")).toBe(4);
    // The items between the two calendar filters match neither. The
    // application's filter set leaves that band uncovered, and the dataset
    // keeps a known number of items in it so the behaviour stays pinned.
    expect(count("all") - count("year") - count("older")).toBe(7);
  });

  test("gives the type filters a known, non-zero count in the visible set", () => {
    const items = buildSeedNotifications(EPOCH);
    const immediate = new Set(IMMEDIATE_REPOS.map((repo) => repo.id));
    const visible = items.filter((item) => immediate.has(item.repositoryId));

    const count = (type: string) =>
      visible.filter((item) =>
        matchesTypeFilter(item.reason, item.subjectType, type, {
          prMerged: item.prMerged,
          subjectState: item.subjectState,
        })
      ).length;

    expect(count("pull_request")).toBe(10);
    expect(count("merged")).toBe(5);
    expect(count("closed")).toBe(5);
    expect(count("release")).toBe(4);
  });

  test("sets the merged flag only on pull requests", () => {
    for (const item of buildSeedNotifications(EPOCH)) {
      if (item.prMerged) expect(item.subjectType).toBe("PullRequest");
    }
  });

  test("serves the same dataset to the stand-in", () => {
    const threads = buildSeedThreads("http://127.0.0.1:9999", EPOCH);
    const items = buildSeedNotifications(EPOCH);
    expect(threads).toHaveLength(items.length);
    expect(threads[0]?.id).toBe(items[0]?.id);
    expect(threads[0]?.subject.url).toContain("http://127.0.0.1:9999/repos/");
    expect(threads[0]?.url).toContain("http://127.0.0.1:9999/notifications/threads/");
  });
});
