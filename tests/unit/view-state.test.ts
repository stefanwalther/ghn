import { describe, expect, test } from "vitest";
import {
  DRAWER_DEFAULT_WIDTH,
  DRAWER_MAX_WIDTH,
  DRAWER_MIN_WIDTH,
  FILTER_DEFAULT_WIDTH,
  FILTER_MAX_WIDTH,
  FILTER_MIN_WIDTH,
  clampDrawerWidth,
  clampFilterWidth,
  loadDrawerWidth,
  loadFilterWidth,
  parsePaletteLimit,
  previewFallbackKind,
  repoFilterHref,
  saveDrawerWidth,
  saveFilterWidth,
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

describe("filter width", () => {
  test("clamps into bounds and rounds", () => {
    expect(clampFilterWidth(10)).toBe(FILTER_MIN_WIDTH);
    expect(clampFilterWidth(100000)).toBe(FILTER_MAX_WIDTH);
    expect(clampFilterWidth(300.4)).toBe(300);
    expect(clampFilterWidth(Number.NaN)).toBe(FILTER_DEFAULT_WIDTH);
  });

  test("falls back to default without a DOM", () => {
    expect(loadFilterWidth()).toBe(FILTER_DEFAULT_WIDTH);
    expect(() => saveFilterWidth(300)).not.toThrow();
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

describe("repoFilterHref", () => {
  test("preserves state, type, and age while swapping repo", () => {
    expect(repoFilterHref("?state=all&type=merged&age=7d&repo=old", "new")).toBe(
      "/?repo=new&state=all&type=merged&age=7d"
    );
  });

  test("builds repo-only href from empty search", () => {
    expect(repoFilterHref("", "r1")).toBe("/?repo=r1");
  });
});

describe("parsePaletteLimit", () => {
  test("returns null when absent so inbox stays unbounded", () => {
    expect(parsePaletteLimit(null)).toBeNull();
  });

  test("clamps into 1 to 400 and falls back on garbage", () => {
    expect(parsePaletteLimit("400")).toBe(400);
    expect(parsePaletteLimit("9999")).toBe(400);
    expect(parsePaletteLimit("0")).toBe(1);
    expect(parsePaletteLimit("oops")).toBe(400);
  });
});
