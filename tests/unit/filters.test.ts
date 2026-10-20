import { describe, expect, test } from "bun:test";
import { isMergedItem, isReleaseItem, matchAge, matchesTypeFilter, QUICK_SELECTS, startOfYear, TYPE_FILTERS } from "@/lib/filters";

const DAY = 24 * 60 * 60 * 1000;

describe("age buckets", () => {
  const now = new Date(2026, 5, 15, 12, 0, 0).getTime();

  test("24h and 48h cutoffs", () => {
    expect(matchAge(now - 23 * 3600 * 1000, now, "24h")).toBe(true);
    expect(matchAge(now - 25 * 3600 * 1000, now, "24h")).toBe(false);
    expect(matchAge(now - 25 * 3600 * 1000, now, "48h")).toBe(true);
    expect(matchAge(now - 49 * 3600 * 1000, now, "48h")).toBe(false);
  });

  test("day buckets nest correctly", () => {
    expect(matchAge(now - 6 * DAY, now, "7d")).toBe(true);
    expect(matchAge(now - 8 * DAY, now, "7d")).toBe(false);
    expect(matchAge(now - 8 * DAY, now, "14d")).toBe(true);
    expect(matchAge(now - 20 * DAY, now, "30d")).toBe(true);
    expect(matchAge(now - 40 * DAY, now, "30d")).toBe(false);
  });

  test("this year uses local Jan 1", () => {
    expect(startOfYear(now)).toBe(new Date(2026, 0, 1).getTime());
    expect(matchAge(new Date(2026, 2, 1).getTime(), now, "year")).toBe(true);
    expect(matchAge(new Date(2025, 11, 31).getTime(), now, "year")).toBe(false);
  });

  test("older than a year", () => {
    expect(matchAge(now - 400 * DAY, now, "older")).toBe(true);
    expect(matchAge(now - 300 * DAY, now, "older")).toBe(false);
    expect(matchAge(now - 400 * DAY, now, "all")).toBe(true);
  });
});

describe("isReleaseItem", () => {
  test("seed reason still counts", () => {
    expect(
      isReleaseItem({ reason: "release", subject: "v2.4.0 released", subjectType: null })
    ).toBe(true);
  });

  test("live Release subjectType counts", () => {
    expect(
      isReleaseItem({ reason: "subscribed", subject: "v1.27.3", subjectType: "Release" })
    ).toBe(true);
  });

  test("release-please PR title counts", () => {
    expect(
      isReleaseItem({
        reason: "subscribed",
        subject: "chore(main): release 1.27.4",
        subjectType: "PullRequest",
      })
    ).toBe(true);
  });

  test("dependabot bump does not count", () => {
    expect(
      isReleaseItem({
        reason: "subscribed",
        subject: "build(deps): bump knip from 6.39.0 to 6.41.0",
        subjectType: "PullRequest",
      })
    ).toBe(false);
  });
});

describe("isMergedItem", () => {
  test("seed reason still counts", () => {
    expect(isMergedItem({ reason: "merged", prMerged: false })).toBe(true);
  });

  test("live merged PR counts", () => {
    expect(isMergedItem({ reason: "subscribed", prMerged: true })).toBe(true);
  });

  test("open PR does not count", () => {
    expect(isMergedItem({ reason: "subscribed", prMerged: false })).toBe(false);
  });
});

describe("quick selects on live data", () => {
  test("merged shortcut is actionable", () => {
    expect(QUICK_SELECTS.map((q) => q.value)).toContain("merged");
  });

  test("pull requests have their own filter", () => {
    expect(TYPE_FILTERS.map((t) => t.value)).toContain("pull_request");
  });
});

describe("matchesTypeFilter", () => {
  test("all passes everything", () => {
    expect(matchesTypeFilter("subscribed", "Issue", "all")).toBe(true);
  });

  test("pull_request matches PullRequest subjects regardless of reason", () => {
    expect(matchesTypeFilter("author", "PullRequest", "pull_request")).toBe(true);
    expect(matchesTypeFilter("subscribed", "PullRequest", "pull_request")).toBe(true);
    expect(matchesTypeFilter("subscribed", "Issue", "pull_request")).toBe(false);
    expect(matchesTypeFilter("subscribed", null, "pull_request")).toBe(false);
  });

  test("other values keep matching the reason", () => {
    expect(matchesTypeFilter("mention", "Issue", "mention")).toBe(true);
    expect(matchesTypeFilter("subscribed", "Issue", "mention")).toBe(false);
  });
});
