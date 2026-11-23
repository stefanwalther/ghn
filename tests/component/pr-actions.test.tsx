import { afterEach, describe, expect, test, vi } from "vitest";
import { cleanup, fireEvent, screen, waitFor, within } from "@testing-library/react";
import { renderWithQuery } from "./support/render-with-query";
import { PullRequestActions } from "@/components/inbox/pr-actions";
import type { PullRequestExtra, RepoMergeSettings } from "@/lib/github";

const settingsAll: RepoMergeSettings = {
  allowMergeCommit: true,
  allowSquashMerge: true,
  allowRebaseMerge: true,
  allowAutoMerge: true,
  defaultBranch: "main",
};

const settingsSquash: RepoMergeSettings = {
  allowMergeCommit: false,
  allowSquashMerge: true,
  allowRebaseMerge: false,
  allowAutoMerge: false,
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
    headRef: "fix-login",
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

const baseProps = {
  itemId: "n_001",
  sourceUrl: "https://github.com/acme/web/pull/1",
  state: "open",
  merged: false,
  draft: false,
  checksState: "success" as const,
  pull: extra(),
  repoSettings: settingsAll,
};

function stubActions(result: unknown = { ok: true }) {
  const calls: unknown[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
      calls.push(JSON.parse(String(init?.body ?? "{}")));
      return Response.json(result);
    })
  );
  return calls;
}

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  window.localStorage.clear();
});

describe("PullRequestActions", () => {
  test("the primary button merges with the remembered method", async () => {
    window.localStorage.setItem("ghn:last-merge-method", "rebase");
    const calls = stubActions();
    renderWithQuery(<PullRequestActions {...baseProps} />);
    expect(screen.getByRole("button", { name: "Rebase and merge" })).toBeInTheDocument();
    expect(screen.getByText(/Repo allows: Merge, Squash and merge, Rebase and merge/)).toBeInTheDocument();
  });

  test("two taps on the primary button fire the merge", async () => {
    const calls = stubActions();
    renderWithQuery(<PullRequestActions {...baseProps} />);
    const primary = screen.getByRole("button", { name: "Squash and merge" });
    fireEvent.click(primary);
    expect(
      await screen.findByRole("button", { name: "Confirm Squash and merge?" })
    ).toBeInTheDocument();
    expect(calls).toEqual([]);
    fireEvent.click(screen.getByRole("button", { name: "Confirm Squash and merge?" }));
    await waitFor(() => expect(calls).toEqual([{ id: "n_001", action: "merge", method: "squash" }]));
    expect(await screen.findByText("Merged.")).toBeInTheDocument();
  });

  test("disallowed methods stay visible but greyed out with the reason", async () => {
    stubActions();
    renderWithQuery(<PullRequestActions {...baseProps} repoSettings={settingsSquash} />);
    fireEvent.click(screen.getByRole("button", { name: "More pull request actions" }));
    const menu = await screen.findByRole("menu");
    const merge = within(menu).getByRole("menuitem", { name: /Merge Disabled in this repo's settings/ });
    expect(merge).toHaveAttribute("disabled");
    expect(within(menu).getByRole("menuitem", { name: "Squash and merge" })).not.toHaveAttribute("disabled");
  });

  test("choosing a method in the menu relabels the primary button", async () => {
    stubActions();
    renderWithQuery(<PullRequestActions {...baseProps} />);
    fireEvent.click(screen.getByRole("button", { name: "More pull request actions" }));
    const menu = await screen.findByRole("menu");
    fireEvent.click(within(menu).getByRole("menuitem", { name: "Merge" }));
    expect(await screen.findByRole("button", { name: "Merge" })).toBeInTheDocument();
    expect(window.localStorage.getItem("ghn:last-merge-method")).toBe("merge");
  });

  test("a merged pull offers branch deletion", async () => {
    stubActions();
    renderWithQuery(
      <PullRequestActions
        {...baseProps}
        merged
        state="closed"
        pull={extra({ mergedByLogin: "octo", mergeCommitSha: "abc" })}
      />
    );
    expect(screen.getByRole("button", { name: "Merged" })).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: "More pull request actions" }));
    const menu = await screen.findByRole("menu");
    expect(
      within(menu).getByRole("menuitem", { name: "Delete branch fix-login" })
    ).toBeInTheDocument();
  });

  test("a refused action surfaces the error", async () => {
    stubActions({ ok: false, message: "Merge failed (405)." });
    renderWithQuery(<PullRequestActions {...baseProps} />);
    fireEvent.click(screen.getByRole("button", { name: "Squash and merge" }));
    fireEvent.click(await screen.findByRole("button", { name: "Confirm Squash and merge?" }));
    expect(await screen.findByText("Merge failed (405).")).toBeInTheDocument();
  });

  test("a blocked pull explains itself and disables the primary button", async () => {
    stubActions();
    renderWithQuery(
      <PullRequestActions
        {...baseProps}
        checksState="failure"
        repoSettings={{ ...settingsSquash, allowAutoMerge: false }}
        pull={extra({ mergeableState: "blocked" })}
      />
    );
    expect(screen.getByRole("button", { name: "Squash and merge" })).toBeDisabled();
    expect(screen.getByText(/It unlocks automatically/)).toBeInTheDocument();
  });

  test("enable auto-merge fires with one press", async () => {
    const calls = stubActions();
    renderWithQuery(
      <PullRequestActions {...baseProps} checksState="failure" />
    );
    fireEvent.click(screen.getByRole("button", { name: "Enable auto-merge" }));
    await waitFor(() =>
      expect(calls).toEqual([{ id: "n_001", action: "enable_auto_merge", method: "squash" }])
    );
    expect(await screen.findByText(/Auto-merge enabled/)).toBeInTheDocument();
  });

  test("close from the menu fires after arming", async () => {
    const calls = stubActions();
    renderWithQuery(<PullRequestActions {...baseProps} />);
    fireEvent.click(screen.getByRole("button", { name: "More pull request actions" }));
    const menu = await screen.findByRole("menu");
    const close = within(menu).getByRole("menuitem", { name: "Close without merging" });
    fireEvent.click(close);
    expect(calls).toEqual([]);
    fireEvent.click(
      await within(menu).findByRole("menuitem", { name: "Confirm close without merging?" })
    );
    await waitFor(() => expect(calls).toEqual([{ id: "n_001", action: "close" }]));
    expect(await screen.findByText("Closed.")).toBeInTheDocument();
  });
});
