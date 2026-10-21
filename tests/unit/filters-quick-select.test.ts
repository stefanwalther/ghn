import { describe, expect, test } from "vitest";
import { selectByQuickFilter } from "@/lib/filters";

describe("the quick selects on sparse items", () => {
  // A thread that carries no subject type is not a release.
  test("a thread without a subject type is not a release", () => {
    const items = [{ id: "a", reason: "subscribed", subject: "Docs update" }];
    expect(selectByQuickFilter(items, "release")).toEqual([]);
  });

  // A thread that carries no merged flag is not merged.
  test("a thread without a merged flag is not merged", () => {
    const items = [{ id: "a", reason: "subscribed", subject: "Docs update" }];
    expect(selectByQuickFilter(items, "merged")).toEqual([]);
  });

  // A thread that carries no state is not closed.
  test("a thread without a state is not closed", () => {
    const items = [{ id: "a", reason: "subscribed", subject: "Docs update" }];
    expect(selectByQuickFilter(items, "closed")).toEqual([]);
  });

  // The values that are present are still read.
  test("the values that are present are still read", () => {
    const items = [
      {
        id: "release",
        reason: "subscribed",
        subject: "v2.4.0",
        subjectType: "Release",
      },
      {
        id: "merged",
        reason: "subscribed",
        subject: "Fix the flaky redirect",
        prMerged: true,
        subjectState: "closed",
      },
    ];
    expect(selectByQuickFilter(items, "release")).toEqual(["release"]);
    expect(selectByQuickFilter(items, "merged")).toEqual(["merged"]);
    expect(selectByQuickFilter(items, "closed")).toEqual([]);
  });
});
