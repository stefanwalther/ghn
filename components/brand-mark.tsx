"use client";

import Link from "next/link";
import * as React from "react";
import { useIsFetching } from "@tanstack/react-query";
import { useConnection } from "@/lib/queries";

interface ConnStatus {
  connected: boolean;
  lastSyncAt: number | null;
  pollIntervalSecs: number;
}

function formatSyncTime(ts: number): string {
  return new Date(ts).toLocaleTimeString(undefined, {
    hour: "2-digit",
    minute: "2-digit",
  });
}

// Sidebar brand lockup. Letters stay steady; only the indicator image blinks,
// and only while syncing. Gaps live inside the SVGs, not in CSS.
// Precedence: syncing -> bar, stale/disconnected -> ring, fresh -> dot.
const INDICATOR_BY_STATE = {
  syncing: "/brand/i-bar.svg",
  waiting: "/brand/i-ring.svg",
  ready: "/brand/i-dot.svg",
} as const;

export function BrandMark() {
  // Any in-flight query means syncing. The intro flag keeps the syncing
  // indicator on through the first paint so it never flashes ready before
  // the initial fetches register.
  const fetching = useIsFetching();
  const connectionQuery = useConnection();
  const [intro, setIntro] = React.useState(true);
  const [nowMs, setNowMs] = React.useState(() => Date.now());
  const [reducedMotion, setReducedMotion] = React.useState(false);

  React.useEffect(() => {
    setReducedMotion(
      window.matchMedia("(prefers-reduced-motion: reduce)").matches
    );
  }, []);

  React.useEffect(() => {
    if (fetching === 0) setIntro(false);
  }, [fetching]);

  const syncing = intro || fetching > 0;
  const data = connectionQuery.data;
  const conn: ConnStatus | null = data
    ? {
        connected: data.connected === true,
        lastSyncAt: typeof data.lastSyncAt === "number" ? data.lastSyncAt : null,
        pollIntervalSecs:
          typeof data.pollIntervalSecs === "number" ? data.pollIntervalSecs : 60,
      }
    : null;

  // Staleness flips on a cheap local 30s tick, and the connection entry is
  // refreshed when the tab becomes visible again.
  React.useEffect(() => {
    const tickId = window.setInterval(() => setNowMs(Date.now()), 30000);
    const onVisible = () => {
      if (document.visibilityState === "visible") {
        setNowMs(Date.now());
        void connectionQuery.refetch();
      }
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      window.clearInterval(tickId);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [connectionQuery]);

  const stale =
    conn !== null &&
    conn.lastSyncAt !== null &&
    nowMs - conn.lastSyncAt > 2 * conn.pollIntervalSecs * 1000;
  const waiting = conn !== null && (!conn.connected || stale);
  const state = syncing ? "syncing" : waiting ? "waiting" : "ready";
  const lastSynced =
    conn?.lastSyncAt != null ? formatSyncTime(conn.lastSyncAt) : null;
  const label = syncing
    ? `ghn home — syncing${lastSynced ? ` (last synced ${lastSynced})` : "…"}`
    : conn === null
      ? "ghn home"
      : !conn.connected
        ? "ghn home — disconnected, run gh auth login on the server"
        : stale
          ? `ghn home — stale, last synced ${lastSynced ?? "unknown"}`
          : lastSynced
            ? `ghn home — synced ${lastSynced}, all clear`
            : "ghn home — not synced yet";

  return (
    <div className="mb-4 px-2">
      <Link
        href="/"
        aria-label={label}
        title={label}
        className="inline-flex items-center rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/brand/brand-ghn.svg" alt="" style={{ height: 30, width: "auto" }} />
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={INDICATOR_BY_STATE[state]}
          alt=""
          style={{ height: 30, width: "auto" }}
          className={syncing && !reducedMotion ? "animate-pulse" : undefined}
        />
      </Link>
    </div>
  );
}
