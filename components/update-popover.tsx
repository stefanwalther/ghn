"use client";

import * as React from "react";
import { X } from "lucide-react";
import { copyText } from "@/lib/clipboard";

export const SOURCE_UPDATE_COMMANDS = [
  "git pull",
  "bun install",
  "# restart the server (bun run dev)",
].join("\n");

export const DOCKER_UPDATE_COMMANDS = ["git pull", "make up"].join("\n");

interface UpdatePopoverProps {
  current: string;
  latest: string;
  releaseUrl: string;
  onClose: () => void;
}

/**
 * Update popover anchored above the sidebar version badge. The reader is a
 * developer running ghn from source or Docker, so the panel shows the exact
 * commands for both instead of a generic "please update".
 */
export function UpdatePopover({ current, latest, releaseUrl, onClose }: UpdatePopoverProps) {
  const [copied, setCopied] = React.useState<"source" | "docker" | null>(null);

  React.useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onClose]);

  async function copyCommands(which: "source" | "docker") {
    const ok = await copyText(which === "source" ? SOURCE_UPDATE_COMMANDS : DOCKER_UPDATE_COMMANDS);
    if (!ok) return;
    setCopied(which);
    window.setTimeout(() => {
      setCopied((active) => (active === which ? null : active));
    }, 1500);
  }

  return (
    <div className="fixed inset-0 z-50" data-testid="update-backdrop" onClick={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Update available"
        className="absolute bottom-16 left-4 w-[calc(100%_-_2rem)] max-w-md rounded-lg border border-border bg-card p-6 shadow-lg"
        onClick={(e) => e.stopPropagation()}
      >
        <button
          type="button"
          onClick={onClose}
          aria-label="Close update dialog"
          title="Close"
          className="absolute top-3 right-3 cursor-pointer rounded-md p-1.5 text-muted-foreground transition-colors duration-150 hover:bg-accent hover:text-accent-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <X className="h-4 w-4" aria-hidden />
        </button>
        <h2 className="font-semibold">Update available</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          This install runs v{current}. v{latest} is out.
        </p>
        <div className="mt-4">
          <div className="flex items-center justify-between gap-2">
            <h3 className="text-sm font-medium">Source checkout</h3>
            <button
              type="button"
              onClick={() => copyCommands("source")}
              className="cursor-pointer rounded-md px-2 py-1 text-xs text-muted-foreground transition-colors duration-150 hover:bg-accent hover:text-accent-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              {copied === "source" ? "Copied" : "Copy"}
            </button>
          </div>
          <pre className="mt-1 overflow-x-auto rounded-md border border-input bg-background p-3 font-mono text-xs">
            {SOURCE_UPDATE_COMMANDS}
          </pre>
        </div>
        <div className="mt-4">
          <div className="flex items-center justify-between gap-2">
            <h3 className="text-sm font-medium">Docker</h3>
            <button
              type="button"
              onClick={() => copyCommands("docker")}
              className="cursor-pointer rounded-md px-2 py-1 text-xs text-muted-foreground transition-colors duration-150 hover:bg-accent hover:text-accent-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              {copied === "docker" ? "Copied" : "Copy"}
            </button>
          </div>
          <pre className="mt-1 overflow-x-auto rounded-md border border-input bg-background p-3 font-mono text-xs">
            {DOCKER_UPDATE_COMMANDS}
          </pre>
        </div>
        <div className="mt-4 flex items-center justify-between gap-2">
          <a
            href={releaseUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="cursor-pointer rounded-md px-2 py-1 text-sm text-muted-foreground underline underline-offset-4 transition-colors duration-150 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            View release notes for v{latest}
          </a>
          <button
            type="button"
            onClick={onClose}
            className="cursor-pointer rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors duration-150 hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            Not now
          </button>
        </div>
      </div>
    </div>
  );
}
