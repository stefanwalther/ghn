"use client";

import { RefreshCw } from "lucide-react";
import { cn } from "@/lib/utils";

export function SyncSpinner({
  spinning = true,
  className,
}: {
  spinning?: boolean;
  className?: string;
}) {
  return (
    <RefreshCw
      className={cn(
        "h-4 w-4",
        spinning && "animate-spin motion-reduce:animate-none",
        className
      )}
      aria-hidden
    />
  );
}
