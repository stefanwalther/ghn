import { describe, expect, test } from "vitest";
import { describeBulkResult } from "@/lib/bulk";

describe("describeBulkResult", () => {
  test("returns null when nothing was queued", () => {
    expect(describeBulkResult("done", { updated: 69, queued: 0 })).toBeNull();
    expect(
      describeBulkResult("done", { updated: 69, queued: 0, error: null })
    ).toBeNull();
  });

  test("reports a partial apply with queued remainder", () => {
    const msg = describeBulkResult("done", {
      updated: 66,
      queued: 3,
      error: "network",
    });
    expect(msg).not.toBeNull();
    expect(msg).toContain("66");
    expect(msg).toContain("3");
    expect(msg).toContain("queued for retry");
  });

  test("reports a fully queued batch with restore note", () => {
    const msg = describeBulkResult("done", {
      updated: 0,
      queued: 69,
      error: "auth",
    });
    expect(msg).not.toBeNull();
    expect(msg).toContain("69");
    expect(msg).toContain("queued for retry");
    expect(msg).toContain("restored");
    expect(msg).toContain("GitHub access missing");
  });

  test("labels each bulk action", () => {
    expect(
      describeBulkResult("read", { updated: 1, queued: 2, error: "unknown" })
    ).toContain("marked read");
    expect(
      describeBulkResult("unsubscribe", {
        updated: 0,
        queued: 1,
        error: "rate_limited",
      })
    ).toContain("rate limit");
  });
});
