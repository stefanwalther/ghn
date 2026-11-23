"use client";

import * as React from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Check, ChevronDown, ExternalLink } from "lucide-react";
import { Button } from "@/components/ui/button";
import { fetchJson } from "@/lib/queries";
import { queryKeys } from "@/lib/query-keys";
import {
  PULL_MERGE_METHOD_LABELS,
  allowedMergeMethods,
  type PullMergeMethod,
  type PullRequestExtra,
  type RepoMergeSettings,
} from "@/lib/github";
import { resolvePullPrimaryControl } from "@/lib/pr-controls";

const LAST_METHOD_KEY = "ghn:last-merge-method";

function loadLastMethod(): PullMergeMethod | null {
  try {
    const value = window.localStorage.getItem(LAST_METHOD_KEY);
    return value === "merge" || value === "squash" || value === "rebase" ? value : null;
  } catch {
    return null;
  }
}

function rememberMethod(method: PullMergeMethod) {
  try {
    window.localStorage.setItem(LAST_METHOD_KEY, method);
  } catch {
    // Persistence is a convenience; the action already ran.
  }
}

interface ActionResult {
  ok: boolean;
  message?: string;
  sha?: string;
}

async function runThreadAction(
  id: string,
  action: string,
  method?: PullMergeMethod
): Promise<ActionResult> {
  return fetchJson<ActionResult>("/api/thread/actions", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ id, action, method }),
  });
}

interface MenuEntry {
  key: string;
  label: string;
  detail?: string;
  disabledReason?: string;
  destructive?: boolean;
}

/**
 * The GitHub action bar for a pull-request drawer: one split button, sticky
 * at the bottom of the drawer. The main button runs the resolved primary
 * control (two-tap for merge); the arrow opens every other applicable
 * action. Unavailable options stay visible but greyed out with the reason.
 */
