import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { fetchDayCount, getViewerLogin } from "@/lib/contributions";

/**
 * The credential switch in the contributions path.
 *
 * Both functions fall back to the local `gh` helper when no credential is
 * passed. The switch is what stops that fallback, and the fallback is what
 * would reach a real account. The helper is mocked here so the difference
 * between the two paths is observable.
 */

const helper = vi.hoisted(() => ({
  calls: [] as string[],
  output: "helper-login\n",
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
      // Synchronous, because the GraphQL path parses the text without
      // awaiting it.
      text() {
        return helper.output;
      },
      exitCode: 0,
    };
  };
  return { $: shell };
});

const KEYS = ["GHN_TOKEN", "GH_TOKEN", "GITHUB_TOKEN"] as const;
let saved: Record<string, string | undefined> = {};

beforeEach(() => {
  saved = {};
  for (const key of KEYS) saved[key] = process.env[key];
  helper.calls.length = 0;
  helper.output = "helper-login\n";
});

afterEach(() => {
  for (const key of KEYS) {
    const value = saved[key];
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
});

describe("the contributions credential switch", () => {
  // With the switch on, the local helper is never asked.
  test("the viewer is unknown and the helper is not asked", async () => {
    process.env.GHN_TOKEN = "";
    await expect(getViewerLogin()).resolves.toBeNull();
    expect(helper.calls).toEqual([]);
  });

  // With the switch off, the helper answers, which proves the switch is the
  // thing that stopped it a moment ago.
  test("without the switch the helper answers", async () => {
    delete process.env.GHN_TOKEN;
    await expect(getViewerLogin()).resolves.toBe("helper-login");
    expect(helper.calls.length).toBe(1);
  });

  test("the count is unknown and the helper is not asked", async () => {
    process.env.GHN_TOKEN = "";
    await expect(fetchDayCount("octo", "2026-01-15")).resolves.toBeNull();
    expect(helper.calls).toEqual([]);
  });

  test("without the switch the helper answers for the count", async () => {
    delete process.env.GHN_TOKEN;
    helper.output = JSON.stringify({
      data: {
        user: {
          contributionsCollection: {
            contributionCalendar: {
              weeks: [
                { contributionDays: [{ date: "2026-01-15", contributionCount: 9 }] },
              ],
            },
          },
        },
      },
    });
    await expect(fetchDayCount("octo", "2026-01-15")).resolves.toBe(9);
    expect(helper.calls.length).toBe(1);
  });
});
