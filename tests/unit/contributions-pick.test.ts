import { describe, expect, test } from "vitest";
import { pickDay } from "@/lib/contributions";

describe("the contribution calendar", () => {
  // A week without any days carries no count for the requested day.
  test("a week without days carries no count", () => {
    const payload = {
      data: {
        user: {
          contributionsCollection: {
            contributionCalendar: {
              weeks: [{ contributionDays: undefined }, { contributionDays: [] }],
            },
          },
        },
      },
    };
    expect(pickDay(payload, "2026-10-16")).toBeNull();
  });

  // A calendar without any weeks carries no count either.
  test("a calendar without weeks carries no count", () => {
    const payload = {
      data: { user: { contributionsCollection: { contributionCalendar: {} } } },
    };
    expect(pickDay(payload, "2026-10-16")).toBeNull();
  });

  // A day without a numeric count is not a count.
  test("a day without a numeric count is not a count", () => {
    const payload = {
      data: {
        user: {
          contributionsCollection: {
            contributionCalendar: {
              weeks: [
                {
                  contributionDays: [
                    { date: "2026-10-16", contributionCount: "many" },
                  ],
                },
              ],
            },
          },
        },
      },
    };
    expect(pickDay(payload, "2026-10-16")).toBeNull();
  });

  // The count is found in whichever week carries the day.
  test("the count is found in whichever week carries the day", () => {
    const payload = {
      data: {
        user: {
          contributionsCollection: {
            contributionCalendar: {
              weeks: [
                { contributionDays: [{ date: "2026-10-12", contributionCount: 1 }] },
                { contributionDays: [{ date: "2026-10-16", contributionCount: 9 }] },
              ],
            },
          },
        },
      },
    };
    expect(pickDay(payload, "2026-10-16")).toBe(9);
  });
});
