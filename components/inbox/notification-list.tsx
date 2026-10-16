"use client";

import { ExternalLink } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { cn } from "@/lib/utils";
import { saveLastOpened } from "@/lib/view-state";

export interface InboxItem {
  id: string;
  repositoryId: string;
  repositoryName: string;
  subject: string;
  reason: string;
  createdAt: number;
  isRead: number;
  isDone: number;
  sourceUrl: string;
  due: boolean;
  dueLabel: string | null;
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
  onToggle,
  onToggleAll,
}: {
  items: InboxItem[];
  selected: Set<string>;
  onToggle: (id: string) => void;
  onToggleAll: () => void;
}) {
  const allSelected = items.length > 0 && items.every((i) => selected.has(i.id));
  return (
    <div className="overflow-hidden rounded-lg bg-card shadow-sm">
      <div className="flex items-center gap-3 border-b border-border/40 px-4 py-2">
        <Checkbox
          checked={allSelected}
          onChange={onToggleAll}
          aria-label="Select all visible"
        />
        <span className="text-xs text-muted-foreground">
          {selected.size > 0 ? `${selected.size} selected` : `${items.length} items`}
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
                item.isRead === 0 && "bg-accent/30"
              )}
              onClick={() => onToggle(item.id)}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  onToggle(item.id);
                }
              }}
              tabIndex={0}
              role="checkbox"
              aria-checked={checked}
            >
              <span onClick={(e) => e.stopPropagation()} className="pt-0.5">
                <Checkbox
                  checked={checked}
                  onChange={() => onToggle(item.id)}
                  aria-label={`Select ${item.subject}`}
                />
              </span>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <Badge variant="muted">{item.repositoryName}</Badge>
                  <Badge variant={item.isRead === 0 ? "default" : "muted"}>
                    {item.reason.replace("_", " ")}
                  </Badge>
                  {item.dueLabel ? <Badge variant="accent">{item.dueLabel}</Badge> : null}
                  <span className="font-mono text-xs text-muted-foreground">
                    {ageLabel(item.createdAt)}
                  </span>
                </div>
                <p className="mt-1 truncate text-sm font-medium">{item.subject}</p>
              </div>
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
            </li>
          );
        })}
      </ul>
    </div>
  );
}
