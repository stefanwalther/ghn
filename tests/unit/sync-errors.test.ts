import { describe, expect, test } from "vitest";
import { syncErrorMessage } from "@/lib/sync-errors";

describe("sync failure messages", () => {
  test("each reason gets its own wording", () => {
    const messages = [
      syncErrorMessage("auth"),
      syncErrorMessage("rate_limited"),
      syncErrorMessage("network"),
      syncErrorMessage("unknown"),
    ];
    expect(new Set(messages).size).toBe(4);
  });

  test("the missing authorization tells the user what to run", () => {
    expect(syncErrorMessage("auth")).toContain("gh auth login");
  });

  test("the rate limit says to retry and that the inbox is cached", () => {
    expect(syncErrorMessage("rate_limited")).toContain("Retry shortly");
    expect(syncErrorMessage("rate_limited")).toContain("cached inbox");
  });

  test("the unreachable case says the inbox is cached", () => {
    expect(syncErrorMessage("network")).toContain("cached inbox");
  });

  test("an unknown reason falls back to a generic message", () => {
    expect(syncErrorMessage("unknown")).toBe("Sync failed. Showing last loaded data.");
    expect(syncErrorMessage(undefined)).toBe("Sync failed. Showing last loaded data.");
    expect(syncErrorMessage(null)).toBe("Sync failed. Showing last loaded data.");
    expect(syncErrorMessage(42)).toBe("Sync failed. Showing last loaded data.");
  });
});
