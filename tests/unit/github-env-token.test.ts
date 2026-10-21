import { afterEach, describe, expect, test } from "bun:test";
import { getStoredToken } from "@/lib/github";

const KEYS = ["GH_TOKEN", "GITHUB_TOKEN"] as const;
const saved: Record<string, string | undefined> = {};

for (const key of KEYS) saved[key] = process.env[key];

afterEach(() => {
  for (const key of KEYS) {
    if (saved[key] === undefined) delete process.env[key];
    else process.env[key] = saved[key];
  }
});

describe("getStoredToken env-first", () => {
  test("returns GH_TOKEN trimmed", async () => {
    process.env.GH_TOKEN = "  abc123  ";
    delete process.env.GITHUB_TOKEN;
    expect(await getStoredToken()).toBe("abc123");
  });

  test("GH_TOKEN wins over GITHUB_TOKEN", async () => {
    process.env.GH_TOKEN = "primary";
    process.env.GITHUB_TOKEN = "fallback";
    expect(await getStoredToken()).toBe("primary");
  });

  test("whitespace-only GH_TOKEN falls through to GITHUB_TOKEN", async () => {
    process.env.GH_TOKEN = "   ";
    process.env.GITHUB_TOKEN = "fallback-token";
    expect(await getStoredToken()).toBe("fallback-token");
  });

  test("empty env never resolves to empty string", async () => {
    delete process.env.GH_TOKEN;
    delete process.env.GITHUB_TOKEN;
    const token = await getStoredToken();
    expect(token === null || (typeof token === "string" && token.length > 0)).toBe(true);
  });
});
