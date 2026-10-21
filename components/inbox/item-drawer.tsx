"use client";

import * as React from "react";
import { ChevronDown, ChevronUp, ExternalLink, EyeOff, X } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Markdown } from "@/components/inbox/markdown";
import { isClosedItem, isMergedItem } from "@/lib/filters";
import type { CheckSummary, DependabotAlertDetails, SubjectContent, ThreadComment, WorkflowRun } from "@/lib/github";
import { SecurityAlertPreview } from "@/components/inbox/security-alert-preview";
import {
  findPinnedRun,
  formatRunAge,
  parseBranchFromTitle,
  parseWorkflowNameFromTitle,
} from "@/lib/github";
import {
  DRAWER_MAX_WIDTH,
  DRAWER_MIN_WIDTH,
  clampDrawerWidth,
  loadDrawerWidth,
  previewFallbackKind,
  saveDrawerWidth,
  saveLastOpened,
} from "@/lib/view-state";
import { reasonTone, type InboxItem } from "@/components/inbox/notification-list";
import type { ItemMenuAction } from "@/components/inbox/item-menu";

interface ThreadDetails extends SubjectContent {
  comments: ThreadComment[];
  checks: CheckSummary | null;
}

function TitleLink({ item }: { item: InboxItem }) {
  const [active, setActive] = React.useState(false);
  return (
    <a
      href={item.sourceUrl}
      target="_blank"
      rel="noopener noreferrer"
      aria-label={`Open source for ${item.subject}`}
      title={`Open source for ${item.subject} in a new window`}
      onClick={() => saveLastOpened(item.id)}
      onMouseEnter={() => setActive(true)}
      onMouseLeave={() => setActive(false)}
      onFocus={() => setActive(true)}
      onBlur={() => setActive(false)}
      style={{ textDecoration: active ? "underline" : "none" }}
      className="cursor-pointer rounded-sm transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      {item.subject}{" "}
      <ExternalLink
        aria-hidden
        style={{ display: "inline-block", verticalAlign: "middle", width: "1rem", height: "1rem" }}
      />
    </a>
  );
}

function runDotClass(conclusion: string | null): string {
  if (conclusion === "success") return "h-2 w-2 shrink-0 rounded-full bg-primary";
  if (conclusion === "failure" || conclusion === "timed_out" || conclusion === "action_required")
    return "h-2 w-2 shrink-0 rounded-full bg-destructive";
  return "h-2 w-2 shrink-0 rounded-full bg-muted";
}

