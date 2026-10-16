"use client";

import { SHORTCUTS } from "@/lib/shortcuts";

export function ShortcutsHelp({ onClose }: { onClose: () => void }) {
  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Keyboard shortcuts"
      className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 p-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-md rounded-lg bg-card p-6 shadow-md"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="font-semibold">Keyboard shortcuts</h2>
        <ul className="mt-4 flex flex-col gap-2">
          {SHORTCUTS.map((s) => (
            <li key={s.key} className="flex items-center gap-3 text-sm">
              <kbd className="min-w-16 rounded-md border border-input bg-background px-2 py-0.5 text-center font-mono text-xs">
                {s.key}
              </kbd>
              <span className="text-muted-foreground">{s.description}</span>
            </li>
          ))}
        </ul>
        <p className="mt-4 text-xs text-muted-foreground">
          Shortcuts stay out of the way while typing in inputs. Press Esc or click outside to close.
        </p>
      </div>
    </div>
  );
}
