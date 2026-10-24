"use client";

import * as React from "react";
import { ErrorRateLimits, LoadingRateLimits } from "@/components/inbox/empty-states";
import { Button } from "@/components/ui/button";
import { SyncSpinner } from "@/components/ui/sync-spinner";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { RATE_LIMIT_BUCKETS, RATE_LIMIT_DOCS } from "@/lib/rate-limit-meta";
import type { RateLimitBucket } from "@/lib/rate-limits";
import { useRateLimits } from "@/lib/queries";

function formatReset(bucket: RateLimitBucket): string {
  if (bucket.resetsAt) {
    const d = new Date(bucket.resetsAt);
    if (!Number.isNaN(d.getTime())) {
      return d.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" });
    }
  }
  if (typeof bucket.resetsInSecs === "number") {
    const m = Math.floor(bucket.resetsInSecs / 60);
    const s = bucket.resetsInSecs % 60;
    if (m > 0) return `in ${m}m ${s}s`;
    return `in ${s}s`;
  }
  return "unknown";
}

function barClass(pct: number, rateLimited: boolean): string {
  if (rateLimited || pct >= 90) return "bg-destructive";
  if (pct >= 70) return "bg-amber-500";
  return "bg-primary";
}

export default function RateLimitsPage() {
  const rateQuery = useRateLimits();
  const data = rateQuery.data ?? null;
  const status = rateQuery.isPending
    ? "loading"
    : rateQuery.isError && !rateQuery.data
      ? "error"
      : "ready";
  const error = rateQuery.isError
    ? rateQuery.error instanceof Error
      ? rateQuery.error.message
      : "Failed to load rate limits."
    : null;
  const refreshing = rateQuery.isFetching && !rateQuery.isPending;

  return (
    <div className="flex w-full max-w-4xl flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h1 className="text-xl font-semibold">GitHub rate limits</h1>
          <p className="text-sm text-muted-foreground">
            Live GitHub API buckets from response headers. Each refresh spends one request per bucket.
          </p>
        </div>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => void rateQuery.refetch()}
          disabled={refreshing || status === "loading"}
          title="Refresh rate limits from GitHub"
          aria-label="Refresh rate limits from GitHub"
        >
          <SyncSpinner spinning={refreshing} />
          Refresh
        </Button>
      </div>

      {status === "loading" ? <LoadingRateLimits /> : null}
      {status === "error" ? (
        <>
          <ErrorRateLimits onRetry={() => void rateQuery.refetch()} />
          {error ? (
            <p role="alert" className="text-xs text-destructive">
              {error}
            </p>
          ) : null}
        </>
      ) : null}
      {status === "ready" && error ? (
        <p role="alert" className="text-xs text-destructive">
          {error}
        </p>
      ) : null}

      {status === "ready" && data ? (
        <>
          <div className="grid gap-4 md:grid-cols-3">
            {RATE_LIMIT_BUCKETS.map((id) => {
              const bucket = data.usage[id];
              const docs = RATE_LIMIT_DOCS[id];
              const warning = data.warnings?.[id];
              if (!bucket) {
                return (
                  <Card key={id}>
                    <CardHeader>
                      <CardTitle className="text-sm">{docs.title}</CardTitle>
                      <CardDescription>{docs.limit} · {docs.note}</CardDescription>
                    </CardHeader>
                    <CardContent>
                      <p className="text-sm text-muted-foreground" role="status">
                        {warning ?? "No data for this bucket."}
                      </p>
                    </CardContent>
                  </Card>
                );
              }
              const rateLimited = bucket.status === "rate-limited";
              return (
                <Card key={id}>
                  <CardHeader>
                    <CardTitle className="flex items-baseline justify-between text-sm">
                      <span>{docs.title}</span>
                      <span className="font-mono text-xl font-semibold" aria-label={`${bucket.percent}% used`}>
                        {bucket.percent}
                        <span className="text-xs font-normal text-muted-foreground">%</span>
                      </span>
                    </CardTitle>
                    <CardDescription>
                      {bucket.used.toLocaleString()} / {bucket.limit.toLocaleString()} used ·{" "}
                      {bucket.remaining.toLocaleString()} left
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="flex flex-col gap-2">
                    <div
                      className="h-2 overflow-hidden rounded-full bg-muted"
                      role="progressbar"
                      aria-valuenow={bucket.percent}
                      aria-valuemin={0}
                      aria-valuemax={100}
                      aria-label={`${docs.title} usage`}
                    >
                      <div
                        className={`h-full rounded-full transition-all ${barClass(bucket.percent, rateLimited)}`}
                        style={{
                          width: `${Math.min(100, Math.max(0, bucket.percent))}%`,
                          minWidth: bucket.percent > 0 ? 6 : 0,
                        }}
                      />
                    </div>
                    <p className="font-mono text-xs text-muted-foreground">
                      resets {formatReset(bucket)}
                      {rateLimited ? " · rate-limited" : ""}
                    </p>
                    {warning ? (
                      <p className="text-xs text-muted-foreground" role="note">
                        {warning}
                      </p>
                    ) : null}
                  </CardContent>
                </Card>
              );
            })}
          </div>

          <Card>
            <CardHeader>
              <CardTitle className="text-sm">Documented limits · per authenticated account</CardTitle>
              <CardDescription>
                Numbers from{" "}
                <a
                  href="https://docs.github.com/en/rest/using-the-rest-api/rate-limits-for-the-rest-api"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="underline underline-offset-2"
                >
                  GitHub rate-limit docs
                </a>
                . Header values cover all tokens and apps on your account combined.
              </CardDescription>
            </CardHeader>
            <CardContent className="grid gap-2 text-sm text-muted-foreground md:grid-cols-3">
              {RATE_LIMIT_BUCKETS.map((id) => (
                <p key={id}>
                  <span className="font-medium text-foreground">{RATE_LIMIT_DOCS[id].title}:</span>{" "}
                  {RATE_LIMIT_DOCS[id].limit} · {RATE_LIMIT_DOCS[id].note}
                </p>
              ))}
            </CardContent>
          </Card>

          <p className="text-xs text-muted-foreground">
            Fetched {new Date(data.fetchedAt).toLocaleTimeString()} · source: api.github.com X-RateLimit
            headers, token from `GH_TOKEN` or `gh auth login`.
          </p>
        </>
      ) : null}
    </div>
  );
}
