"use client";

import * as React from "react";
import { cn } from "@/lib/utils";

export interface HelpTopic {
  id: string;
  label: string;
  blurb: string;
}

export function HelpSidebar({
  topics,
  activeTopic,
  onTopic,
}: {
  topics: HelpTopic[];
  activeTopic: string;
  onTopic: (id: string) => void;
}) {
  return (
    <ul className="flex flex-col gap-0.5" aria-label="Help topics">
      {topics.map((t) => {
        const active = t.id === activeTopic;
        return (
          <li key={t.id}>
            <button
              type="button"
              aria-label={`Help topic: ${t.label}`}
              aria-current={active ? "true" : undefined}
              onClick={() => onTopic(t.id)}
              className={cn(
                "flex w-full cursor-pointer flex-col gap-0.5 rounded-md px-3 py-2 text-left text-sm transition-colors duration-150 hover:bg-accent hover:text-accent-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                active && "bg-sidebar-accent text-sidebar-accent-foreground"
              )}
            >
              <span className="truncate font-medium">{t.label}</span>
              <span className="truncate text-xs text-muted-foreground">{t.blurb}</span>
            </button>
          </li>
        );
      })}
    </ul>
  );
}
