import { Inbox } from "lucide-react";

export function EmptyInbox() {
  return (
    <div className="rounded-lg bg-card p-10 text-center shadow-sm">
      <Inbox className="mx-auto h-8 w-8 text-muted-foreground" aria-hidden />
      <h2 className="mt-3 font-semibold">All caught up</h2>
      <p className="mx-auto mt-1 max-w-sm text-sm text-muted-foreground">
        No unread items. Either everything is peaceful, or the upstream is
        suspiciously quiet. New digests appear here when due.
      </p>
    </div>
  );
}

export function LoadingInbox() {
  return (
    <div className="rounded-lg bg-card p-10 text-center shadow-sm" role="status">
      <p className="text-sm text-muted-foreground">Loading inbox…</p>
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
      <p className="text-sm text-muted-foreground">Loading repositories…</p>
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
      <p className="text-sm text-muted-foreground">Loading rate limits…</p>
    </div>
  );
}

export function ErrorRateLimits({ onRetry }: { onRetry: () => void }) {
  return (
    <div className="rounded-lg bg-card p-10 text-center shadow-sm" role="alert">
      <h2 className="font-semibold">Rate limits failed to load</h2>
      <p className="mx-auto mt-1 max-w-sm text-sm text-muted-foreground">
        Could not fetch the current GitHub API quota. Retry to fetch again.
      </p>
      <button
        type="button"
        onClick={onRetry}
        className="mt-4 cursor-pointer rounded-md border border-input bg-background px-4 py-2 text-sm transition-colors duration-150 hover:bg-accent hover:text-accent-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        Retry
      </button>
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
      <button
        type="button"
        onClick={onRetry}
        className="mt-4 cursor-pointer rounded-md border border-input bg-background px-4 py-2 text-sm transition-colors duration-150 hover:bg-accent hover:text-accent-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        Retry
      </button>
    </div>
  );
}
