"use client";

import * as React from "react";
import { ErrorInbox, LoadingInbox } from "@/components/inbox/empty-states";
import { RepoRow, type RepoRowData } from "@/components/repos/repo-row";

export default function ReposPage() {
  const [repos, setRepos] = React.useState<RepoRowData[]>([]);
  const [status, setStatus] = React.useState<"loading" | "ready" | "error">("loading");
  const [busy, setBusy] = React.useState(false);

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
      {status === "ready"
        ? repos.map((repo) => (
            <RepoRow key={repo.id} repo={repo} onRhythm={setRhythm} busy={busy} />
          ))
        : null}
    </div>
  );
}
