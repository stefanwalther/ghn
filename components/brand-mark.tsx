"use client";

import Link from "next/link";
import * as React from "react";
import { GHN_SYNC_EVENT, type GhnSyncDetail } from "@/lib/sync-events";

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
  const [syncing, setSyncing] = React.useState(true);
  const [conn, setConn] = React.useState<ConnStatus | null>(null);
  const [nowMs, setNowMs] = React.useState(() => Date.now());
  const [reducedMotion, setReducedMotion] = React.useState(false);
  const introRef = React.useRef(true);

  React.useEffect(() => {
    setReducedMotion(
      window.matchMedia("(prefers-reduced-motion: reduce)").matches
    );
    const onSync = (e: Event) => {
      const detail = (e as CustomEvent<GhnSyncDetail>).detail;
      if (detail && typeof detail.syncing === "boolean") {
        introRef.current = false;
        setSyncing(detail.syncing);
      }
    };
    window.addEventListener(GHN_SYNC_EVENT, onSync);
    return () => window.removeEventListener(GHN_SYNC_EVENT, onSync);
  }, []);

  // Connection probe is expensive (gh subprocess plus one core API call),
  // so it runs on mount, at most every 5 minutes, and on tab focus.
  // Staleness flips on a cheap local 30s tick instead.
  React.useEffect(() => {
    let cancelled = false;
    async function fetchStatus() {
      try {
        const res = await fetch("/api/connection", { cache: "no-store" });
        const data = await res.json().catch(() => null);
        if (cancelled || !data) return;
        setConn({
          connected: data.connected === true,
          lastSyncAt:
            typeof data.lastSyncAt === "number" ? data.lastSyncAt : null,
          pollIntervalSecs:
            typeof data.pollIntervalSecs === "number"
              ? data.pollIntervalSecs
              : 60,
        });
        if (introRef.current) {
          introRef.current = false;
          setSyncing(false);
        }
      } catch {
        // Best-effort; the mark keeps its previous state.
      }
    }
    fetchStatus();
    const pollId = window.setInterval(fetchStatus, 300000);
    const tickId = window.setInterval(() => setNowMs(Date.now()), 30000);
    const onVisible = () => {
      if (document.visibilityState === "visible") {
        setNowMs(Date.now());
        fetchStatus();
      }
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      cancelled = true;
      window.clearInterval(pollId);
      window.clearInterval(tickId);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, []);

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
