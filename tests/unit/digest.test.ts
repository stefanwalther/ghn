import { describe, expect, test } from "bun:test";
import { computeNextDueAt, isDue, splitInbox } from "@/lib/digest";

describe("digest boundaries", () => {
  test("weekly adds 7 days", () => {
    const from = new Date(2026, 0, 5, 9, 0, 0).getTime();
    expect(computeNextDueAt("weekly", from)).toBe(from + 7 * 24 * 60 * 60 * 1000);
  });

  test("biweekly adds 14 days", () => {
    const from = new Date(2026, 0, 5, 9, 0, 0).getTime();
    expect(computeNextDueAt("biweekly", from)).toBe(from + 14 * 24 * 60 * 60 * 1000);
  });

  test("monthly handles Jan 31 by clamping to month end", () => {
    const from = new Date(2026, 0, 31, 9, 0, 0).getTime();
    const next = computeNextDueAt("monthly", from);
    expect(next).not.toBeNull();
    const d = new Date(next as number);
    expect(d.getMonth()).toBe(1);
    expect(d.getDate()).toBe(28);
  });

  test("immediate is always due with null next date", () => {
    expect(computeNextDueAt("immediate", 123)).toBeNull();
    expect(isDue({ id: "a", rhythm: "immediate", lastPromotedAt: null, nextDueAt: null }, 999)).toBe(true);
  });

  test("rhythm switch to immediate promotes on next load", () => {
    const repo = { id: "a", rhythm: "immediate" as const, lastPromotedAt: Date.now(), nextDueAt: null };
    expect(isDue(repo, Date.now())).toBe(true);
  });

  test("non-due items excluded from main flow", () => {    const now = Date.now();
    const repos = new Map([
      ["fast", { id: "fast", rhythm: "immediate" as const, lastPromotedAt: null, nextDueAt: null }],
      ["slow", { id: "slow", rhythm: "weekly" as const, lastPromotedAt: now, nextDueAt: now + 86400000 }],
    ]);
    const items = [
      { id: "1", repositoryId: "fast", isDone: false },
      { id: "2", repositoryId: "slow", isDone: false },
      { id: "3", repositoryId: "slow", isDone: true },
    ];
    const { mainFlow, collapsedRepoIds } = splitInbox(items, repos, now);
    expect(mainFlow.map((i) => i.id)).toEqual(["1"]);
    expect([...collapsedRepoIds]).toEqual(["slow"]);
  });
});

describe("digest on live-discovered rows", () => {
  test("weekly repo with future nextDueAt stays collapsed until due", () => {
    const now = Date.now();
    const repos = new Map([
      ["live", { id: "live", rhythm: "weekly" as const, lastPromotedAt: null, nextDueAt: now + 86400000 }],
    ]);
    expect(isDue(repos.get("live")!, now)).toBe(false);
    const { mainFlow, collapsedRepoIds } = splitInbox(
      [{ id: "t1", repositoryId: "live", isDone: false }],
      repos,
      now
    );
    expect(mainFlow).toHaveLength(0);
    expect([...collapsedRepoIds]).toEqual(["live"]);
  });

  test("past-due digest repo promotes into the main flow", () => {
    const now = Date.now();
    const repos = new Map([
      ["live", { id: "live", rhythm: "monthly" as const, lastPromotedAt: now - 40 * 86400000, nextDueAt: now - 1000 }],
    ]);
    expect(isDue(repos.get("live")!, now)).toBe(true);
    const { mainFlow } = splitInbox(
      [{ id: "t1", repositoryId: "live", isDone: false }],
      repos,
      now
    );
    expect(mainFlow.map((i) => i.id)).toEqual(["t1"]);
  });

  test("switching a live repo to immediate promotes pending items", () => {
    const now = Date.now();
    const repo = { id: "live", rhythm: "immediate" as const, lastPromotedAt: now, nextDueAt: null };
    expect(isDue(repo, now)).toBe(true);
    expect(computeNextDueAt("immediate", now)).toBeNull();
  });
});
