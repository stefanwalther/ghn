import { describe, expect, test } from "vitest";
import { dayWindowUTC, isFresh, isValidDay, lastNDates, pickDay, pickRange, rangeWindowUTC } from "@/lib/contributions";

describe("contributions", () => {
  test("day window is the UTC calendar day", () => {
    expect(dayWindowUTC("2026-10-16")).toEqual({
      from: "2026-10-16T00:00:00Z",
      to: "2026-10-16T23:59:59Z",
    });
  });

  test("day validation", () => {
    expect(isValidDay("2026-10-16")).toBe(true);
    expect(isValidDay("16.10.2026")).toBe(false);
    expect(isValidDay("tomorrow")).toBe(false);
  });

  test("picks the requested day from a graphql payload", () => {
    const payload = {
      data: {
        user: {
          contributionsCollection: {
            contributionCalendar: {
              weeks: [
                {
                  contributionDays: [
                    { date: "2026-10-15", contributionCount: 17 },
                    { date: "2026-10-16", contributionCount: 30 },
                  ],
                },
              ],
            },
          },
        },
      },
    };
    expect(pickDay(payload, "2026-10-16")).toBe(30);
    expect(pickDay(payload, "2026-10-18")).toBeNull();
    expect(pickDay({}, "2026-10-16")).toBeNull();
  });

  test("cache freshness: past days forever, today five minutes", () => {
    const now = 1000;
    expect(isFresh(0, now, "2026-10-15", "2026-10-16")).toBe(true);
    expect(isFresh(now - 4 * 60 * 1000, now, "2026-10-16", "2026-10-16")).toBe(true);
    expect(isFresh(now - 6 * 60 * 1000, now, "2026-10-16", "2026-10-16")).toBe(false);
  });

  test("last 30 dates end on today in order", () => {
    const dates = lastNDates("2026-10-16", 30);
    expect(dates).toHaveLength(30);
    expect(dates[29]).toBe("2026-10-16");
    expect(dates[0]).toBe("2026-09-17");
    expect([...dates].sort()).toEqual(dates);
  });

  test("range window spans whole UTC days", () => {
    expect(rangeWindowUTC("2026-09-17", "2026-10-16")).toEqual({
      from: "2026-09-17T00:00:00Z",
      to: "2026-10-16T23:59:59Z",
    });
  });

  test("picks the whole range from a graphql payload", () => {
    const payload = {
      data: {
        user: {
          contributionsCollection: {
            contributionCalendar: {
              weeks: [
                {
                  contributionDays: [
                    { date: "2026-10-15", contributionCount: 17 },
                    { date: "2026-10-16", contributionCount: 30 },
                  ],
                },
              ],
            },
          },
        },
      },
    };
    expect(pickRange(payload)).toEqual({ "2026-10-15": 17, "2026-10-16": 30 });
    expect(pickRange({})).toEqual({});
  });
});
