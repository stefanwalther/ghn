import * as React from "react";
import { Badge } from "@/components/ui/badge";

function localToday(): string {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function ContributionsChip() {
  const [count, setCount] = React.useState<number | null>(null);
  const [login, setLogin] = React.useState<string | null>(null);

  React.useEffect(() => {
    let cancelled = false;
    fetch(`/api/contributions?date=${localToday()}`, { cache: "no-store" })
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (cancelled || !data) return;
        if (typeof data.count === "number") setCount(data.count);
        if (typeof data.login === "string" && data.login) setLogin(data.login);
      })
      .catch(() => {
        // stay quiet when offline or unauthenticated
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const label = count === null ? "– today" : `${count} today`;
  if (!login) {
    return (
      <span
        title={
          count === null
            ? "GitHub contributions unavailable (offline or not signed in)"
            : "GitHub contributions today (UTC day; the profile heatmap buckets by local day and can differ by a few near midnight)"
        }
      >
      <Badge variant="muted">{label}</Badge>
      </span>
    );
  }
  return (
    <a
      href={`https://github.com/${login}`}
      target="_blank"
      rel="noopener noreferrer"
      aria-label={`Open ${login}'s GitHub profile with the full contribution graph in a new tab`}
      title={`Open ${login}'s GitHub profile with the full contribution graph`}
      className="cursor-pointer rounded-md transition-colors duration-150 hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      <Badge variant="muted" className="cursor-pointer">{label}</Badge>
    </a>
  );
}
