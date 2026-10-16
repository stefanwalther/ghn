"use client";

import * as React from "react";
import { ErrorInbox, LoadingInbox } from "@/components/inbox/empty-states";
import { RepoRow, type RepoRowData } from "@/components/repos/repo-row";

export default function ReposPage() {
  const [repos, setRepos] = React.useState<RepoRowData[]>([]);
  const [status, setStatus] = React.useState<"loading" | "ready" | "error">("loading");
  const [busy, setBusy] = React.useState(false);
  const [query, setQuery] = React.useState("");

  const visible = React.useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return repos;
    return repos.filter((r) => r.fullName.toLowerCase().includes(q));
  }, [repos, query]);

  const load = React.useCallback(async () => {
    setStatus("loading");
    try {
      const res = await fetch("/api/repositories", { cache: "no-store" });
      if (!res.ok) throw new Error("load failed");
      const data = await res.json();
      setRepos(data.repositories ?? []);
      setStatus("ready");
    } catch {
      setStatus("error");
    }
  }, []);

  React.useEffect(() => {
    load();
  }, [load]);

  async function setRhythm(id: string, rhythm: string) {
    setBusy(true);
    try {
      const res = await fetch(`/api/repositories/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rhythm }),
      });
      if (!res.ok) throw new Error("patch failed");
      await load();
    } finally {
      setBusy(false);
    }
  }

  async function setSnooze(id: string, snoozedUntil: number | null) {
    setBusy(true);
    try {
      const res = await fetch(`/api/repositories/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ snoozedUntil }),
      });
      if (!res.ok) throw new Error("patch failed");
      await load();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mx-auto flex max-w-4xl flex-col gap-4">
      <div>
        <h1 className="text-xl font-semibold">Repositories</h1>
        <p className="text-sm text-muted-foreground">
          Watched repos stay quiet until the digest is due. Owned repos stay
          immediate by default.
        </p>
      </div>
      {status === "loading" ? <LoadingInbox /> : null}
      {status === "error" ? <ErrorInbox onRetry={load} /> : null}
      {status === "ready" ? (
        <div className="flex flex-wrap items-center gap-2">
          <label className="flex min-w-0 flex-1 items-center gap-2">
            <span className="sr-only">Filter repositories by name</span>
            <input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Escape") setQuery("");
              }}
              placeholder="Filter repositories…"
              aria-label="Filter repositories by name"
              className="h-9 min-w-0 flex-1 rounded-md border border-input bg-background px-3 text-sm transition-colors duration-150 hover:bg-accent hover:text-accent-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            />
          </label>
          <span className="text-xs text-muted-foreground" role="status">
            {visible.length} of {repos.length}
          </span>
          {query ? (
            <button
              type="button"
              onClick={() => setQuery("")}
              className="cursor-pointer rounded-md px-2 py-1 text-xs text-muted-foreground transition-colors duration-150 hover:bg-accent hover:text-accent-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              Clear
            </button>
          ) : null}
        </div>
      ) : null}
      {status === "ready" && visible.length === 0 ? (
        <div className="rounded-lg bg-card p-10 text-center shadow-sm" role="status">
          <p className="text-sm font-medium">No repositories match “{query.trim()}”.</p>
          <p className="mx-auto mt-1 max-w-sm text-sm text-muted-foreground">
            Try a shorter fragment of the owner or repository name.
          </p>
          <button
            type="button"
            onClick={() => setQuery("")}
            className="mt-4 cursor-pointer rounded-md border border-input bg-background px-4 py-2 text-sm transition-colors duration-150 hover:bg-accent hover:text-accent-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            Clear filter
          </button>
        </div>
      ) : null}
      {status === "ready"
        ? visible.map((repo) => (
      <RepoRow key={repo.id} repo={repo} onRhythm={setRhythm} onSnooze={setSnooze} busy={busy} />
          ))
        : null}
    </div>
  );
}
