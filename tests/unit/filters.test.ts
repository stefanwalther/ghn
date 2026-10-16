import { describe, expect, test } from "bun:test";
import { matchAge, startOfYear } from "@/lib/filters";

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
