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
