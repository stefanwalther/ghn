import { Inbox } from "lucide-react";
import { Button } from "@/components/ui/button";

export function EmptyInbox({ state = "unread" }: { state?: "unread" | "all" | "done" }) {
  const heading =
    state === "done"
      ? "Nothing finished yet"
      : state === "all"
        ? "Nothing here"
        : "All caught up";
  const copy =
    state === "done"
      ? "Triage from the unread inbox and finished items land here."
      : state === "all"
        ? "No notifications match. New ones appear here as they arrive."
        : "No unread items. Either everything is peaceful, or the upstream is suspiciously quiet. New digests appear here when due.";
  return (
    <div className="rounded-lg bg-card p-10 text-center shadow-sm">
      <Inbox className="mx-auto h-8 w-8 text-muted-foreground" aria-hidden />
      <h2 className="mt-3 font-semibold">{heading}</h2>
      <p className="mx-auto mt-1 max-w-sm text-sm text-muted-foreground">
        {copy}
      </p>
    </div>
  );
}

/** Shown instead of {@link EmptyInbox} when the main flow is empty but quiet
 * digests are still pending. Explains where the items are and, for a single
 * filtered repo, offers the one-click way to bring them back early. */
export function QuietEmptyState({
  total,
  repoName,
  pendingCount,
  isSnoozed,
  snoozeLabel,
  rhythm,
  nextDueLabel,
  onUnsnooze,
  onPromote,
  busy,
}: {
  total: number;
  repoName?: string;
  pendingCount?: number;
  isSnoozed?: boolean;
  snoozeLabel?: string | null;
  rhythm?: string | null;
  nextDueLabel?: string | null;
  onUnsnooze?: () => void;
  onPromote?: () => void;
  busy?: boolean;
}) {
  const heading =
    repoName != null ? `${pendingCount ?? 0} pending in ${repoName}` : "Main flow is clear";
  const copy =
    repoName != null
      ? isSnoozed
        ? `Snoozed${snoozeLabel ? ` until ${snoozeLabel}` : ""}. Items stay hidden until then.`
        : `New items stay here until the ${rhythm ?? "digest"} digest is due${nextDueLabel ? ` (${nextDueLabel})` : ""}.`
      : `${total} pending in Quiet until due. They appear here automatically when each digest is due.`;
  return (
    <div className="rounded-lg bg-card p-10 text-center shadow-sm">
      <Inbox className="mx-auto h-8 w-8 text-muted-foreground" aria-hidden />
      <h2 className="mt-3 font-semibold">{heading}</h2>
      <p className="mx-auto mt-1 max-w-sm text-sm text-muted-foreground">{copy}</p>
      {repoName != null && isSnoozed && onUnsnooze ? (
        <Button variant="secondary" size="sm" onClick={onUnsnooze} disabled={busy} className="mt-4">
          Unsnooze
        </Button>
      ) : null}
      {repoName != null && !isSnoozed && onPromote ? (
        <Button variant="secondary" size="sm" onClick={onPromote} disabled={busy} className="mt-4">
          Switch to immediate
        </Button>
      ) : null}
    </div>
  );
}

export function LoadingInbox() {
  return (
    <div className="flex flex-col gap-2" role="status" aria-label="Loading inbox">
      {[0, 1, 2, 3, 4].map((i) => (
        <div
          key={i}
          aria-hidden
          className="flex items-start gap-3 rounded-lg bg-card px-4 py-3 shadow-sm"
        >
          <div className="mt-1 h-4 w-4 shrink-0 animate-pulse rounded bg-muted" />
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <div className="h-3 w-24 animate-pulse rounded bg-muted" />
              <div className="h-5 w-16 animate-pulse rounded-full bg-muted" />
            </div>
            <div className="mt-2 h-4 w-3/4 animate-pulse rounded bg-muted" />
          </div>
        </div>
      ))}
      <p className="sr-only">Loading inbox…</p>
    </div>
  );
}

export function LoadingThread() {
  return (
    <div className="flex min-w-0 flex-col gap-3" role="status" aria-label="Loading thread">
      <div className="h-3 w-40 animate-pulse rounded bg-muted" aria-hidden />
      <div className="h-4 w-full animate-pulse rounded bg-muted" aria-hidden />
      <div className="h-4 w-5/6 animate-pulse rounded bg-muted" aria-hidden />
      <div className="h-4 w-2/3 animate-pulse rounded bg-muted" aria-hidden />
      <div className="mt-2 flex flex-col gap-2 border-t border-border pt-4" aria-hidden>
        <div className="h-3 w-24 animate-pulse rounded bg-muted" />
        <div className="h-16 w-full animate-pulse rounded-md bg-muted" />
      </div>
      <p className="sr-only">Loading thread…</p>
    </div>
  );
}

