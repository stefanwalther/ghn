import { describe, expect, test } from "vitest";
import {
  mergeUnavailableReason,
  resolvePullPrimaryControl,
  type PullControlInput,
} from "@/lib/pr-controls";
import type { PullRequestExtra, RepoMergeSettings } from "@/lib/github";

const SETTINGS_ALL: RepoMergeSettings = {
  allowMergeCommit: true,
  allowSquashMerge: true,
  allowRebaseMerge: true,
  allowAutoMerge: true,
  defaultBranch: "main",
};

const SETTINGS_SQUASH_ONLY: RepoMergeSettings = {
  allowMergeCommit: false,
  allowSquashMerge: true,
  allowRebaseMerge: false,
  allowAutoMerge: true,
  defaultBranch: "main",
};

function extra(overrides: Partial<PullRequestExtra> = {}): PullRequestExtra {
  return {
    mergeable: true,
    mergeableState: "clean",
    mergedByLogin: null,
    mergeCommitSha: null,
    baseRef: "main",
    baseSha: "base",
    headRef: "feature",
    headSha: "head",
    additions: 10,
    deletions: 2,
    changedFiles: 1,
    labels: [],
    nodeId: "PR_node",
    reviewVerdict: "none",
    approvals: 0,
    changesRequested: 0,
    requestedReviewers: [],
    ...overrides,
  };
}

function input(overrides: Partial<PullControlInput> = {}): PullControlInput {
  return {
    state: "open",
    merged: false,
    draft: false,
    extra: extra(),
    checksState: "success",
    settings: SETTINGS_ALL,
    autoMergeEnabled: false,
    lastMethod: null,
    ...overrides,
  };
}

describe("resolvePullPrimaryControl", () => {
  test("a clean pull request merges with the remembered method", () => {
    expect(resolvePullPrimaryControl(input({ lastMethod: "rebase" }))).toEqual({
      kind: "merge",
      method: "rebase",
    });
  });

  test("the remembered method falls back when the repo disallows it", () => {
    expect(
      resolvePullPrimaryControl(
        input({ settings: SETTINGS_SQUASH_ONLY, lastMethod: "rebase" })
      )
    ).toEqual({ kind: "merge", method: "squash" });
  });

  test("a squash-only repo offers exactly its one method", () => {
    expect(resolvePullPrimaryControl(input({ settings: SETTINGS_SQUASH_ONLY }))).toEqual(
      {
        kind: "merge",
        method: "squash",
      }
    );
  });

  test("merged and closed states never offer an action", () => {
    expect(resolvePullPrimaryControl(input({ merged: true }))).toEqual({
      kind: "merged",
    });
    expect(
      resolvePullPrimaryControl(input({ state: "closed", merged: false }))
    ).toEqual({ kind: "reopen" });
  });

  test("drafts offer ready-for-review", () => {
    expect(resolvePullPrimaryControl(input({ draft: true }))).toEqual({
      kind: "ready_for_review",
    });
  });

  test("conflicts resolve before anything else", () => {
    expect(
      resolvePullPrimaryControl(
        input({ extra: extra({ mergeable: false, mergeableState: "dirty" }) })
      )
    ).toEqual({ kind: "resolve_conflicts" });
  });

  test("failing checks offer auto-merge when the repo allows it", () => {
    expect(resolvePullPrimaryControl(input({ checksState: "failure" }))).toEqual({
      kind: "enable_auto_merge",
      method: "squash",
    });
  });

  test("failing checks without auto-merge stay a plain merge with a reason", () => {
    const settings = { ...SETTINGS_ALL, allowAutoMerge: false };
    expect(
      resolvePullPrimaryControl(input({ checksState: "failure", settings }))
    ).toEqual({ kind: "merge", method: "squash" });
    expect(mergeUnavailableReason(input({ checksState: "failure", settings }))).toBe(
      "Required checks are failing. Fix them or enable auto-merge."
    );
  });

  test("pending checks explain the wait", () => {
    expect(mergeUnavailableReason(input({ checksState: "pending" }))).toBe(
      "Checks are still running. Merge unlocks once they pass."
    );
  });

  test("a clean pull request needs no reason", () => {
    expect(mergeUnavailableReason(input())).toBeNull();
  });
});
