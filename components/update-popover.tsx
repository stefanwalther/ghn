"use client";

import * as React from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { copyText } from "@/lib/clipboard";
import { useDialogFocus } from "@/lib/dialog-focus";

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
  const dialogRef = React.useRef<HTMLDivElement>(null);
  useDialogFocus(dialogRef);

  React.useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") {
        e.stopPropagation();
        onClose();
      }
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

  // Portaled to document.body: this popover renders inside the sticky app
  // sidebar, whose stacking context traps the fixed backdrop below
  // sibling main-column content (filter rows painted over the dialog).
  // The row menus use the same escape hatch. Mounting only happens on
  // client interaction, so document is always defined here.
  return createPortal(
    <div className="fixed inset-0 z-50 bg-background/80" data-testid="update-backdrop" onClick={onClose}>
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-label="Update available"
        className="absolute bottom-16 left-4 w-[calc(100%_-_2rem)] max-w-md rounded-lg bg-card p-6 shadow-md"
        onClick={(e) => e.stopPropagation()}
      >
        <button
          type="button"
          onClick={onClose}
          aria-label="Close update dialog"
          title="Close"
          data-autofocus
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
            <Button variant="ghost" size="sm" onClick={() => copyCommands("source")}>
              {copied === "source" ? "Copied" : "Copy"}
            </Button>
          </div>
          <pre className="mt-1 overflow-x-auto rounded-md border border-input bg-background p-3 font-mono text-xs">
            {SOURCE_UPDATE_COMMANDS}
          </pre>
        </div>
        <div className="mt-4">
          <div className="flex items-center justify-between gap-2">
            <h3 className="text-sm font-medium">Docker</h3>
            <Button variant="ghost" size="sm" onClick={() => copyCommands("docker")}>
              {copied === "docker" ? "Copied" : "Copy"}
            </Button>
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
          <Button onClick={onClose}>
            Not now
          </Button>
        </div>
      </div>
    </div>,
    document.body
  );
}
