import { afterEach, beforeEach, describe, expect, test } from "vitest";
import { getStoredToken, tokenDisabled } from "@/lib/github";

/**
 * The credential override.
 *
 * The suite promises that an empty token means no credential at all, and
 * that it never falls back to the local helper. The promise is what keeps
 * the suite from reaching a real account on a machine where `gh` is
 * authenticated, so it is pinned here rather than assumed.
 */

const KEYS = ["GHN_TOKEN", "GH_TOKEN", "GITHUB_TOKEN"] as const;
let saved: Record<string, string | undefined> = {};

beforeEach(() => {
  saved = {};
  for (const key of KEYS) saved[key] = process.env[key];
});

afterEach(() => {
  for (const key of KEYS) {
    const value = saved[key];
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
});

describe("the token override", () => {
  // An empty value is the switch the suite uses to guarantee it cannot
  // reach a real account.
  test("an empty value means no credential", async () => {
    process.env.GHN_TOKEN = "";
    expect(tokenDisabled()).toBe(true);
    await expect(getStoredToken()).resolves.toBeNull();
  });

  // The fallback would find a real credential on a machine that has one.
  test("an empty value does not fall back to the environment token", async () => {
    process.env.GHN_TOKEN = "";
    process.env.GH_TOKEN = "ambient-token";
    process.env.GITHUB_TOKEN = "ambient-token";
    await expect(getStoredToken()).resolves.toBeNull();
  });

  test("a whitespace only value also means no credential", async () => {
    process.env.GHN_TOKEN = "   ";
    expect(tokenDisabled()).toBe(true);
    await expect(getStoredToken()).resolves.toBeNull();
  });

  // A configured value is what the suite uses to point the application at
  // the stand-in.
  test("a configured value is used as it is", async () => {
    process.env.GHN_TOKEN = "  stand-in-token  ";
    expect(tokenDisabled()).toBe(false);
    await expect(getStoredToken()).resolves.toBe("stand-in-token");
  });

  test("a configured value wins over the environment token", async () => {
    process.env.GHN_TOKEN = "override";
    process.env.GH_TOKEN = "ambient-token";
    await expect(getStoredToken()).resolves.toBe("override");
  });

  test("an absent override is not the same as an empty one", () => {
    delete process.env.GHN_TOKEN;
    expect(tokenDisabled()).toBe(false);
  });
});
