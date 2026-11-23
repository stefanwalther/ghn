import {
  allowedMergeMethods,
  type PullMergeMethod,
  type PullRequestExtra,
  type RepoMergeSettings,
} from "@/lib/github";

/**
 * The single header control for a pull-request drawer, resolved from live
 * pull state plus the repository merge settings. One control only: the
 * drawer never shows Merge next to Auto-merge next to Resolve conflicts.
 */
export type PullPrimaryControl =
  | { kind: "merge"; method: PullMergeMethod }
  | { kind: "enable_auto_merge"; method: PullMergeMethod }
  | { kind: "resolve_conflicts" }
  | { kind: "ready_for_review" }
  | { kind: "reopen" }
  | { kind: "merged" }
  | { kind: "closed" };

export interface PullControlInput {
  state: string | null;
  merged: boolean | null;
  draft: boolean | null;
  extra: PullRequestExtra | null;
  checksState: "success" | "failure" | "pending" | "error" | null;
  settings: RepoMergeSettings | null;
  autoMergeEnabled: boolean;
  lastMethod: PullMergeMethod | null;
}

export function resolvePullPrimaryControl(input: PullControlInput): PullPrimaryControl {
  if (input.merged === true) return { kind: "merged" };
  if (input.state === "closed") return { kind: "reopen" };
  if (input.draft === true) return { kind: "ready_for_review" };
  if (input.autoMergeEnabled) return { kind: "merged" };

  const blocked =
    input.extra?.mergeableState === "blocked" ||
    input.extra?.mergeableState === "behind" ||
    input.extra?.mergeableState === "unstable" ||
    input.checksState === "failure" ||
    input.checksState === "error";
  const conflicting =
    input.extra?.mergeable === false || input.extra?.mergeableState === "dirty";
  if (conflicting) return { kind: "resolve_conflicts" };

  const allowed = input.settings ? allowedMergeMethods(input.settings) : [];
  const fallback: PullMergeMethod = allowed.includes("squash")
    ? "squash"
    : (allowed[0] ?? "squash");
  const method =
    input.lastMethod && allowed.includes(input.lastMethod) ? input.lastMethod : fallback;

  if (blocked) {
    const autoMergePossible =
      input.settings?.allowAutoMerge !== false && allowed.length > 0;
    if (autoMergePossible) return { kind: "enable_auto_merge", method };
    return { kind: "merge", method };
  }
  if (allowed.length === 0) return { kind: "merge", method };
  return { kind: "merge", method };
}

/** One human sentence when the Merge button cannot run. Never a dead click. */
export function mergeUnavailableReason(input: PullControlInput): string | null {
  const control = resolvePullPrimaryControl(input);
  if (control.kind !== "merge") return null;
  if (input.extra?.mergeable === false || input.extra?.mergeableState === "dirty") {
    return "This branch has conflicts with the base. Resolve them first.";
  }
  if (input.checksState === "failure" || input.checksState === "error") {
    return "Required checks are failing. Fix them or enable auto-merge.";
  }
  if (input.checksState === "pending") {
    return "Checks are still running. Merge unlocks once they pass.";
  }
  return null;
}
