import { describe, expect, test } from "vitest";
import { parseRateLimitHeaders } from "@/lib/rate-limits";
import { applyLocalAction } from "@/lib/inbox-state";
import { buildSeedNotifications, IMMEDIATE_REPOS, SEED_COUNTS } from "@/lib/seed-data";

/**
 * The details the suite claims to pin.
 *
 * Every count in the application is supposed to be predictable, and the
 * visible state of every row is supposed to be part of that. These are the
 * parts that were not.
 */

const EPOCH = Date.parse("2026-01-15T12:00:00Z");

describe("the rate limit clock", () => {
  // The reset countdown is rendered from this value, so it has to come from
  // the pinned clock rather than the wall clock.
  test("the reset countdown comes from the pinned clock", () => {
    const now = Date.parse("2026-01-15T12:00:00Z");
    const reset = Math.floor(now / 1000) + 120;
    const headers = new Headers({
      "x-ratelimit-limit": "5000",
      "x-ratelimit-used": "1234",
      "x-ratelimit-remaining": "3766",
      "x-ratelimit-reset": String(reset),
    });

    const bucket = parseRateLimitHeaders(headers, now);

    expect(bucket).not.toBeNull();
    expect(bucket?.resetsInSecs).toBe(120);
  });
});

describe("the optimistic triage", () => {
  const items = [
    { id: "a", isRead: 0, isDone: 0 },
    { id: "b", isRead: 1, isDone: 0 },
  ];

  // Marking a row read must not change anything else about it.
  test("marking read sets the read flag and leaves the rest alone", () => {
    const next = applyLocalAction(items, ["a"], "read");
    expect(next[0]?.isRead).toBe(1);
    expect(next[0]?.isDone).toBe(0);
    expect(next[1]).toEqual(items[1]);
  });

  // Marking a row unread puts it back into the unread state.
  test("marking unread clears both flags", () => {
    const next = applyLocalAction(items, ["b"], "unread");
    expect(next[1]?.isRead).toBe(0);
    expect(next[1]?.isDone).toBe(0);
  });

  test("marking done removes the rows", () => {
    expect(applyLocalAction(items, ["a"], "done").map((i) => i.id)).toEqual(["b"]);
  });

  test("unsubscribing removes the rows", () => {
    expect(applyLocalAction(items, ["a"], "unsubscribe").map((i) => i.id)).toEqual([
      "b",
    ]);
  });
});

describe("the dataset's read balance", () => {
  const items = buildSeedNotifications(EPOCH);
  const visible = items.filter((item) =>
    IMMEDIATE_REPOS.some((repo) => repo.id === item.repositoryId)
  );

  // The unread dot on a row is driven by this flag, so the balance is
  // part of what the suite promises to pin.
  test("a third of the visible items are read", () => {
    const read = visible.filter((item) => item.isRead).length;
    expect(visible).toHaveLength(SEED_COUNTS.visible);
    expect(read).toBe(10);
  });

  test("the read flag follows the item index", () => {
    expect(visible[0]?.isRead).toBe(true);
    expect(visible[1]?.isRead).toBe(false);
    expect(visible[2]?.isRead).toBe(false);
    expect(visible[3]?.isRead).toBe(true);
  });
});

describe("the dataset's collapsed ages", () => {
  const items = buildSeedNotifications(EPOCH);
  const visible = new Set(IMMEDIATE_REPOS.map((repo) => repo.id));
  const collapsed = items.filter((item) => !visible.has(item.repositoryId));

  // The collapsed items have to stay out of the visible age buckets, and
  // they have to stay within the two calendar filters.
  test("the collapsed items are all older than a month", () => {
    for (const item of collapsed) {
      expect(EPOCH - item.createdAt).toBeGreaterThan(30 * 24 * 60 * 60 * 1000);
    }
  });

  test("the collapsed items all read as older than a year", () => {
    const year = new Date(EPOCH).getUTCFullYear();
    const inYear = collapsed.filter(
      (item) => new Date(item.createdAt).getUTCFullYear() === year
    ).length;
    expect(collapsed).toHaveLength(SEED_COUNTS.quiet);
    expect(inYear).toBe(0);
  });
});
