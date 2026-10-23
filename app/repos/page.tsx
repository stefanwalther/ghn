"use client";

import * as React from "react";
import { ErrorInbox, LoadingRepositories } from "@/components/inbox/empty-states";
import { RepoRow } from "@/components/repos/repo-row";
import { useRepositories, useUpdateRepository } from "@/lib/queries";

export default function ReposPage() {
  const reposQuery = useRepositories();
  const updateRepo = useUpdateRepository();
  const [notice, setNotice] = React.useState<string | null>(null);
  const [query, setQuery] = React.useState("");

  const repos = React.useMemo(
    () => reposQuery.data?.repositories ?? [],
    [reposQuery.data]
  );
  const status = reposQuery.isPending
    ? "loading"
    : reposQuery.isError && !reposQuery.data
      ? "error"
      : "ready";
  const busy = updateRepo.isPending;

  const visible = React.useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return repos;
    return repos.filter((r) => r.fullName.toLowerCase().includes(q));
  }, [repos, query]);

  async function setRhythm(id: string, rhythm: string) {
    setNotice(null);
    try {
      await updateRepo.mutateAsync({ id, patch: { rhythm } });
    } catch {
      setNotice("Rhythm update failed. Previous setting restored.");
    }
  }

  async function setSnooze(id: string, snoozedUntil: number | null) {
    setNotice(null);
    try {
      await updateRepo.mutateAsync({ id, patch: { snoozedUntil } });
    } catch {
      setNotice("Snooze update failed. Previous setting restored.");
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
      {status === "loading" ? <LoadingRepositories /> : null}
      {status === "error" ? <ErrorInbox onRetry={() => void reposQuery.refetch()} /> : null}
      {notice ? (
        <p role="alert" className="text-xs text-destructive">
          {notice}
        </p>
      ) : null}
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
