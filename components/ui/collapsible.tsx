"use client";

import * as React from "react";
import { cn } from "@/lib/utils";

interface CollapsibleProps {
  title: React.ReactNode;
  meta?: React.ReactNode;
  defaultOpen?: boolean;
  className?: string;
  children: React.ReactNode;
}

export function Collapsible({
  title,
  meta,
  defaultOpen = false,
  className,
  children,
}: CollapsibleProps) {
  const [open, setOpen] = React.useState(defaultOpen);
  return (
    <div className={cn("rounded-lg bg-card shadow-sm", className)}>
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        className="flex w-full cursor-pointer items-center justify-between gap-2 rounded-lg px-4 py-3 text-left transition-colors duration-150 hover:bg-accent hover:text-accent-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <span className="flex items-center gap-2 text-sm font-medium">{title}</span>
        {meta}
      </button>
      {open ? <div className="px-4 pb-4">{children}</div> : null}
    </div>
  );
}
