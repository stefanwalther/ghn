"use client";

import * as React from "react";
import { APP_VERSION } from "@/lib/app-meta";
import type { UpdateInfo } from "@/lib/update-check";
import { UpdatePopover } from "@/components/update-popover";

/**
 * Sidebar footer version. Shows the running version, and when the release
 * check finds a newer tag the badge gains an update dot; the popover with
 * the exact commands for a source or Docker install opens only on click,
 * never on its own. The badge stays so the update can be revisited.
 */
export function VersionIndicator() {
  const [info, setInfo] = React.useState<UpdateInfo | null>(null);
  const [open, setOpen] = React.useState(false);

  React.useEffect(() => {
    let cancelled = false;
    fetch("/api/version", { cache: "no-store" })
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (cancelled || !data) return;
        if (typeof data.current !== "string") return;
        setInfo(data as UpdateInfo);
      })
      .catch(() => {
        // stay quiet offline; the plain version remains.
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const latest = info?.updateAvailable === true ? info.latest : null;

  function close() {
    setOpen(false);
  }

  if (!latest || !info) {
    return <span>v{APP_VERSION}</span>;
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label={`New ghn version ${info.latest} available, running ${info.current}. Open the update dialog.`}
        title={`New version v${info.latest} available (running v${info.current}). Open the update dialog.`}
        className="flex cursor-pointer items-center gap-1.5 rounded-md px-1 py-0.5 transition-colors duration-150 hover:bg-accent hover:text-accent-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <span>v{info.current}</span>
        <span className="relative flex h-2 w-2" aria-hidden>
          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-amber-500 opacity-75" />
          <span className="relative inline-flex h-2 w-2 rounded-full bg-amber-500" />
        </span>
        <span className="font-medium text-amber-600 dark:text-amber-400">
          v{info.latest} available
        </span>
      </button>
      {open ? (
        <UpdatePopover
          current={info.current}
          latest={info.latest ?? ""}
          releaseUrl={info.releaseUrl}
          onClose={close}
        />
      ) : null}
    </>
  );
}
