"use client";

import { Button } from "@/components/ui/button";
import { Kbd } from "@/components/ui/kbd";

export type BulkAction = "done" | "unsubscribe" | "read" | "unread";

export function BulkBar({
  selectedCount,
  onAction,
  onClear,
  busy,
  showHints,
}: {
  selectedCount: number;
  onAction: (action: BulkAction) => void;
  onClear: () => void;
  busy: boolean;
  showHints: boolean;
}) {
  if (selectedCount === 0) {
    return (
      <div className="flex min-h-[56px] flex-wrap items-center gap-2 rounded-lg bg-card p-3 shadow-sm">
        <span className="text-xs text-muted-foreground">
          Select items to triage them in bulk
        </span>
      </div>
    );
  }
  return (
    <div className="flex min-h-[56px] flex-wrap items-center gap-2 rounded-lg bg-card p-3 shadow-sm">
      <span className="text-sm text-muted-foreground">{selectedCount} selected</span>
      <Button onClick={() => onAction("done")} disabled={busy} size="sm">
        {showHints ? <Kbd>E</Kbd> : null} Done
      </Button>
      <Button
        onClick={() => onAction("unsubscribe")}
        disabled={busy}
        size="sm"
        variant="secondary"
        title="Mark done and mute this thread so it stays gone"
      >
        {showHints ? <Kbd>⇧U</Kbd> : null} Unsubscribe
      </Button>
      <Button
        onClick={() => onAction("read")}
        disabled={busy}
        size="sm"
        variant="ghost"
      >
        {showHints ? <Kbd>R</Kbd> : null} Mark as read
      </Button>
      <Button
        onClick={() => onAction("unread")}
        disabled={busy}
        size="sm"
        variant="ghost"
      >
        {showHints ? <Kbd>U</Kbd> : null} Mark as unread
      </Button>
      <Button onClick={onClear} disabled={busy} size="sm" variant="ghost">
        {showHints ? <Kbd>Esc</Kbd> : null} Clear
      </Button>
    </div>
  );
}
