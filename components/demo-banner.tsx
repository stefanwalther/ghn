"use client";

import { useConnection } from "@/lib/queries";

export function DemoBanner() {
  const { data } = useConnection();

  if (!data || data.lastSyncAt != null) return null;
  return (
    <div
      role="status"
      data-testid="demo-banner"
      className="border-b border-border bg-muted/50 px-4 py-1.5 text-xs text-muted-foreground"
    >
      <p className="w-full max-w-6xl text-left">
        Demo data shown. Sync to load live GitHub notifications.
      </p>
    </div>
  );
}
