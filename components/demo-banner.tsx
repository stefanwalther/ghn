"use client";

import * as React from "react";

export function DemoBanner() {
  const [demo, setDemo] = React.useState(false);

  React.useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/connection", { cache: "no-store" });
        const data = await res.json().catch(() => null);
        if (!cancelled && data && data.lastSyncAt == null) {
          setDemo(true);
        }
      } catch {
        // Best-effort; a failed probe must not add banner noise.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  if (!demo) return null;
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