export function LoadingRepositories() {
  return (
    <div className="flex flex-col gap-4" role="status" aria-label="Loading repositories">
      <div className="flex flex-wrap items-center gap-2" aria-hidden>
        <div className="h-9 min-w-0 flex-1 animate-pulse rounded-md bg-muted" />
        <div className="h-4 w-16 animate-pulse rounded bg-muted" />
      </div>
      {[0, 1, 2].map((i) => (
        <div
          key={i}
          aria-hidden
          className="flex flex-wrap items-center gap-3 rounded-lg bg-card px-4 py-3 shadow-sm"
        >
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <div className="h-4 w-40 animate-pulse rounded bg-muted" />
              <div className="h-5 w-16 animate-pulse rounded-full bg-muted" />
              <div className="h-5 w-20 animate-pulse rounded-full bg-muted" />
            </div>
            <div className="mt-2 h-3 w-3/4 animate-pulse rounded bg-muted" />
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <div className="h-9 w-32 animate-pulse rounded-md bg-muted" />
            <div className="h-9 w-32 animate-pulse rounded-md bg-muted" />
          </div>
        </div>
      ))}
      <p className="sr-only">Loading repositories…</p>
    </div>
  );
}

export function LoadingRateLimits() {
  return (
    <div className="flex flex-col gap-4" role="status" aria-label="Loading rate limits">
      <div className="grid gap-4 md:grid-cols-3" aria-hidden>
        {[0, 1, 2].map((i) => (
          <div key={i} className="rounded-lg border border-border bg-card p-4 shadow-sm">
            <div className="h-4 w-24 animate-pulse rounded bg-muted" />
            <div className="mt-2 h-3 w-32 animate-pulse rounded bg-muted" />
            <div className="mt-4 h-2 animate-pulse rounded-full bg-muted" />
            <div className="mt-2 h-3 w-20 animate-pulse rounded bg-muted" />
          </div>
        ))}
      </div>
      <p className="sr-only">Loading rate limits…</p>
    </div>
  );
}

export function LoadingSettings() {
  return (
    <div className="flex flex-col gap-4" role="status" aria-label="Loading settings">
      {[0, 1, 2].map((i) => (
        <div
          key={i}
          aria-hidden
          className="rounded-lg bg-card p-4 shadow-sm"
        >
          <div className="h-4 w-32 animate-pulse rounded bg-muted" />
          <div className="mt-2 h-3 w-48 animate-pulse rounded bg-muted" />
          <div className="mt-4 h-4 w-full animate-pulse rounded bg-muted" />
        </div>
      ))}
      <p className="sr-only">Loading settings…</p>
    </div>
  );
}

export function ErrorRateLimits({ onRetry, detail }: { onRetry: () => void; detail?: string | null }) {
  return (
    <div className="rounded-lg bg-card p-10 text-center shadow-sm" role="alert">
      <h2 className="font-semibold">Rate limits failed to load</h2>
      <p className="mx-auto mt-1 max-w-sm text-sm text-muted-foreground">
        Could not fetch the current GitHub API quota. Retry to fetch again.
      </p>
      {detail ? (
        <p className="mx-auto mt-2 max-w-sm font-mono text-xs text-destructive">
          {detail}
        </p>
      ) : null}
      <Button variant="outline" onClick={onRetry} className="mt-4">
        Retry
      </Button>
    </div>
  );
}

export function ErrorRepositories({ onRetry }: { onRetry: () => void }) {
  return (
    <div className="rounded-lg bg-card p-10 text-center shadow-sm" role="alert">
      <h2 className="font-semibold">Repositories failed to load</h2>
      <p className="mx-auto mt-1 max-w-sm text-sm text-muted-foreground">
        Could not fetch the repository list. Retry to fetch again.
      </p>
      <Button variant="outline" onClick={onRetry} className="mt-4">
        Retry
      </Button>
    </div>
  );
}

export function ErrorInbox({ onRetry }: { onRetry: () => void }) {
  return (
    <div className="rounded-lg bg-card p-10 text-center shadow-sm" role="alert">
      <h2 className="font-semibold">Inbox failed to load</h2>
      <p className="mx-auto mt-1 max-w-sm text-sm text-muted-foreground">
        Cached items stay readable where possible. Retry to fetch again.
      </p>
      <Button variant="outline" onClick={onRetry} className="mt-4">
        Retry
      </Button>
    </div>
  );
}
