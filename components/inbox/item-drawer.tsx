"use client";

import { ExternalLink, X } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { isMergedItem } from "@/lib/filters";
import { saveLastOpened } from "@/lib/view-state";
import { reasonTone, type InboxItem } from "@/components/inbox/notification-list";
import type { ItemMenuAction } from "@/components/inbox/item-menu";

export function ItemDrawer({
  item,
  onClose,
  onAction,
}: {
  item: InboxItem;
  onClose: () => void;
  onAction: (item: InboxItem, action: ItemMenuAction) => void;
}) {
  const merged = isMergedItem({ reason: item.reason, prMerged: item.prMerged ?? false });
  return (
    <div className="fixed inset-0 z-40" onClick={onClose}>
      <div className="absolute inset-0 bg-background/80" aria-hidden="true" />
      <aside
        role="dialog"
        aria-modal="true"
        aria-label="Item details"
        className="absolute inset-y-0 right-0 flex w-full max-w-md flex-col gap-4 overflow-y-auto border-l border-border bg-card p-6 shadow-md"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <p className="text-xs text-muted-foreground">{item.repositoryName}</p>
            <h2 className="mt-1 text-base font-semibold">{item.subject}</h2>
          </div>
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
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant={merged ? "merged" : reasonTone(item.reason)}>
            {merged ? "merged" : item.reason.replace("_", " ")}
          </Badge>
          <span className="text-xs text-muted-foreground">
            {item.isRead === 0 ? "unread" : "read"} ·{" "}
            {new Date(item.createdAt).toLocaleString()}
          </span>
        </div>
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
      </aside>
    </div>
  );
}
