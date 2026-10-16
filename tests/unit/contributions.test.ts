import { describe, expect, test } from "bun:test";
import { dayWindowUTC, isFresh, isValidDay, pickDay } from "@/lib/contributions";

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
});
