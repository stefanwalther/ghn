"use client";

import * as React from "react";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

/**
 * Styled replacement for the native `title` attribute on icon buttons and
 * other hover targets. Renders the ShadCn/Radix tooltip with an optional
 * keyboard-shortcut chip, so hover hints match the app theme instead of the
 * OS-native yellow box.
 *
 * Keep `aria-label` on the trigger for screen readers; the tooltip itself is
 * visual only (aria-hidden via Radix).
 */
export function HintTooltip({
  label,
  shortcut,
  side = "bottom",
  children,
}: {
  label: string;
  shortcut?: string;
  side?: "top" | "bottom" | "left" | "right";
  children: React.ReactNode;
}) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>{children}</TooltipTrigger>
      <TooltipContent
        side={side}
        className={cn("flex items-center gap-1.5")}
      >
        <span>{label}</span>
        {shortcut ? (
          <kbd className="rounded border border-primary-foreground/30 bg-primary-foreground/15 px-1 py-px font-mono text-[10px] leading-4">
            {shortcut}
          </kbd>
        ) : null}
      </TooltipContent>
    </Tooltip>
  );
}
