import { describe, expect, test } from "vitest";
import { isClosedItem, isReleaseItem, matchesTypeFilter } from "@/lib/filters";

describe("the release detection", () => {
  // A version tag at the front of the subject is a release, whatever the
  // notification reason says.
  test("a version tag in the subject counts as a release", () => {
    expect(
      isReleaseItem({ reason: "subscribed", subject: "v2.4.0", subjectType: "PullRequest" })
    ).toBe(true);
  });

  // The tag is matched at the start of the subject, ignoring the case and
  // the surrounding whitespace.
  test("the version tag is matched case-insensitively", () => {
    expect(
      isReleaseItem({ reason: "subscribed", subject: "  V10.1 shipped", subjectType: null })
    ).toBe(true);
  });

  // A version number that is not at the front is part of another subject,
  // not a release.
  test("a version number in the middle of the subject does not count", () => {
    expect(
      isReleaseItem({
        reason: "subscribed",
        subject: "Backport v2.4.0 to main",
        subjectType: "PullRequest",
      })
    ).toBe(false);
  });
});

describe("the merged filter", () => {
  // The merged reason is a real reason in its own right.
  test("the merged reason matches the merged filter", () => {
    expect(matchesTypeFilter("merged", "Issue", "merged")).toBe(true);
  });

  // A pull request that GitHub reports as merged matches too.
  test("a merged pull request matches the merged filter", () => {
    expect(
      matchesTypeFilter("subscribed", "PullRequest", "merged", { prMerged: true })
    ).toBe(true);
  });

  // An open pull request does not.
  test("an open pull request does not match the merged filter", () => {
    expect(
      matchesTypeFilter("subscribed", "PullRequest", "merged", { prMerged: false })
    ).toBe(false);
    expect(matchesTypeFilter("subscribed", "PullRequest", "merged")).toBe(false);
  });
});

describe("the closed filter", () => {
  // A closed subject matches, whatever the reason says.
  test("a closed subject matches the closed filter", () => {
    expect(
      matchesTypeFilter("subscribed", "PullRequest", "closed", { subjectState: "closed" })
    ).toBe(true);
  });

  // A merged pull request is not a closed pull request; the merged filter
  // owns that row, so the two filters never double count it.
  test("a merged pull request does not match the closed filter", () => {
    expect(
      matchesTypeFilter("subscribed", "PullRequest", "closed", {
        subjectState: "closed",
        prMerged: true,
      })
    ).toBe(false);
    expect(
      matchesTypeFilter("merged", "PullRequest", "closed", { subjectState: "closed" })
    ).toBe(false);
  });

  // An open subject does not match.
  test("an open subject does not match the closed filter", () => {
    expect(
      matchesTypeFilter("subscribed", "PullRequest", "closed", { subjectState: "open" })
    ).toBe(false);
    expect(matchesTypeFilter("subscribed", "PullRequest", "closed")).toBe(false);
  });
});

describe("isClosedItem", () => {
  // A merged item is never counted as closed, even when its subject says
  // closed.
  test("a merged item is not closed", () => {
    expect(isClosedItem({ reason: "merged", subjectState: "closed" })).toBe(false);
    expect(
      isClosedItem({ reason: "subscribed", prMerged: true, subjectState: "closed" })
    ).toBe(false);
  });

  // A closed and not merged subject is closed.
  test("a closed subject is closed", () => {
    expect(
      isClosedItem({ reason: "subscribed", prMerged: false, subjectState: "closed" })
    ).toBe(true);
  });

  // An open subject is not closed.
  test("an open subject is not closed", () => {
    expect(
      isClosedItem({ reason: "subscribed", prMerged: false, subjectState: "open" })
    ).toBe(false);
    expect(isClosedItem({ reason: "subscribed", prMerged: false })).toBe(false);
  });
});
