"use client";

import * as React from "react";
import { Button } from "@/components/ui/button";

export function BulkBar({
  selectedCount,
  onDone,
  onUnread,
  onClear,
  busy,
}: {
  selectedCount: number;
  onDone: () => void;
  onUnread: () => void;
  onClear: () => void;
  busy: boolean;
}) {
  if (selectedCount === 0) return null;
  return (
    <div className="flex flex-wrap items-center gap-2 rounded-lg bg-card p-3 shadow-sm">
      <span className="text-sm text-muted-foreground">{selectedCount} selected</span>
      <Button onClick={onDone} disabled={busy} size="sm">
        Mark done
      </Button>
      <Button onClick={onUnread} disabled={busy} size="sm" variant="secondary">
        Mark unread
      </Button>
      <Button onClick={onClear} disabled={busy} size="sm" variant="ghost">
        Clear
      </Button>
    </div>
  );
}