export function ItemDrawer({
  item,
  onClose,
  onAction,
  onPrev,
  onNext,
  hasPrev,
  hasNext,
  positionLabel,
}: {
  item: InboxItem;
  onClose: () => void;
  onAction: (item: InboxItem, action: ItemMenuAction) => void;
  onPrev?: () => void;
  onNext?: () => void;
  hasPrev?: boolean;
  hasNext?: boolean;
  positionLabel?: string;
}) {
  const merged = isMergedItem({ reason: item.reason, prMerged: item.prMerged ?? false });
  const closed = isClosedItem({
    reason: item.reason,
    prMerged: item.prMerged ?? false,
    subjectState: item.subjectState ?? null,
  });
  const [content, setContent] = React.useState<ThreadDetails | null>(null);  const [contentState, setContentState] = React.useState<"loading" | "ready" | "unavailable">(
    "loading"
  );
  const [runs, setRuns] = React.useState<WorkflowRun[]>([]);
  const [alert, setAlert] = React.useState<DependabotAlertDetails | null>(null);
  const [width, setWidth] = React.useState<number>(() => loadDrawerWidth());
  const draggingRef = React.useRef(false);
  const scrollRef = React.useRef<HTMLElement>(null);
  const repositoryUrl = `https://github.com/${item.repositoryName}`;
  const branchFromTitle = parseBranchFromTitle(item.subject);
  const workflowName = parseWorkflowNameFromTitle(item.subject);
  const pinned = findPinnedRun(runs, workflowName, item.createdAt);
  const latest = runs.slice(0, 5);
  const latestBranch =
    branchFromTitle ?? latest.find((r) => r.branch)?.branch ?? null;
  const pinnedFailed =
    !!pinned &&
    (pinned.conclusion === "failure" ||
      pinned.conclusion === "timed_out" ||
      pinned.conclusion === "action_required");
  const latestAllGreen =
    latest.length > 0 && latest.every((r) => r.conclusion === "success");
  const pinnedHidden =
    !!pinned && !latest.some((r) => r.htmlUrl === pinned.htmlUrl);
  const fixedSince = Boolean(pinnedFailed && latestAllGreen && pinnedHidden);

  function resizeTo(clientX: number): void {
    setWidth(clampDrawerWidth(window.innerWidth - clientX));
  }

  function endResize(): void {
    if (!draggingRef.current) return;
    draggingRef.current = false;
    setWidth((current) => {
      saveDrawerWidth(current);
      return current;
    });
  }

  React.useEffect(() => {
    scrollRef.current?.scrollTo({ top: 0 });
  }, [item.id]);

  React.useEffect(() => {
    let cancelled = false;
    setContent(null);
    setRuns([]);
    setAlert(null);
    setContentState("loading");
    (async () => {
      try {
        const res = await fetch(`/api/thread?id=${encodeURIComponent(item.id)}`, {
          cache: "no-store",
        });
        if (!res.ok) throw new Error("thread failed");
        const data = (await res.json()) as ThreadDetails & {
          content?: SubjectContent | null;
          runs?: WorkflowRun[];
          alert?: DependabotAlertDetails | null;
        };
        if (!cancelled) {
          if (data.alert) {
            setAlert(data.alert);
            setContent(null);
            setRuns(Array.isArray(data.runs) ? data.runs : []);
          } else if ("content" in data && data.content === null) {
            setContent(null);
            setAlert(null);
            setRuns(Array.isArray(data.runs) ? data.runs : []);
          } else {
            setContent(data as ThreadDetails);
            setAlert(null);
            setRuns([]);
          }
          setContentState("ready");
        }
      } catch {
        if (!cancelled) setContentState("unavailable");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [item.id]);
  return (
    <div className="fixed inset-0 z-40" onClick={onClose}>
      <div className="absolute inset-0 bg-background/80" aria-hidden="true" />
      <aside
        ref={scrollRef}
        role="dialog"
        aria-modal="true"
        aria-label="Preview drawer"
        style={{ width: `${width}px`, maxWidth: "calc(100vw - 48px)" }}
        className="absolute inset-y-0 right-0 flex flex-col gap-4 overflow-y-auto border-l border-border bg-card p-6 pl-8 shadow-md"
        onClick={(e) => e.stopPropagation()}
      >
        <div
          role="separator"
          aria-orientation="vertical"
          aria-label="Resize details panel"
          aria-valuenow={Math.round(width)}
          aria-valuemin={DRAWER_MIN_WIDTH}
          aria-valuemax={DRAWER_MAX_WIDTH}
          tabIndex={0}
          style={{ position: "absolute", top: 0, bottom: 0, left: 0, width: "12px", cursor: "ew-resize", touchAction: "none" }}
          onPointerDown={(e) => {
            draggingRef.current = true;
            e.currentTarget.setPointerCapture(e.pointerId);
            resizeTo(e.clientX);
          }}
          onPointerMove={(e) => {
            if (draggingRef.current) resizeTo(e.clientX);
          }}
          onPointerUp={endResize}
          onPointerCancel={endResize}
          onKeyDown={(e) => {
            if (e.key === "ArrowLeft" || e.key === "ArrowRight") {
              e.preventDefault();
              const next = clampDrawerWidth(width + (e.key === "ArrowRight" ? -48 : 48));
              setWidth(next);
              saveDrawerWidth(next);
            }
          }}
        />
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <p className="text-xs text-muted-foreground">{item.repositoryName}</p>
            <h2 className="mt-1 text-base font-semibold">
              <TitleLink item={item} />
            </h2>
            {positionLabel ? (
              <p aria-live="polite" className="mt-1 text-xs text-muted-foreground">
                {positionLabel}
              </p>
            ) : null}
          </div>
          <div className="flex shrink-0 items-start gap-1">
            <button
              type="button"
              aria-label="Previous thread"
              title="Previous thread (k / [)"
              onClick={onPrev}
              disabled={!hasPrev || !onPrev}
              className="cursor-pointer rounded-md p-2 transition-colors duration-150 hover:bg-accent hover:text-accent-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-default disabled:opacity-40 disabled:hover:bg-transparent disabled:hover:text-current"
            >
              <ChevronUp className="h-4 w-4" aria-hidden />
            </button>
            <button
              type="button"
              aria-label="Next thread"
              title="Next thread (j / ])"
              onClick={onNext}
              disabled={!hasNext || !onNext}
              className="cursor-pointer rounded-md p-2 transition-colors duration-150 hover:bg-accent hover:text-accent-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-default disabled:opacity-40 disabled:hover:bg-transparent disabled:hover:text-current"
            >
              <ChevronDown className="h-4 w-4" aria-hidden />
            </button>
            <button
              type="button"
              autoFocus
              aria-label="Close details"
              title="Close details (Esc)"
              onClick={onClose}
              className="cursor-pointer rounded-md p-2 transition-colors duration-150 hover:bg-accent hover:text-accent-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <X className="h-4 w-4" aria-hidden />
            </button>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {(() => {
            const liveMerged = content?.merged === true;
            const liveClosed = content?.state === "closed" && content?.merged !== true;
            const showMerged = merged || liveMerged;
            const showClosed = !showMerged && (closed || liveClosed);
            return (
              <Badge variant={showMerged ? "merged" : showClosed ? "secondary" : reasonTone(item)}>
                {showMerged ? "merged" : showClosed ? "closed" : item.reason.replace("_", " ")}
              </Badge>
            );
          })()}
          {content?.draft === true ? <Badge variant="secondary">draft</Badge> : null}
          {content?.checks ? (
            <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <span
                aria-hidden="true"
                className={
                  content.checks.state === "success"
                    ? "h-2 w-2 rounded-full bg-primary"
                    : content.checks.state === "failure" || content.checks.state === "error"
                      ? "h-2 w-2 rounded-full bg-destructive"
                      : "h-2 w-2 rounded-full bg-muted"
                }
              />
              {content.checks.total === 0
                ? "No checks reported"
                : `${content.checks.passing}/${content.checks.total} checks passing`}
            </span>
          ) : null}
          <span className="text-xs text-muted-foreground">
            {item.isRead === 0 ? "unread" : "read"} ·{" "}
            {new Date(item.createdAt).toLocaleString()}
          </span>
        </div>
        <div className="flex flex-col gap-2">
          <h3 className="text-xs font-medium text-muted-foreground">Triage</h3>
          <div className="flex flex-wrap gap-2">
            <Button size="sm" onClick={() => onAction(item, "done")}>
              Done
            </Button>
            <Button
              size="sm"
              variant="ghost"
              onClick={() => onAction(item, item.isRead === 0 ? "read" : "unread")}
            >
              {item.isRead === 0 ? "Mark as read" : "Mark as unread"}
            </Button>
            <Button size="sm" variant="secondary" onClick={() => onAction(item, "unsubscribe")}>
              Unsubscribe
            </Button>
          </div>
        </div>
        <div className="flex min-w-0 flex-col gap-2 border-t border-border pt-4">
          {contentState === "loading" ? (
            <p role="status" className="text-sm text-muted-foreground">
              Loading thread…
            </p>
          ) : null}
          {contentState === "ready" && alert ? (
            <SecurityAlertPreview alert={alert} repositoryUrl={repositoryUrl} />
          ) : null}
          {contentState === "unavailable" ||
          (contentState === "ready" && !content && !alert) ? (
            runs.length > 0 ? (
              <>
                <div className="flex w-full flex-col gap-1 text-left">
                  {pinned ? (
                    <>
                      <p className="text-xs font-medium text-muted-foreground">
                        This notification
                      </p>
                      <a
                        key={pinned.htmlUrl}
                        href={pinned.htmlUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-sm ring-1 ring-border transition-colors duration-150 hover:bg-accent hover:text-accent-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                      >
                        <span aria-hidden="true" className={runDotClass(pinned.conclusion)} />
                        <span className="min-w-0 flex-1 truncate" title={pinned.name}>
                          {pinned.name}
                          {pinned.branch ? ` · ${pinned.branch}` : ""}
                        </span>
                        <span className="shrink-0 text-xs text-muted-foreground">
                          {formatRunAge(pinned.createdAt)}
                        </span>
                        <ExternalLink className="h-3.5 w-3.5 shrink-0" aria-hidden />
                      </a>
                    </>
                  ) : workflowName ? (
                    <p className="px-2 text-xs text-muted-foreground">
                      The run that triggered this is older than the latest 20 on
                      this branch.
                    </p>
                  ) : null}
                  <p className="mt-1 text-xs font-medium text-muted-foreground">
                    Latest{latestBranch ? ` on ${latestBranch}` : ""}
                  </p>
                  {fixedSince ? (
                    <p className="px-2 text-xs text-muted-foreground">
                      Fixed since this failure. Latest runs are green.
                    </p>
                  ) : null}
                  {latest.map((run) => (
                    <a
                      key={run.htmlUrl}
                      href={run.htmlUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-sm transition-colors duration-150 hover:bg-accent hover:text-accent-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    >
                      <span aria-hidden="true" className={runDotClass(run.conclusion)} />
                      <span className="min-w-0 flex-1 truncate" title={run.name}>
                        {run.name}
                        {run.branch ? ` · ${run.branch}` : ""}
                      </span>
                      <span className="shrink-0 text-xs text-muted-foreground">
                        {formatRunAge(run.createdAt)}
                      </span>
                      <ExternalLink className="h-3.5 w-3.5 shrink-0" aria-hidden />
                    </a>
                  ))}
                </div>
                <a
                  href={item.sourceUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  onClick={() => saveLastOpened(item.id)}
                  className="inline-flex cursor-pointer items-center gap-2 text-sm text-muted-foreground transition-colors duration-150 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  <ExternalLink className="h-4 w-4" aria-hidden />
                  Open in new window
                </a>
              </>
            ) : (
              <div className="flex flex-col items-center gap-2 rounded-lg bg-muted/40 px-6 py-10 text-center">
                <EyeOff className="h-8 w-8 text-muted-foreground" aria-hidden />
                <p className="font-semibold">
                  No preview for {previewFallbackKind(item.subjectType)}
                </p>
                <p className="max-w-sm text-sm text-muted-foreground">
                  The preview drawer renders issues, pull requests, and security alerts. For
                  everything else, continue on GitHub.
                </p>
                <a
                  href={item.sourceUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  onClick={() => saveLastOpened(item.id)}
                  className="mt-2 inline-flex cursor-pointer items-center gap-2 rounded-md bg-secondary px-4 py-2 text-sm text-secondary-foreground transition-colors duration-150 hover:bg-secondary/80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  <ExternalLink className="h-4 w-4" aria-hidden />
                  Open in new window
                </a>
              </div>
            )
          ) : null}
          {contentState === "ready" && content ? (
            <>
              <p className="text-xs text-muted-foreground">
                {content.authorLogin ? `${content.authorLogin} · ` : ""}
                {content.state ?? ""}
              </p>
              {content.body ? (
                <Markdown text={content.body} repositoryUrl={repositoryUrl} />
              ) : (
                <p className="text-sm text-muted-foreground">No description.</p>
              )}              {content.comments.length > 0 ? (
                <div className="flex flex-col gap-3 border-t border-border pt-4">
                  <p className="text-xs font-medium text-muted-foreground">
                    {content.comments.length}{" "}
                    {content.comments.length === 1 ? "comment" : "comments"}
                  </p>
                  {content.comments.map((c, idx) => (
                    <div key={`${c.createdAt}-${idx}`} className="flex flex-col gap-1">
                      <p className="text-xs text-muted-foreground">
                        {c.authorLogin} · {new Date(c.createdAt).toLocaleString()}
                      </p>
                      <Markdown text={c.body} repositoryUrl={repositoryUrl} />
                    </div>
                  ))}
                </div>
              ) : null}
            </>
          ) : null}
        </div>
      </aside>
    </div>
  );
}
