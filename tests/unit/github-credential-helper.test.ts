import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

/**
 * The local credential helper is a Bun shell, so it can only be reached
 * from the production runtime. The module is mocked here so the fallback
 * path can be checked without a GitHub account.
 */
const helper = vi.hoisted(() => ({
  calls: [] as string[],
  output: "helper-token\n",
}));

vi.mock("bun", () => {
  const shell = (strings: TemplateStringsArray) => {
    helper.calls.push(strings.join(""));
    return {
      quiet() {
        return this;
      },
      nothrow() {
        return this;
      },
      async text() {
        return helper.output;
      },
    };
  };
  return { $: shell };
});

const { getStoredToken } = await import("@/lib/github");

const KEY = "GHN_TOKEN";
let saved: string | undefined;

beforeEach(() => {
  saved = process.env[KEY];
  helper.calls.length = 0;
  helper.output = "helper-token\n";
});

afterEach(() => {
  if (saved === undefined) delete process.env[KEY];
  else process.env[KEY] = saved;
});

describe("the credential helper", () => {
  // Without a configured token the local helper is asked for one.
  test("without a configured token the local helper is asked", async () => {
    delete process.env[KEY];
    await expect(getStoredToken()).resolves.toBe("helper-token");
    expect(helper.calls).toEqual(["gh auth token"]);
  });

  // The helper's output is trimmed, because the shell adds a newline.
  test("the helper's output is trimmed", async () => {
    delete process.env[KEY];
    helper.output = "  helper-token  \n";
    await expect(getStoredToken()).resolves.toBe("helper-token");
  });

  // A helper that reports no token means there is no credential.
  test("a helper without a token means no credential", async () => {
    delete process.env[KEY];
    helper.output = "\n";
    await expect(getStoredToken()).resolves.toBeNull();
  });

  // A configured token wins over the helper, and the helper is not even
  // asked.
  test("a configured token wins over the helper", async () => {
    process.env[KEY] = "configured-token";
    await expect(getStoredToken()).resolves.toBe("configured-token");
    expect(helper.calls).toEqual([]);
  });
});
