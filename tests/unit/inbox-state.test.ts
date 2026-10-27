import { describe, expect, test } from "vitest";
import {
  applyLocalAction,
  applyOptimisticList,
  nextFocusIndex,
  nextRepoAfterMarkDone,
  nextSelection,
  pollWindow,
  toggleAllSelection,
} from "@/lib/inbox-state";

interface Row {
  id: string;
  isRead: number;
  isDone: number;
}

const rows: Row[] = [
  { id: "a", isRead: 0, isDone: 0 },
  { id: "b", isRead: 1, isDone: 0 },
  { id: "c", isRead: 0, isDone: 1 },
];

describe("selection", () => {
  test("toggling adds an item that is not selected", () => {
    expect([...nextSelection(rows, new Set(), "a")]).toEqual(["a"]);
  });

  test("toggling removes an item that is selected", () => {
    expect([...nextSelection(rows, new Set(["a", "b"]), "a")]).toEqual(["b"]);
  });

  test("toggling an unknown id changes nothing", () => {
    expect([...nextSelection(rows, new Set(["a"]), "zzz")]).toEqual(["a"]);
  });

  test("toggling does not mutate the set it was given", () => {
    const before = new Set(["a"]);
    nextSelection(rows, before, "b");
    expect([...before]).toEqual(["a"]);
  });

  test("selecting everything takes every id", () => {
    expect([...toggleAllSelection(rows, new Set(["a"]))]).toEqual(["a", "b", "c"]);
  });

  test("selecting everything again clears the selection", () => {
    const all = new Set(["a", "b", "c"]);
    expect([...toggleAllSelection(rows, all)]).toEqual([]);
  });

  test("selecting everything on an empty list clears the selection", () => {
    expect([...toggleAllSelection([], new Set(["a"]))]).toEqual([]);
  });
});

describe("optimistic triage", () => {
  test("done removes the rows from the list", () => {
    expect(applyLocalAction(rows, ["b"], "done").map((r) => r.id)).toEqual(["a", "c"]);
  });

  test("unsubscribe removes the rows from the list", () => {
    expect(applyLocalAction(rows, ["a"], "unsubscribe").map((r) => r.id)).toEqual([
      "b",
      "c",
    ]);
  });

  test("read marks the rows as read and keeps them", () => {
    const next = applyLocalAction(rows, ["a"], "read");
    expect(next.map((r) => r.id)).toEqual(["a", "b", "c"]);
    expect(next[0]?.isRead).toBe(1);
    expect(next[1]?.isRead).toBe(1);
  });

  test("unread clears the read and the done flags", () => {
    const next = applyLocalAction(rows, ["c"], "unread");
    expect(next[2]?.isDone).toBe(0);
    expect(next[2]?.isRead).toBe(0);
  });

  test("the rows that are not targeted are untouched", () => {
    const next = applyLocalAction(rows, ["a"], "read");
    expect(next[1]).toEqual(rows[1]);
    expect(next[2]).toEqual(rows[2]);
  });

  test("an unknown id changes nothing", () => {
    expect(applyLocalAction(rows, ["zzz"], "done")).toEqual(rows);
  });

  test("the list it was given is not mutated", () => {
    const before = [...rows];
    applyLocalAction(rows, ["a"], "read");
    expect(rows).toEqual(before);
  });
});

describe("state-aware optimistic list", () => {
  test("done in the unread view removes the rows", () => {
    expect(applyOptimisticList(rows, ["b"], "done", "unread").map((r) => r.id)).toEqual([
      "a",
      "c",
    ]);
  });

  test("unsubscribe in the unread view removes the rows", () => {
    expect(
      applyOptimisticList(rows, ["a"], "unsubscribe", "unread").map((r) => r.id)
    ).toEqual(["b", "c"]);
  });

  test("done in the done view changes nothing", () => {
    expect(applyOptimisticList(rows, ["a"], "done", "done")).toEqual(rows);
  });

  test("done in the all view marks the rows in place", () => {
    const next = applyOptimisticList(rows, ["b"], "done", "all");
    expect(next.map((r) => r.id)).toEqual(["a", "b", "c"]);
    expect(next[1]?.isDone).toBe(1);
  });

  test("unsubscribe in the all view marks the rows in place", () => {
    const next = applyOptimisticList(rows, ["a"], "unsubscribe", "all");
    expect(next.map((r) => r.id)).toEqual(["a", "b", "c"]);
    expect(next[0]?.isDone).toBe(1);
  });

  test("read marks the rows as read and keeps them", () => {
    const next = applyOptimisticList(rows, ["a"], "read", "unread");
    expect(next.map((r) => r.id)).toEqual(["a", "b", "c"]);
    expect(next[0]?.isRead).toBe(1);
  });

  test("unread in the done view removes the restored rows", () => {
    expect(applyOptimisticList(rows, ["c"], "unread", "done").map((r) => r.id)).toEqual([
      "a",
      "b",
    ]);
  });

  test("unread in the unread view clears the flags and keeps the rows", () => {
    const next = applyOptimisticList(rows, ["c"], "unread", "unread");
    expect(next.map((r) => r.id)).toEqual(["a", "b", "c"]);
    expect(next[2]?.isDone).toBe(0);
    expect(next[2]?.isRead).toBe(0);
  });

  test("unread in the all view clears the flags and keeps the rows", () => {
    const next = applyOptimisticList(rows, ["c"], "unread", "all");
    expect(next.map((r) => r.id)).toEqual(["a", "b", "c"]);
    expect(next[2]?.isDone).toBe(0);
  });
});

