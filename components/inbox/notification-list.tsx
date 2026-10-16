"use client";

import { ExternalLink } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Kbd } from "@/components/ui/kbd";
import { QUICK_SELECTS } from "@/lib/filters";
import { cn } from "@/lib/utils";
import { saveLastOpened } from "@/lib/view-state";
import { ItemMenu, type ItemMenuAction } from "@/components/inbox/item-menu";

export interface InboxItem {
  id: string;
  repositoryId: string;
  repositoryName: string;
  subject: string;
  subjectType?: string | null;
  reason: string;
  createdAt: number;
  isRead: number;
  isDone: number;
  localUnread?: boolean;
  sourceUrl: string;
  due: boolean;
  dueLabel: string | null;
}

const FAILURE_REASONS = new Set(["action_failed", "ci_failed"]);

function reasonTone(reason: string): "destructive" | "merged" | "muted" {
  if (FAILURE_REASONS.has(reason)) return "destructive";
  if (reason === "merged") return "merged";
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

export function NotificationList({
  items,
  selected,
  focusedId,
  showHints,
  onToggle,
  onToggleAll,
  onQuickSelect,
  onMenuAction,
}: {
  items: InboxItem[];
  selected: Set<string>;
  focusedId?: string;
  showHints: boolean;
  onToggle: (id: string) => void;
  onToggleAll: () => void;
  onQuickSelect: (reason: string) => void;
  onMenuAction: (item: InboxItem, action: ItemMenuAction) => void;
}) {
  const allSelected = items.length > 0 && items.every((i) => selected.has(i.id));
  return (
    <div className="overflow-hidden rounded-lg bg-card shadow-sm">
      <div className="flex flex-wrap items-center gap-3 border-b border-border/40 px-4 py-2">
        <Checkbox
          checked={allSelected}
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
            <button
              key={q.value}
              type="button"
              onClick={() => onQuickSelect(q.value)}
              className="cursor-pointer rounded-md px-2 py-1 text-xs text-muted-foreground transition-colors duration-150 hover:bg-accent hover:text-accent-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              {q.label}
            </button>
          ))}
        </span>
      </div>
      <ul className="divide-y divide-border/40">
        {items.map((item) => {
          const checked = selected.has(item.id);
          return (
            <li
              key={item.id}
              id={`notification-${item.id}`}
              className={cn(
                "flex cursor-pointer items-start gap-3 px-4 py-3 transition-colors duration-150 hover:bg-accent hover:text-accent-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                item.isRead === 0 && "bg-accent/30",
                focusedId === item.id && "ring-2 ring-inset ring-ring"
              )}
              onClick={() => onToggle(item.id)}
              onKeyDown={(e) => {
                if ((e.target as HTMLElement).tagName === "INPUT") return;
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  onToggle(item.id);
                }
              }}
              tabIndex={0}
            >
              <span onClick={(e) => e.stopPropagation()} className="pt-0.5">
                <Checkbox
                  checked={checked}
                  onChange={() => onToggle(item.id)}
                  aria-label={`Select ${item.subject}`}
                />
              </span>
              <span
                aria-hidden="true"
                className={cn(
                  "mt-2 h-2 w-2 shrink-0 rounded-full",
                  item.isRead === 0 ? reasonDot(item.reason) : "bg-transparent"
                )}
              />
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="sr-only">{item.isRead === 0 ? "unread" : "read"}</span>
                  <span className="text-xs text-muted-foreground">{item.repositoryName}</span>
                  <Badge variant={reasonTone(item.reason)}>
                    {item.reason.replace("_", " ")}
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
                <ItemMenu item={item} onAction={onMenuAction} />
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
