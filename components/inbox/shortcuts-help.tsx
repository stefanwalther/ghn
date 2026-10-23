"use client";

import * as React from "react";
import { Kbd } from "@/components/ui/kbd";
import { SHORTCUTS } from "@/lib/shortcuts";

const GROUP_ORDER = ["Navigate", "Triage", "App"] as const;

export function ShortcutsHelp({ onClose }: { onClose: () => void }) {
  const [query, setQuery] = React.useState("");
  const inputRef = React.useRef<HTMLInputElement>(null);

  React.useEffect(() => {
    requestAnimationFrame(() => inputRef.current?.focus());
  }, []);

  const filtered = React.useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return SHORTCUTS;
    return SHORTCUTS.filter((s) =>
      [s.key, s.label, s.description, s.group].some((v) =>
        v.toLowerCase().includes(q)
      )
    );
  }, [query]);

  const grouped = React.useMemo(
    () =>
      GROUP_ORDER.flatMap((group) => {
        const items = filtered.filter((s) => s.group === group);
        return items.length > 0 ? [{ group, items }] : [];
      }),
    [filtered]
  );

  function onInputKey(e: React.KeyboardEvent) {
    if (e.key === "Escape") {
      e.preventDefault();
      e.stopPropagation();
      if (query) setQuery("");
      else onClose();
    }
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Keyboard shortcuts"
      className="fixed inset-0 z-50 flex items-start justify-center bg-background/80 p-4 pt-[12vh]"
      onClick={onClose}
    >
      <div
        className="w-full max-w-lg overflow-hidden rounded-lg bg-card shadow-md"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="px-4 pt-4 pb-3">
          <div className="flex items-baseline justify-between gap-3">
            <h2 className="font-semibold">Keyboard shortcuts</h2>
            <span className="text-xs text-muted-foreground tabular-nums">
              {filtered.length} of {SHORTCUTS.length}
            </span>
          </div>
          <div className="mt-3 flex items-center gap-2 rounded-md border border-input bg-background px-3">
            <span aria-hidden="true" className="text-muted-foreground">
              ⌕
            </span>
            <input
              ref={inputRef}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={onInputKey}
              placeholder="Search shortcuts… (e.g. triage, sidebar, theme)"
              aria-label="Search keyboard shortcuts"
              autoComplete="off"
              spellCheck={false}
              className="h-9 min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
            />
            {query ? (
              <button
                type="button"
                onClick={() => setQuery("")}
                aria-label="Clear search"
                className="cursor-pointer rounded p-1 text-xs text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                ✕
              </button>
            ) : (
              <Kbd>Esc</Kbd>
            )}
          </div>
        </div>
        <div className="max-h-[50vh] overflow-y-auto px-2 pb-2">
          {filtered.length === 0 ? (
            <div className="px-3 py-8 text-center" role="status">
              <p className="text-sm font-medium">
                No shortcuts match “{query.trim()}”.
              </p>
              <p className="mt-1 text-sm text-muted-foreground">
                Try a key (“j”, “d”), an action (“triage”, “sidebar”), or a
                group (“navigate”, “app”).
              </p>
            </div>
          ) : (
            grouped.map(({ group, items }) => (
              <div key={group}>
                <div className="px-3 pt-2 pb-1 text-xs font-medium text-muted-foreground">
                  {group}
                </div>
                <ul className="flex flex-col gap-0.5">
                  {items.map((s) => (
                    <li
                      key={s.key}
                      className="flex items-center gap-3 rounded-md px-3 py-1.5 text-sm transition-colors hover:bg-accent/50"
                    >
                      <span className="min-w-0 flex-1">
                        <span className="block font-medium">{s.label}</span>
                        <span className="block truncate text-xs text-muted-foreground">
                          {s.description}
                        </span>
                      </span>
                      <Kbd className="ml-auto shrink-0 px-2 py-0.5 text-xs">
                        {s.key}
                      </Kbd>
                    </li>
                  ))}
                </ul>
              </div>
            ))
          )}
        </div>
        <div className="border-t border-border/40 px-4 py-2 text-xs text-muted-foreground">
          Shortcuts stay out of the way while typing in inputs. Press Esc or
          click outside to close.
        </div>
      </div>
    </div>
  );
}