describe("keyboard focus", () => {
  test("moving down with nothing focused lands on the first row", () => {
    expect(nextFocusIndex(3, null, 1)).toBe(0);
  });

  test("moving up with nothing focused lands on the last row", () => {
    expect(nextFocusIndex(3, null, -1)).toBe(2);
  });

  test("moving down from the last row stays on it", () => {
    expect(nextFocusIndex(3, 2, 1)).toBe(2);
  });

  test("moving up from the first row stays on it", () => {
    expect(nextFocusIndex(3, 0, -1)).toBe(0);
  });

  test("moving down from the middle lands on the next row", () => {
    expect(nextFocusIndex(3, 1, 1)).toBe(2);
  });

  test("an empty list has no focus", () => {
    expect(nextFocusIndex(0, null, 1)).toBeNull();
    expect(nextFocusIndex(0, 3, -1)).toBeNull();
  });
});

describe("the poll window", () => {
  const lastSyncAt = 1_700_000_000_000;

  test("a sync that never happened is never held back", () => {
    expect(pollWindow(null, 60, lastSyncAt)).toEqual({
      inWindow: false,
      countdownSecs: 0,
    });
  });

  test("the window is open until the interval has passed", () => {
    expect(pollWindow(lastSyncAt, 60, lastSyncAt + 10_000)).toEqual({
      inWindow: true,
      countdownSecs: 50,
    });
  });

  test("the window closes once the interval has passed", () => {
    expect(pollWindow(lastSyncAt, 60, lastSyncAt + 60_000)).toEqual({
      inWindow: false,
      countdownSecs: 0,
    });
  });

  test("the countdown rounds up to whole seconds", () => {
    expect(pollWindow(lastSyncAt, 60, lastSyncAt + 1).countdownSecs).toBe(60);
    expect(pollWindow(lastSyncAt, 60, lastSyncAt + 59_001).countdownSecs).toBe(1);
  });
});

describe("next repo after mark done", () => {
  const repos = [
    { id: "a", main: 1, quiet: 0 },
    { id: "b", main: 1, quiet: 0 },
    { id: "c", main: 1, quiet: 0 },
  ];

  test("selects the next repo when one follows", () => {
    expect(nextRepoAfterMarkDone(repos, "b", "b")).toBe("c");
    expect(nextRepoAfterMarkDone(repos, "a", "a")).toBe("b");
  });

  test("selects the previous repo when the emptied one was last", () => {
    expect(nextRepoAfterMarkDone(repos, "c", "c")).toBe("b");
  });

  test("selects all when nothing else remains", () => {
    expect(nextRepoAfterMarkDone([{ id: "a", main: 1, quiet: 0 }], "a", "a")).toBe(
      "all"
    );
  });

  test("needs no navigation when another repo is active", () => {
    expect(nextRepoAfterMarkDone(repos, "a", "b")).toBeNull();
  });

  test("needs no navigation from the all view", () => {
    expect(nextRepoAfterMarkDone(repos, "all", "b")).toBeNull();
  });

  test("skips repos that are already empty", () => {
    const mixed = [
      { id: "a", main: 0, quiet: 0 },
      { id: "b", main: 1, quiet: 0 },
      { id: "c", main: 0, quiet: 0 },
    ];
    expect(nextRepoAfterMarkDone(mixed, "b", "b")).toBe("all");
  });
});
