import { describe, expect, test } from "bun:test";
import { formatSnoozeUntil, isSnoozed, snoozePresets } from "@/lib/snooze";

describe("snooze presets", () => {
  test("presets are ordered and in the future", () => {
    const now = new Date(2026, 5, 15, 10, 0, 0).getTime();
    const presets = snoozePresets(now);
    expect(presets.map((p) => p.value)).toEqual([
      "1h",
      "3h",
      "evening",
      "tomorrow",
      "nextWeek",
    ]);
    for (const p of presets) expect(p.at).toBeGreaterThan(now);
    expect(presets[0]?.at).toBe(now + 3600 * 1000);
    expect(presets[2]?.at).toBe(new Date(2026, 5, 15, 18, 0, 0).getTime());
    expect(presets[3]?.at).toBe(new Date(2026, 5, 16, 9, 0, 0).getTime());
    expect(presets[4]?.at).toBe(new Date(2026, 5, 22, 9, 0, 0).getTime());
  });

  test("evening rolls to tomorrow after 18:00", () => {
    const now = new Date(2026, 5, 15, 20, 0, 0).getTime();
    const evening = snoozePresets(now)[2];
    expect(evening?.at).toBe(new Date(2026, 5, 16, 18, 0, 0).getTime());
  });

  test("isSnoozed respects expiry", () => {
    const now = 1000;
    expect(isSnoozed(null, now)).toBe(false);
    expect(isSnoozed(now + 1, now)).toBe(true);
    expect(isSnoozed(now - 1, now)).toBe(false);
  });

  test("formatSnoozeUntil labels", () => {
    const now = new Date(2026, 5, 15, 10, 0, 0).getTime();
    expect(formatSnoozeUntil(null, now)).toBe("Not snoozed");
    expect(formatSnoozeUntil(now - 1, now)).toBe("Not snoozed");
    expect(formatSnoozeUntil(new Date(2026, 5, 15, 18, 0, 0).getTime(), now)).toContain("Today");
    expect(formatSnoozeUntil(new Date(2026, 5, 16, 9, 0, 0).getTime(), now)).toContain("Tomorrow");
    expect(formatSnoozeUntil(new Date(2026, 5, 22, 9, 0, 0).getTime(), now)).toContain("Mon");
  });
});
