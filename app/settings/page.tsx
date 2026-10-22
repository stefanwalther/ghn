"use client";

import * as React from "react";
import { Button } from "@/components/ui/button";
import { SyncSpinner } from "@/components/ui/sync-spinner";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

interface SettingsPayload {
  database: { configPath: string; databasePath: string };
  github: {
    connected: boolean;
    viewerLogin: string | null;
    reason: string | null;
    tokenPresent: boolean;
    tokenSource: string;
    ghCliAuthenticated: boolean;
    ghCliDetail: string | null;
  };
}

function StatusDot({ ok }: { ok: boolean }) {
  return (
    <span
      aria-hidden="true"
      className={`inline-block h-2.5 w-2.5 rounded-full ${ok ? "bg-emerald-500" : "bg-destructive"}`}
    />
  );
}

export default function SettingsPage() {
  const [data, setData] = React.useState<SettingsPayload | null>(null);
  const [status, setStatus] = React.useState<"loading" | "ready" | "error">("loading");
  const [error, setError] = React.useState<string | null>(null);
  const [refreshing, setRefreshing] = React.useState(false);

  const dataRef = React.useRef<SettingsPayload | null>(null);
  dataRef.current = data;

  const load = React.useCallback(async () => {
    const first = dataRef.current === null;
    if (first) setStatus("loading");
    else setRefreshing(true);
    try {
      const res = await fetch("/api/settings", { cache: "no-store" });
      const payload = (await res.json().catch(() => null)) as SettingsPayload | null;
      if (!res.ok || !payload?.database || !payload?.github) {
        throw new Error("Failed to load settings.");
      }
      setData(payload);
      setError(null);
      setStatus("ready");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load settings.");
      if (first) setStatus("error");
    } finally {
      setRefreshing(false);
    }
  }, []);

  React.useEffect(() => {
    void load();
  }, [load]);

  return (
    <div className="mx-auto flex max-w-4xl flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h1 className="text-xl font-semibold">Settings</h1>
          <p className="text-sm text-muted-foreground">
            Development check: where the database lives and whether GitHub auth works.
          </p>
        </div>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => void load()}
          disabled={refreshing || status === "loading"}
          title="Refresh settings status"
          aria-label="Refresh settings status"
        >
          <SyncSpinner spinning={refreshing} />
          Refresh
        </Button>
      </div>

      {status === "loading" ? (
        <p className="text-sm text-muted-foreground" role="status">
          Loading settings…
        </p>
      ) : null}
      {status === "error" ? (
        <div className="rounded-lg bg-card p-10 text-center shadow-sm">
          <p className="text-sm font-medium">Settings failed to load.</p>
          <p className="mx-auto mt-1 max-w-sm text-sm text-muted-foreground">
            {error ?? "Try again."}
          </p>
          <button
            type="button"
            onClick={() => void load()}
            className="mt-4 cursor-pointer rounded-md border border-input bg-background px-4 py-2 text-sm transition-colors duration-150 hover:bg-accent hover:text-accent-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            Retry
          </button>
        </div>
      ) : null}

      {status === "ready" && data ? (
        <>
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-sm">
                <StatusDot ok />
                Database
              </CardTitle>
              <CardDescription>Resolved from config file and env overrides.</CardDescription>
            </CardHeader>
            <CardContent>
              <dl className="grid gap-2 font-mono text-xs">
                <div className="flex flex-col gap-1 sm:flex-row sm:items-baseline sm:gap-3">
                  <dt className="w-32 shrink-0 font-sans font-medium text-muted-foreground">
                    Database path
                  </dt>
                  <dd className="break-all">{data.database.databasePath}</dd>
                </div>
                <div className="flex flex-col gap-1 sm:flex-row sm:items-baseline sm:gap-3">
                  <dt className="w-32 shrink-0 font-sans font-medium text-muted-foreground">
                    Config path
                  </dt>
                  <dd className="break-all">{data.database.configPath}</dd>
                </div>
              </dl>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-sm">
                <StatusDot ok={data.github.connected} />
                GitHub authentication
              </CardTitle>
              <CardDescription>
                Token from `GHN_TOKEN`, `GH_TOKEN`, `GITHUB_TOKEN`, or `gh auth login`, plus a
                `gh auth status` check.
              </CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col gap-2 text-sm">
              <p className="flex items-center gap-2">
                <span className="font-medium">
                  {data.github.connected ? "Connected" : "Not connected"}
                </span>
                {data.github.viewerLogin ? (
                  <span className="text-muted-foreground">as {data.github.viewerLogin}</span>
                ) : null}
                {data.github.reason && !data.github.connected ? (
                  <span className="font-mono text-xs text-muted-foreground">
                    ({data.github.reason})
                  </span>
                ) : null}
              </p>
              <dl className="grid gap-2 font-mono text-xs">
                <div className="flex flex-col gap-1 sm:flex-row sm:items-baseline sm:gap-3">
                  <dt className="w-32 shrink-0 font-sans font-medium text-muted-foreground">
                    Token present
                  </dt>
                  <dd>{data.github.tokenPresent ? "yes" : "no"}</dd>
                </div>
                <div className="flex flex-col gap-1 sm:flex-row sm:items-baseline sm:gap-3">
                  <dt className="w-32 shrink-0 font-sans font-medium text-muted-foreground">
                    Token source
                  </dt>
                  <dd>{data.github.tokenSource}</dd>
                </div>
                <div className="flex flex-col gap-1 sm:flex-row sm:items-baseline sm:gap-3">
                  <dt className="w-32 shrink-0 font-sans font-medium text-muted-foreground">
                    gh CLI
                  </dt>
                  <dd>{data.github.ghCliAuthenticated ? "authenticated" : "not authenticated"}</dd>
                </div>
              </dl>
              {data.github.ghCliDetail ? (
                <pre className="overflow-x-auto rounded-md bg-muted p-3 font-mono text-xs whitespace-pre-wrap text-muted-foreground">
                  {data.github.ghCliDetail}
                </pre>
              ) : null}
            </CardContent>
          </Card>
        </>
      ) : null}
    </div>
  );
}
