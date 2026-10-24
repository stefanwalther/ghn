"use client";

import { ExternalLink } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Kbd } from "@/components/ui/kbd";
import { SyncSpinner } from "@/components/ui/sync-spinner";
import { QUICK_SELECTS, isClosedItem, isMergedItem } from "@/lib/filters";
import { cn } from "@/lib/utils";
import { saveLastOpened } from "@/lib/view-state";
import { ItemMenu, type ItemMenuAction } from "@/components/inbox/item-menu";

export interface InboxItem {
  id: string;
  repositoryId: string;
  repositoryName: string;
  subject: string;
  subjectType?: string | null;
  subjectState?: string | null;
  reason: string;
  prMerged?: boolean | null;
  createdAt: number;
  isRead: number;
  isDone: number;
  localUnread?: boolean;
  sourceUrl: string;
  due: boolean;
  dueLabel: string | null;
}

const FAILURE_REASONS = new Set(["action_failed", "ci_failed"]);

export function reasonTone(reason: string): "destructive" | "merged" | "muted";
export function reasonTone(item: {
  reason: string;
  prMerged?: boolean | null;
  subjectState?: string | null;
}): "destructive" | "merged" | "secondary" | "muted";
export function reasonTone(
  reasonOrItem: string | { reason: string; prMerged?: boolean | null; subjectState?: string | null }
): "destructive" | "merged" | "secondary" | "muted" {
  const reason = typeof reasonOrItem === "string" ? reasonOrItem : reasonOrItem.reason;
  if (FAILURE_REASONS.has(reason)) return "destructive";
  if (reason === "merged") return "merged";
  if (typeof reasonOrItem !== "string") {
    if (isMergedItem({ reason, prMerged: reasonOrItem.prMerged ?? false })) return "merged";
    if (isClosedItem({ reason, prMerged: reasonOrItem.prMerged ?? false, subjectState: reasonOrItem.subjectState ?? null }))
      return "secondary";
  }
  return "muted";
}

function reasonDot(reason: string): string {
  if (FAILURE_REASONS.has(reason)) return "bg-destructive";
  if (reason === "merged") return "bg-merged";
  return "bg-primary";
}

