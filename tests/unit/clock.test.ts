import { afterEach, beforeEach, describe, expect, test } from "vitest";
import { nowMs } from "@/lib/clock";

const KEY = "GHN_NOW";

let saved: string | undefined;

beforeEach(() => {
  saved = process.env[KEY];
});

afterEach(() => {
  if (saved === undefined) delete process.env[KEY];
  else process.env[KEY] = saved;
});

describe("the clock", () => {
  // Without a pinned instant the clock is the real one.
  test("without a pinned instant the real clock is used", () => {
    delete process.env[KEY];
    const before = Date.now();
    const value = nowMs();
    const after = Date.now();
    expect(value).toBeGreaterThanOrEqual(before);
    expect(value).toBeLessThanOrEqual(after);
  });

  // A pinned instant in milliseconds is used as it is.
  test("a pinned instant in milliseconds is used as it is", () => {
    process.env[KEY] = "1792000000000";
    expect(nowMs()).toBe(1792000000000);
  });

  // A pinned instant can also be a date string.
  test("a pinned instant as a date string is parsed", () => {
    process.env[KEY] = "2026-10-18T10:00:00Z";
    expect(nowMs()).toBe(Date.parse("2026-10-18T10:00:00Z"));
  });

  // An empty value is not a pin, so the real clock is used.
  test("an empty value leaves the clock unpinned", () => {
    process.env[KEY] = "   ";
    const before = Date.now();
    const value = nowMs();
    expect(value).toBeGreaterThanOrEqual(before);
    expect(value).toBeLessThanOrEqual(Date.now());
  });

  // A malformed value degrades to "not pinned" instead of breaking the
  // application.
  test("a malformed value leaves the clock unpinned", () => {
    process.env[KEY] = "not an instant";
    const before = Date.now();
    const value = nowMs();
    expect(value).toBeGreaterThanOrEqual(before);
    expect(value).toBeLessThanOrEqual(Date.now());
  });
});
