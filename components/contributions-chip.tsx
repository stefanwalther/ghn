"use client";

import * as React from "react";
import { Badge } from "@/components/ui/badge";

function localToday(): string {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function ContributionsChip() {
  const [count, setCount] = React.useState<number | null>(null);

  React.useEffect(() => {
    let cancelled = false;
    fetch(`/api/contributions?date=${localToday()}`, { cache: "no-store" })
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (!cancelled && data && typeof data.count === "number") {
          setCount(data.count);
        }
      })
      .catch(() => {
        // stay quiet when offline or unauthenticated
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <span
      title={
        count === null
          ? "GitHub contributions unavailable (offline or not signed in)"
          : "GitHub contributions today (UTC day; the profile tooltip can differ by one at day edges)"
      }
    >
      <Badge variant="muted">{count === null ? "– today" : `${count} today`}</Badge>
    </span>
  );
}
