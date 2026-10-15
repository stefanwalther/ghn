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

  test("non-due items excluded from main flow", () => {
    const now = Date.now();
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
