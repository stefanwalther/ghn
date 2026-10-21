import { describe, expect, test } from "vitest";
import { computeNextDueAt, formatDueDate, isDue } from "@/lib/digest";

describe("the digest due date", () => {
  // A digest repository without a due date is due, so it promotes instead
  // of waiting forever.
  test("a digest repository without a due date is due", () => {
    const repo = {
      id: "vendor--slow-dep",
      rhythm: "weekly" as const,
      lastPromotedAt: null,
      nextDueAt: null,
    };
    expect(isDue(repo, 1000)).toBe(true);
  });

  // A digest repository with a due date in the future is not due yet.
  test("a digest repository with a future due date is not due", () => {
    const repo = {
      id: "vendor--slow-dep",
      rhythm: "weekly" as const,
      lastPromotedAt: null,
      nextDueAt: 2000,
    };
    expect(isDue(repo, 1000)).toBe(false);
  });

  // The due date itself counts as due.
  test("a digest repository is due from its due date onwards", () => {
    const repo = {
      id: "vendor--slow-dep",
      rhythm: "weekly" as const,
      lastPromotedAt: null,
      nextDueAt: 2000,
    };
    expect(isDue(repo, 2000)).toBe(true);
  });

  // The monthly rhythm lands on the same day of the next month, at the
  // same time of day, when that day exists.
  test("the monthly rhythm lands on the same day of the next month", () => {
    const from = new Date(2026, 0, 15, 9, 30, 0).getTime();
    const next = computeNextDueAt("monthly", from);
    expect(next).not.toBeNull();
    const d = new Date(next as number);
    expect(d.getMonth()).toBe(1);
    expect(d.getDate()).toBe(15);
    expect(d.getHours()).toBe(9);
    expect(d.getMinutes()).toBe(30);
  });

  // The month end clamp drops the time of day. This pins the current
  // behaviour of `computeNextDueAt`, which is not the same as the weekly
  // and biweekly rhythms: they keep the exact instant.
  test("the month end clamp drops the time of day", () => {
    const from = new Date(2026, 0, 31, 9, 30, 0).getTime();
    const next = computeNextDueAt("monthly", from);
    expect(next).not.toBeNull();
    const d = new Date(next as number);
    expect(d.getMonth()).toBe(1);
    expect(d.getDate()).toBe(28);
    expect(d.getHours()).toBe(0);
    expect(d.getMinutes()).toBe(0);
  });
});

describe("the due date label", () => {
  // A repository without a due date is promoted immediately.
  test("a repository without a due date says immediate", () => {
    expect(formatDueDate(null)).toBe("Immediate");
  });

  // The label shows the month and the day, and neither the year nor the
  // time of day.
  test("the label shows the month and the day", () => {
    const ts = new Date(2026, 1, 28, 9, 0, 0).getTime();
    const label = formatDueDate(ts);
    expect(label).toBe(
      new Date(ts).toLocaleDateString(undefined, { month: "short", day: "numeric" })
    );
    expect(label).toContain("28");
    expect(label).not.toContain("2026");
  });
});
