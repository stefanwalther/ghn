import { describe, expect, test } from "vitest";
import {
  DRAWER_DEFAULT_WIDTH,
  DRAWER_MAX_WIDTH,
  DRAWER_MIN_WIDTH,
  clampDrawerWidth,
  loadDrawerWidth,
  previewFallbackKind,
  saveDrawerWidth,
} from "@/lib/view-state";

describe("drawer width", () => {
  test("clamps into bounds and rounds", () => {
    expect(clampDrawerWidth(10)).toBe(DRAWER_MIN_WIDTH);
    expect(clampDrawerWidth(100000)).toBe(DRAWER_MAX_WIDTH);
    expect(clampDrawerWidth(900.4)).toBe(900);
    expect(clampDrawerWidth(Number.NaN)).toBe(DRAWER_DEFAULT_WIDTH);
  });

  test("falls back to default without a DOM", () => {
    expect(loadDrawerWidth()).toBe(DRAWER_DEFAULT_WIDTH);
    expect(() => saveDrawerWidth(700)).not.toThrow();
  });
});

describe("previewFallbackKind", () => {
  test("names known non-thread types", () => {
    expect(previewFallbackKind("Release")).toBe("releases");
    expect(previewFallbackKind("Commit")).toBe("commits");
    expect(previewFallbackKind("Discussion")).toBe("discussions");
    expect(previewFallbackKind("CheckSuite")).toBe("check runs");
    expect(previewFallbackKind("RepositoryDependabotAlertsThread")).toBe(
      "security alerts"
    );
  });

  test("falls back for thread and unknown types", () => {
    expect(previewFallbackKind("PullRequest")).toBe("this item type");
    expect(previewFallbackKind("Issue")).toBe("this item type");
    expect(previewFallbackKind(null)).toBe("this item type");
    expect(previewFallbackKind(undefined)).toBe("this item type");
  });
});