export function PullRequestActions({
  itemId,
  sourceUrl,
  state,
  merged,
  draft,
  checksState,
  pull,
  repoSettings,
}: {
  itemId: string;
  sourceUrl: string;
  state: string | null;
  merged: boolean | null;
  draft: boolean | null;
  checksState: "success" | "failure" | "pending" | "error" | null;
  pull: PullRequestExtra | null;
  repoSettings: RepoMergeSettings | null;
}) {
  const queryClient = useQueryClient();
  const [lastMethod, setLastMethod] = React.useState<PullMergeMethod | null>(null);
  const [menuOpen, setMenuOpen] = React.useState(false);
  const [armed, setArmed] = React.useState(false);
  const [armedMenu, setArmedMenu] = React.useState<string | null>(null);
  const [notice, setNotice] = React.useState<{ tone: "ok" | "err"; text: string } | null>(
    null
  );
  const timer = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  const menuRef = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    setLastMethod(loadLastMethod());
    setArmed(false);
    setArmedMenu(null);
    setMenuOpen(false);
    setNotice(null);
  }, [itemId]);

  React.useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    []
  );

  React.useEffect(() => {
    if (!menuOpen) return;
    function onPointerDown(event: PointerEvent) {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setMenuOpen(false);
        setArmedMenu(null);
      }
    }
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setMenuOpen(false);
        setArmedMenu(null);
      }
    }
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [menuOpen]);

  const mutation = useMutation({
    mutationFn: ({ action, method }: { action: string; method?: PullMergeMethod }) =>
      runThreadAction(itemId, action, method),
    onSuccess: (result, variables) => {
      if (!result.ok) {
        setNotice({ tone: "err", text: result.message ?? "GitHub refused the action." });
        return;
      }
      if (variables.method) {
        rememberMethod(variables.method);
        setLastMethod(variables.method);
      }
      setNotice({ tone: "ok", text: actionDoneText(variables.action) });
      setMenuOpen(false);
      setArmedMenu(null);
      void queryClient.invalidateQueries({ queryKey: queryKeys.thread(itemId) });
      void queryClient.invalidateQueries({ queryKey: ["notifications"] });
    },
    onError: () => {
      setNotice({ tone: "err", text: "The action did not reach GitHub." });
    },
  });

  const control = resolvePullPrimaryControl({
    state,
    merged,
    draft,
    extra: pull,
    checksState,
    settings: repoSettings,
    autoMergeEnabled: false,
    lastMethod,
  });
  const allowed = repoSettings ? allowedMergeMethods(repoSettings) : [];
  const isOpen = state !== "closed" && merged !== true;

  const conflicting = pull?.mergeable === false || pull?.mergeableState === "dirty";
  const blockedReason =
    conflicting || checksState === "failure" || checksState === "error"
      ? "Checks or conflicts block it"
      : checksState === "pending"
        ? "Checks still running"
        : null;

  const primaryLabel =
    control.kind === "merge"
      ? PULL_MERGE_METHOD_LABELS[control.method]
      : control.kind === "enable_auto_merge"
        ? "Enable auto-merge"
        : control.kind === "ready_for_review"
          ? "Ready for review"
          : control.kind === "reopen"
            ? "Reopen"
            : control.kind === "merged"
              ? "Merged"
              : control.kind === "closed"
                ? "Closed"
                : "Resolve conflicts";
  const primaryDisabled =
    mutation.isPending ||
    control.kind === "merged" ||
    control.kind === "closed" ||
    (control.kind === "merge" && blockedReason !== null);

  const entries: MenuEntry[] = [];
  if (isOpen && draft !== true) {
    for (const method of ["merge", "squash", "rebase"] as PullMergeMethod[]) {
      if (!allowed.includes(method)) {
        entries.push({
          key: `method-${method}`,
          label: PULL_MERGE_METHOD_LABELS[method],
          disabledReason: "Disabled in this repo's settings",
        });
      } else if (blockedReason) {
        entries.push({
          key: `method-${method}`,
          label: PULL_MERGE_METHOD_LABELS[method],
          disabledReason: blockedReason,
        });
      } else {
        entries.push({
          key: `method-${method}`,
          label: PULL_MERGE_METHOD_LABELS[method],
          detail: control.kind === "merge" && control.method === method ? "Selected" : undefined,
        });
      }
    }
    if (repoSettings?.allowAutoMerge !== false && allowed.length > 0) {
      entries.push({
        key: "auto-merge",
        label: "Enable auto-merge",
        disabledReason: blockedReason && checksState !== "failure" && checksState !== "error" ? blockedReason : undefined,
      });
    }
  }
  if (draft === true && isOpen) {
    entries.push({ key: "ready", label: "Ready for review" });
  }
  if (control.kind === "reopen") {
    entries.push({ key: "reopen", label: "Reopen" });
  }
  if (isOpen) {
    entries.push({ key: "close", label: "Close without merging", destructive: true });
  }
  const deletableBranch =
    merged === true && pull?.headRef && pull.headRef !== repoSettings?.defaultBranch
      ? pull.headRef
      : null;
  if (deletableBranch) {
    entries.push({
      key: "delete-branch",
      label: `Delete branch ${deletableBranch}`,
      destructive: true,
    });
  }

  function disarm() {
    setArmed(false);
    if (timer.current) {
      clearTimeout(timer.current);
      timer.current = null;
    }
  }

  function fire(action: string, method?: PullMergeMethod) {
    disarm();
    setArmedMenu(null);
    setNotice(null);
    mutation.mutate({ action, method });
  }

  function pressPrimary() {
    if (mutation.isPending || primaryDisabled) return;
    if (control.kind === "resolve_conflicts") {
      window.open(sourceUrl, "_blank", "noopener,noreferrer");
      return;
    }
    if (control.kind !== "merge") {
      const actionName =
        control.kind === "enable_auto_merge"
          ? "enable_auto_merge"
          : control.kind === "ready_for_review"
            ? "ready_for_review"
            : "reopen";
      fire(
        actionName,
        control.kind === "enable_auto_merge" ? control.method : undefined
      );
      return;
    }
    if (!armed) {
      setArmed(true);
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => setArmed(false), 3000);
      return;
    }
    fire("merge", control.method);
  }

  function pressEntry(entry: MenuEntry) {
    if (entry.disabledReason || mutation.isPending) return;
    if (entry.key.startsWith("method-")) {
      const method = entry.key.replace("method-", "") as PullMergeMethod;
      rememberMethod(method);
      setLastMethod(method);
      setMenuOpen(false);
      return;
    }
    if (entry.destructive) {
      if (armedMenu !== entry.key) {
        setArmedMenu(entry.key);
        return;
      }
    }
    const actionName =
      entry.key === "auto-merge"
        ? "enable_auto_merge"
        : entry.key === "ready"
          ? "ready_for_review"
          : entry.key === "reopen"
            ? "reopen"
            : entry.key === "close"
              ? "close"
              : "delete_branch";
    fire(actionName, entry.key === "auto-merge" ? controlMethod(control) : undefined);
  }

  return (
    <div
      className="sticky bottom-0 z-10 -mx-6 border-t border-border bg-card px-6 py-3"
      style={{ boxShadow: "0 -12px 24px -12px rgba(0, 0, 0, 0.55)" }}
    >
      <div className="flex flex-col gap-2">
        <h3 className="text-xs font-medium text-muted-foreground">GitHub</h3>
        <div className="inline-flex items-stretch self-start overflow-hidden rounded-md" role="group" aria-label="Pull request actions">
          <Button
            size="sm"
            disabled={primaryDisabled}
            aria-live="polite"
            onClick={pressPrimary}
            className="rounded-none border-0"
          >
            {mutation.isPending
              ? "Working…"
              : armed && control.kind === "merge"
                ? `Confirm ${primaryLabel}?`
                : primaryLabel}
            {control.kind === "resolve_conflicts" ? (
              <ExternalLink className="h-3.5 w-3.5" aria-hidden />
            ) : null}
          </Button>
          <span aria-hidden="true" className="w-px shrink-0 bg-primary-foreground/25" />
          <div className="relative flex items-stretch" ref={menuRef}>
            <Button
              size="sm"
              disabled={mutation.isPending || entries.length === 0}
              aria-haspopup="menu"
              aria-expanded={menuOpen}
              aria-label="More pull request actions"
              onClick={() => {
                setMenuOpen((open) => !open);
                setArmedMenu(null);
              }}
              className="rounded-none border-0 px-2"
            >
              <ChevronDown className="h-4 w-4" aria-hidden />
            </Button>
            {menuOpen ? (
              <div
                role="menu"
                aria-label="Pull request actions"
                className="absolute right-0 z-20 mb-1 w-72 rounded-md border border-border bg-card p-1 text-card-foreground shadow-lg"
                style={{ bottom: "100%" }}
              >
                {entries.map((entry) => {
                  const disabled = Boolean(entry.disabledReason) || mutation.isPending;
                  const armedNow = armedMenu === entry.key;
                  return (
                    <button
                      key={entry.key}
                      type="button"
                      role="menuitem"
                      disabled={disabled}
                      title={entry.disabledReason}
                      onClick={() => pressEntry(entry)}
                      className="flex w-full cursor-pointer items-center gap-2 rounded-sm px-2 py-2 text-left text-sm transition-colors hover:bg-accent hover:text-accent-foreground disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:bg-transparent disabled:hover:text-current"
                    >
                      {entry.key.startsWith("method-") &&
                      control.kind === "merge" &&
                      `method-${control.method}` === entry.key ? (
                        <Check className="h-4 w-4 shrink-0" aria-hidden />
                      ) : (
                        <span className="w-4 shrink-0" aria-hidden />
                      )}
                      <span className="min-w-0 flex-1">
                        <span className="block truncate">
                          {armedNow ? `Confirm ${entry.label.toLowerCase()}?` : entry.label}
                        </span>
                        {entry.disabledReason ? (
                          <span className="block truncate text-xs text-muted-foreground">
                            {entry.disabledReason}
                          </span>
                        ) : null}
                      </span>
                    </button>
                  );
                })}
              </div>
            ) : null}
          </div>
        </div>
        {allowed.length > 0 && isOpen ? (
          <p className="text-xs text-muted-foreground">
            Repo allows: {allowed.map((m) => PULL_MERGE_METHOD_LABELS[m]).join(", ")}
          </p>
        ) : null}
        {blockedReason && control.kind === "merge" ? (
          <p className="text-xs text-muted-foreground">{blockedReason}. It unlocks automatically.</p>
        ) : null}
        {notice ? (
          <p
            role="status"
            className={
              notice.tone === "ok"
                ? "text-xs text-muted-foreground"
                : "text-xs text-destructive"
            }
          >
            {notice.text}
          </p>
        ) : null}
      </div>
    </div>
  );
}

function controlMethod(control: { kind: string; method?: PullMergeMethod }): PullMergeMethod | undefined {
  return control.kind === "merge" || control.kind === "enable_auto_merge"
    ? control.method
    : undefined;
}

function actionDoneText(action: string): string {
  switch (action) {
    case "merge":
      return "Merged.";
    case "enable_auto_merge":
      return "Auto-merge enabled. It lands once checks pass.";
    case "close":
      return "Closed.";
    case "reopen":
      return "Reopened.";
    case "ready_for_review":
      return "Marked ready for review.";
    case "delete_branch":
      return "Branch deleted.";
    default:
      return "Done.";
  }
}
