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

  test("labels unread, unsubscribe partials, and unknown actions", () => {
    expect(
      describeBulkResult("unread", { updated: 1, queued: 1, error: null })
    ).toContain("marked unread");
    expect(
      describeBulkResult("unsubscribe", { updated: 2, queued: 1, error: null })
    ).toContain("unsubscribed");
    expect(
      describeBulkResult("mystery", { updated: 1, queued: 1, error: null })
    ).toContain("mystery");
  });

  test("reports deferred background sync without failure wording", () => {
    const msg = describeBulkResult("done", {
      updated: 30,
      queued: 5,
      error: "deferred",
    });
    expect(msg).not.toBeNull();
    expect(msg).toContain("30");
    expect(msg).toContain("5");
    expect(msg).toContain("syncing in background");
    expect(msg).not.toContain("queued for retry");
  });
});

describe("queuedBannerText", () => {
  test("returns null when the queue is empty", async () => {
    const { queuedBannerText } = await import("@/lib/bulk");
    expect(queuedBannerText(0)).toBeNull();
    expect(queuedBannerText(-1)).toBeNull();
  });

  test("names the waiting pushes without busy wording", async () => {
    const { queuedBannerText } = await import("@/lib/bulk");
    expect(queuedBannerText(1)).toBe(
      "1 change waiting for GitHub. Hidden rows stay hidden until the push succeeds."
    );
    expect(queuedBannerText(3)).toBe(
      "3 changes waiting for GitHub. Hidden rows stay hidden until the push succeeds."
    );
  });
});

describe("describeRepoDoneResult", () => {
  test("falls back to the bulk wording when nothing was hidden", async () => {
    const { describeRepoDoneResult } = await import("@/lib/bulk");
    expect(
      describeRepoDoneResult("acme/api", { updated: 2, queued: 0, hiddenPending: 0 })
    ).toBeNull();
  });

  test("states the hidden pending items that were cleared", async () => {
    const { describeRepoDoneResult } = await import("@/lib/bulk");
    expect(
      describeRepoDoneResult("acme/api", { updated: 2, queued: 0, hiddenPending: 2 })
    ).toBe("acme/api marked done, including 2 hidden pending items.");
    expect(
      describeRepoDoneResult("acme/api", { updated: 1, queued: 0, hiddenPending: 1 })
    ).toBe("acme/api marked done, including 1 hidden pending item.");
  });

  test("appends the queued remainder when part of the push failed", async () => {
    const { describeRepoDoneResult } = await import("@/lib/bulk");
    expect(
      describeRepoDoneResult("acme/api", {
        updated: 1,
        queued: 1,
        error: "network",
        hiddenPending: 2,
      })
    ).toBe(
      "acme/api marked done, including 2 hidden pending items. 1 queued for retry (GitHub unreachable)."
    );
  });

  test("reports deferred background sync without failure wording", async () => {
    const { describeRepoDoneResult } = await import("@/lib/bulk");
    expect(
      describeRepoDoneResult("acme/api", {
        updated: 30,
        queued: 5,
        error: "deferred",
        hiddenPending: 4,
      })
    ).toBe(
      "acme/api marked done, including 4 hidden pending items. 5 syncing in background."
    );
  });
});
