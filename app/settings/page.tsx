"use client";

import * as React from "react";
import { Button } from "@/components/ui/button";
import { SyncSpinner } from "@/components/ui/sync-spinner";
import { ThemePicker } from "@/components/theme-picker";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { LoadingSettingsSection } from "@/components/inbox/empty-states";
import { formatDatabaseSize } from "@/lib/format-database-size";
import { useSettingsDatabase, useSettingsGithub } from "@/lib/queries";

function StatusDot({ ok }: { ok: boolean }) {
  return (
    <span
      aria-hidden="true"
      className={`inline-block h-2.5 w-2.5 rounded-full ${ok ? "bg-emerald-500" : "bg-destructive"}`}
    />
  );
}

function SectionError({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <div className="rounded-lg bg-card p-6 text-center shadow-sm" role="alert">
      <p className="text-sm font-medium">Failed to load.</p>
      <p className="mx-auto mt-1 max-w-sm text-sm text-muted-foreground">{message}</p>
      <Button variant="outline" size="sm" onClick={onRetry} className="mt-4">
        Retry
      </Button>
    </div>
  );
}

export default function SettingsPage() {
  const databaseQuery = useSettingsDatabase();
  const githubQuery = useSettingsGithub();
  const refreshing = databaseQuery.isFetching || githubQuery.isFetching;
  const initialLoading = databaseQuery.isPending && githubQuery.isPending;

  const handleRefresh = React.useCallback(() => {
    void databaseQuery.refetch();
    void githubQuery.refetch();
  }, [databaseQuery, githubQuery]);

  return (
    <div className="flex w-full max-w-6xl flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h1 className="text-xl font-semibold">Settings</h1>
          <p className="text-sm text-muted-foreground">
            Appearance, database location, and GitHub auth status.
          </p>
        </div>
        <Button
          variant="ghost"
          size="sm"
          onClick={handleRefresh}
          disabled={refreshing || initialLoading}
          aria-label="Refresh settings status"
        >
          <SyncSpinner spinning={refreshing && !initialLoading} />
          Refresh
        </Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-sm">
            Appearance
          </CardTitle>
          <CardDescription>
            Color theme, stored in this browser. Light and dark mode stays
            on the theme button in the header.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <ThemePicker />
        </CardContent>
      </Card>

      {databaseQuery.isPending ? (
        <LoadingSettingsSection label="Loading database settings…" />
      ) : databaseQuery.isError || !databaseQuery.data?.database ? (
        <SectionError
          message="Could not load database settings."
          onRetry={() => void databaseQuery.refetch()}
        />
      ) : (
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
                <dd className="break-all">{databaseQuery.data.database.databasePath}</dd>
              </div>
              <div className="flex flex-col gap-1 sm:flex-row sm:items-baseline sm:gap-3">
                <dt className="w-32 shrink-0 font-sans font-medium text-muted-foreground">
                  Config path
                </dt>
                <dd className="break-all">{databaseQuery.data.database.configPath}</dd>
              </div>
              <div className="flex flex-col gap-1 sm:flex-row sm:items-baseline sm:gap-3">
                <dt className="w-32 shrink-0 font-sans font-medium text-muted-foreground">
                  Database size
                </dt>
                <dd className="break-all">{formatDatabaseSize(databaseQuery.data.database.sizeBytes)}</dd>
              </div>
            </dl>
          </CardContent>
        </Card>
      )}

      {githubQuery.isPending ? (
        <LoadingSettingsSection label="Loading GitHub authentication…" />
      ) : githubQuery.isError || !githubQuery.data?.github ? (
        <SectionError
          message="Could not load GitHub authentication status."
          onRetry={() => void githubQuery.refetch()}
        />
      ) : (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-sm">
              <StatusDot ok={githubQuery.data.github.connected} />
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
                {githubQuery.data.github.connected ? "Connected" : "Not connected"}
              </span>
              {githubQuery.data.github.viewerLogin ? (
                <span className="text-muted-foreground">as {githubQuery.data.github.viewerLogin}</span>
              ) : null}
              {githubQuery.data.github.reason && !githubQuery.data.github.connected ? (
                <span className="font-mono text-xs text-muted-foreground">
                  ({githubQuery.data.github.reason})
                </span>
              ) : null}
            </p>
            <dl className="grid gap-2 font-mono text-xs">
              <div className="flex flex-col gap-1 sm:flex-row sm:items-baseline sm:gap-3">
                <dt className="w-32 shrink-0 font-sans font-medium text-muted-foreground">
                  Token present
                </dt>
                <dd>{githubQuery.data.github.tokenPresent ? "yes" : "no"}</dd>
              </div>
              <div className="flex flex-col gap-1 sm:flex-row sm:items-baseline sm:gap-3">
                <dt className="w-32 shrink-0 font-sans font-medium text-muted-foreground">
                  Token source
                </dt>
                <dd>{githubQuery.data.github.tokenSource}</dd>
              </div>
              <div className="flex flex-col gap-1 sm:flex-row sm:items-baseline sm:gap-3">
                <dt className="w-32 shrink-0 font-sans font-medium text-muted-foreground">
                  gh CLI
                </dt>
                <dd>{githubQuery.data.github.ghCliAuthenticated ? "authenticated" : "not authenticated"}</dd>
              </div>
            </dl>
            {githubQuery.data.github.ghCliDetail ? (
              <pre className="overflow-x-auto rounded-md bg-muted p-3 font-mono text-xs whitespace-pre-wrap text-muted-foreground">
                {githubQuery.data.github.ghCliDetail}
              </pre>
            ) : null}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