function ageLabel(createdAt: number): string {
  const mins = Math.max(1, Math.round((Date.now() - createdAt) / 60000));
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.round(hours / 24)}d ago`;
}

export function ListToolbar({
  items,
  selected,
  showHints,
  onToggleAll,
  onQuickSelect,
}: {
  items: InboxItem[];
  selected: Set<string>;
  showHints: boolean;
  onToggleAll: () => void;
  onQuickSelect: (reason: string) => void;
}) {
  const allSelected = items.length > 0 && items.every((i) => selected.has(i.id));
  const someSelected = !allSelected && items.some((i) => selected.has(i.id));
  return (
    <div className="flex flex-wrap items-center gap-3 border-b border-border/40 px-4 py-2">
      <Checkbox
        checked={allSelected}
        indeterminate={someSelected}
        onChange={onToggleAll}
        aria-label="Select all visible"
      />
      <span className="text-xs text-muted-foreground">
        {items.length} {items.length === 1 ? "item" : "items"}
      </span>
      <span className="ml-auto flex items-center gap-1">
        {showHints ? (
          <span className="mr-1 flex items-center gap-1 text-xs text-muted-foreground">
            <Kbd>j</Kbd>/<Kbd>k</Kbd> move <Kbd>x</Kbd> select <Kbd>a</Kbd> all
          </span>
        ) : null}
        <span className="text-xs text-muted-foreground">Quick select:</span>
        {QUICK_SELECTS.map((q) => (
          <Button
            key={q.value}
            variant="ghost"
            size="sm"
            onClick={() => onQuickSelect(q.value)}
            className="px-2 text-xs text-muted-foreground"
          >
            {q.label}
          </Button>
        ))}
      </span>
    </div>
  );
}

export function NotificationList({
  items,
  selected,
  focusedId,
  showHints,
  syncingIds,
  onToggle,
  onToggleAll,
  onQuickSelect,
  onMenuAction,
  onOpen,
  hideToolbar,
}: {
  items: InboxItem[];
  selected: Set<string>;
  focusedId?: string;
  showHints: boolean;
  syncingIds?: Set<string>;
  onToggle: (id: string) => void;
  onToggleAll: () => void;
  onQuickSelect: (reason: string) => void;
  onMenuAction: (item: InboxItem, action: ItemMenuAction) => void;
  onOpen: (item: InboxItem) => void;
  hideToolbar?: boolean;
}) {
  return (
    <div className="overflow-hidden rounded-lg bg-card shadow-sm">
      {hideToolbar ? null : (
        <ListToolbar
          items={items}
          selected={selected}
          showHints={showHints}
          onToggleAll={onToggleAll}
          onQuickSelect={onQuickSelect}
        />
      )}
      <ul className="divide-y divide-border/40" role="listbox" aria-label="Notifications">
        {items.map((item) => {
          const checked = selected.has(item.id);
          const syncing = syncingIds?.has(item.id) ?? false;
          const merged = isMergedItem({ reason: item.reason, prMerged: item.prMerged ?? false });
          const closed = isClosedItem({
            reason: item.reason,
            prMerged: item.prMerged ?? false,
            subjectState: item.subjectState ?? null,
          });
          const tone = merged ? "merged" : closed ? "secondary" : reasonTone(item.reason);
          return (
            <li
              key={item.id}
              id={`notification-${item.id}`}
              role="option"
              aria-selected={checked}
              aria-busy={syncing || undefined}
              className={cn(
                "flex cursor-pointer scroll-mt-48 items-start gap-3 px-4 py-3 transition-colors duration-150 hover:bg-accent hover:text-accent-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                item.isRead === 0 && "bg-accent/30",
                focusedId === item.id && "ring-2 ring-inset ring-ring"
              )}
              onClick={() => onOpen(item)}
              onKeyDown={(e) => {
                if ((e.target as HTMLElement).tagName === "INPUT") return;
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  onOpen(item);
                }
              }}
              tabIndex={0}
            >
              <span
                onClick={(e) => {
                  e.stopPropagation();
                }}
                title={`Select ${item.subject}`}
                className="flex items-start gap-3 self-stretch py-0.5 pr-3"
              >
                <Checkbox
                  checked={checked}
                  onChange={() => onToggle(item.id)}
                  onClick={(e) => e.stopPropagation()}
                  aria-label={`Select ${item.subject}`}
                />
                <span
                  aria-hidden="true"
                  onClick={(e) => {
                    e.stopPropagation();
                    onToggle(item.id);
                  }}
                  className={cn(
                    "mt-2 h-2 w-2 shrink-0 cursor-pointer rounded-full",
                    item.isRead === 0 ? (merged ? "bg-merged" : reasonDot(item.reason)) : "bg-transparent"
                  )}
                />
              </span>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="sr-only">{item.isRead === 0 ? "unread" : "read"}</span>
                  <span className="text-xs text-muted-foreground">{item.repositoryName}</span>
                  {item.subjectType === "PullRequest" ? (
                    <Badge variant="outline">PR</Badge>
                  ) : null}
                  <Badge variant={tone}>
                    {merged ? "merged" : closed ? "closed" : item.reason.replace("_", " ")}
                  </Badge>
                  {item.dueLabel ? <Badge variant="accent">{item.dueLabel}</Badge> : null}
                  {item.localUnread ? (
                    <span
                      className="text-xs text-muted-foreground"
                      title="Unread is local only; GitHub has no mark-unread endpoint"
                    >
                      local only
                    </span>
                  ) : null}
                  <span className="font-mono text-xs text-muted-foreground">
                    {ageLabel(item.createdAt)}
                  </span>
                </div>
                <p className="mt-1 truncate text-sm font-medium">{item.subject}</p>
              </div>
              <div className="flex shrink-0 items-start" onClick={(e) => e.stopPropagation()}>
                {syncing ? (
                  <span
                    role="status"
                    aria-label={`Syncing ${item.subject}`}
                    title={`Syncing ${item.subject}`}
                    className="p-2 text-muted-foreground"
                  >
                    <SyncSpinner />
                    <span className="sr-only">Syncing…</span>
                  </span>
                ) : null}
                <ItemMenu item={item} syncing={syncing} onAction={onMenuAction} />
                <a
                  href={item.sourceUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  aria-label={`Open source for ${item.subject}`}
                  onClick={(e) => {
                    e.stopPropagation();
                    saveLastOpened(item.id);
                  }}
                  className="cursor-pointer rounded-md p-2 transition-colors duration-150 hover:bg-accent hover:text-accent-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  <ExternalLink className="h-4 w-4" aria-hidden />
                </a>
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
