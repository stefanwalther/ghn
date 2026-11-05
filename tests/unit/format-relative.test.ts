import { describe, expect, test } from "vitest";
import { formatRelativeTime } from "@/lib/format-relative";

const NOW = 1_700_000_000_000;

describe("formatRelativeTime", () => {
  test("shows just now under a minute", () => {
    expect(formatRelativeTime(NOW, NOW)).toBe("just now");
    expect(formatRelativeTime(NOW - 59_000, NOW)).toBe("just now");
    // Future timestamps clamp to just now.
    expect(formatRelativeTime(NOW + 60_000, NOW)).toBe("just now");
  });

  test("shows minutes under an hour", () => {
    expect(formatRelativeTime(NOW - 60_000, NOW)).toBe("1 min ago");
    expect(formatRelativeTime(NOW - 5 * 60_000, NOW)).toBe("5 mins ago");
  });

  test("shows hours under a day", () => {
    expect(formatRelativeTime(NOW - 60 * 60_000, NOW)).toBe("1 hr ago");
    expect(formatRelativeTime(NOW - 12 * 60 * 60_000, NOW)).toBe("12 hrs ago");
  });

  test("shows days under a month", () => {
    expect(formatRelativeTime(NOW - 24 * 60 * 60_000, NOW)).toBe("1 day ago");
    expect(formatRelativeTime(NOW - 4 * 24 * 60 * 60_000, NOW)).toBe("4 days ago");
  });
});
