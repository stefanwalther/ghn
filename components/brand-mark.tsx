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
// The indicator uses var(--primary) so the "." in "ghn." picks up the
// selected color theme (each [data-theme] block sets --primary). Letters
// use var(--foreground) so they follow light/dark + theme as well.
// Both are inline SVGs on purpose: <img> SVGs are isolated documents and
// can't see the page's CSS variables.

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
        <svg
          xmlns="http://www.w3.org/2000/svg"
          viewBox="0 0 55 40"
          aria-hidden="true"
          style={{ height: 30, width: "auto", fill: "var(--foreground)" }}
        >
          <path d="M441 -191Q487 -230 596 -230Q750 -230 802 -127Q836 -61 836 95V165Q795 95 748 60Q663 -5 527 -5Q317 -5 191.5 142.5Q66 290 66 542Q66 785 187.0 950.5Q308 1116 530 1116Q612 1116 673 1091Q777 1048 841 933V1090H1118V56Q1118 -155 1047 -262Q925 -446 579 -446Q370 -446 238.0 -364.0Q106 -282 92 -119H402Q414 -169 441 -191ZM393 372Q451 234 601 234Q701 234 770.0 309.5Q839 385 839 550Q839 705 773.5 786.0Q708 867 598 867Q448 867 391 726Q361 651 361 541Q361 446 393 372Z" transform="translate(4.00,29) scale(0.0137,-0.0137)" />
          <path d="M1118 640V0H827V663Q827 751 797 805Q758 881 649 881Q536 881 477.5 805.5Q419 730 419 590V0H135V1469H419V948Q481 1043 562.5 1080.5Q644 1118 734 1118Q835 1118 917.5 1083.0Q1000 1048 1053 976Q1098 915 1108.0 850.5Q1118 786 1118 640Z" transform="translate(20.56,29) scale(0.0137,-0.0137)" />
          <path d="M646 879Q501 879 447 756Q419 691 419 590V0H135V1088H410V929Q465 1013 514 1050Q602 1116 737 1116Q906 1116 1013.5 1027.5Q1121 939 1121 734V0H829V663Q829 749 806 795Q764 879 646 879Z" transform="translate(37.11,29) scale(0.0137,-0.0137)" />
        </svg>
        {state === "ready" ? (
          <svg
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 16 40"
            aria-hidden="true"
            style={{ height: 30, width: "auto", fill: "var(--primary)" }}
          >
            <circle cx="10.00" cy="24.60" r="5" />
          </svg>
        ) : state === "waiting" ? (
          <svg
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 17 40"
            aria-hidden="true"
            style={{ height: 30, width: "auto", fill: "none", stroke: "var(--primary)" }}
          >
            <circle cx="10.00" cy="24.60" r="5.5" strokeWidth="2.5" />
          </svg>
        ) : (
          <svg
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 13 40"
            aria-hidden="true"
            style={{ height: 30, width: "auto", fill: "var(--primary)" }}
            className={syncing && !reducedMotion ? "animate-pulse" : undefined}
          >
            <rect x="5.00" y="7.16" width="7.00" height="24.08" rx="1.5" />
          </svg>
        )}
      </Link>
    </div>
  );
}
