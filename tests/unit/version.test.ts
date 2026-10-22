import { describe, expect, test } from "vitest";
import { compareVersions, isNewerVersion, normalizeVersionTag } from "@/lib/version";

describe("version comparison", () => {
  test("equal versions are not newer", () => {
    expect(isNewerVersion("0.1.0", "0.1.0")).toBe(false);
    expect(isNewerVersion("0.1.0", "v0.1.0")).toBe(false);
  });

  test("a higher patch, minor or major is newer", () => {
    expect(isNewerVersion("0.1.0", "0.1.1")).toBe(true);
    expect(isNewerVersion("0.1.0", "0.2.0")).toBe(true);
    expect(isNewerVersion("0.1.0", "1.0.0")).toBe(true);
    expect(isNewerVersion("0.2.0", "0.1.9")).toBe(false);
  });

  test("missing segments default to zero", () => {
    expect(compareVersions("0.1", "0.1.0")).toBe(0);
    expect(isNewerVersion("0.1", "0.1.1")).toBe(true);
  });

  test("a release outranks the same pre-release core", () => {
    expect(isNewerVersion("0.2.0-beta.1", "0.2.0")).toBe(true);
    expect(isNewerVersion("0.2.0", "0.2.0-beta.1")).toBe(false);
  });

  test("blank input never reports an update", () => {
    expect(isNewerVersion("", "0.2.0")).toBe(false);
    expect(isNewerVersion("0.1.0", "")).toBe(false);
  });

  test("tags normalize a leading v for display", () => {
    expect(normalizeVersionTag("v0.2.0")).toBe("0.2.0");
    expect(normalizeVersionTag("  v1.0.0  ")).toBe("1.0.0");
  });

  test("release-please tags with a package prefix normalize too", () => {
    expect(normalizeVersionTag("ghn-v0.2.0")).toBe("0.2.0");
    expect(compareVersions("ghn-v0.1.0", "0.1.0")).toBe(0);
    expect(isNewerVersion("0.1.0", "ghn-v0.2.0")).toBe(true);
  });
});
