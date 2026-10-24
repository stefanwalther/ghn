"use client";

import * as React from "react";
import { Check } from "lucide-react";
import { THEMES, useAppTheme } from "@/lib/themes";
import { cn } from "@/lib/utils";

/**
 * Generic theme grid. Renders every entry from the theme registry, so
 * adding a theme needs no UI change. Selection persists to localStorage
 * via the registry hook.
 */
export function ThemePicker() {
  const { theme, setTheme } = useAppTheme();
  const [mounted, setMounted] = React.useState(false);
  React.useEffect(() => setMounted(true), []);
  const active = mounted ? theme : "default";

  return (
    <div
      role="radiogroup"
      aria-label="Color theme"
      className="grid gap-2 sm:grid-cols-2"
    >
      {THEMES.map((t) => {
        const selected = active === t.id;
        return (
          <button
            key={t.id}
            type="button"
            role="radio"
            aria-checked={selected}
            aria-label={`${t.name} theme`}
            onClick={() => setTheme(t.id)}
            className={cn(
              "flex cursor-pointer items-center gap-3 rounded-lg border p-3 text-left transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
              selected
                ? "border-ring bg-accent"
                : "border-border bg-card hover:bg-accent hover:text-accent-foreground"
            )}
          >
            <span aria-hidden="true" className="flex -space-x-1.5">
              <span
                className="h-6 w-6 rounded-full border border-border"
                style={{ backgroundColor: t.preview[0] }}
              />
              <span
                className="h-6 w-6 rounded-full border border-border"
                style={{ backgroundColor: t.preview[1] }}
              />
              <span
                className="h-6 w-6 rounded-full border border-border"
                style={{ backgroundColor: t.preview[2] }}
              />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block text-sm font-medium">{t.name}</span>
              <span className="block truncate text-xs text-muted-foreground">
                {t.blurb}
              </span>
            </span>
            {selected ? (
              <Check aria-label="Selected" className="h-4 w-4 shrink-0" />
            ) : null}
          </button>
        );
      })}
    </div>
  );
}
