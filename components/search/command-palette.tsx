"use client";

import { usePathname, useRouter } from "next/navigation";
import { useTheme } from "next-themes";
import * as React from "react";
import { Search } from "lucide-react";
import { Kbd } from "@/components/ui/kbd";
import {
  repoEntry,
  SECTION_LABELS,
  staticEntries,
  threadEntry,
  type PaletteEntry,
  type PaletteSection,
} from "@/lib/palette-commands";
import { rankSearch } from "@/lib/search";
import { useDialogFocus } from "@/lib/dialog-focus";
import { useNotifications, useRepositories } from "@/lib/queries";
import { useUIStore } from "@/lib/ui-store";
import { repoFilterHref, saveLastOpened } from "@/lib/view-state";

interface ThreadRow {
  id: string;
  repositoryId: string;
  repositoryName: string;
  subject: string;
  reason: string;
}

interface RepoRow {
  id: string;
  fullName: string;
}

const SECTION_ORDER: PaletteSection[] = ["commands", "threads", "repos", "filters", "go"];

function haystacks(entry: PaletteEntry): string[] {
  return [entry.title, entry.subtitle ?? "", entry.keywords];
}

export function CommandPalette() {
  const router = useRouter();
  const pathname = usePathname();
  const { resolvedTheme, setTheme } = useTheme();
  const open = useUIStore((s) => s.paletteOpen);
  const [query, setQuery] = React.useState("");
  const [active, setActive] = React.useState(0);
  const dialogRef = React.useRef<HTMLDivElement>(null);
  useDialogFocus(dialogRef, open);

  // Shared cache entries: no per-open fetches while fresh. Queries stay
  // idle until the palette opens.
  const threadsQuery = useNotifications(
    { repo: "all", state: "all", type: "all", age: "all" },
    { limit: 400, enabled: open }
  );
  const reposQuery = useRepositories({ enabled: open });
  const loading = open && (threadsQuery.isFetching || reposQuery.isFetching);

  const threads = React.useMemo<ThreadRow[]>(
    () =>
      (threadsQuery.data?.mainFlow ?? []).slice(0, 400).map((t) => ({
        id: t.id,
        repositoryId: t.repositoryId,
        repositoryName: t.repositoryName,
        subject: t.subject,
        reason: t.reason,
      })),
    [threadsQuery.data]
  );
  const repos = React.useMemo<RepoRow[]>(
    () =>
      (reposQuery.data?.repositories ?? []).map((r) => ({
        id: r.id,
        fullName: r.fullName,
      })),
    [reposQuery.data]
  );

  React.useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const mod = e.metaKey || e.ctrlKey;
      if (mod && e.key.toLowerCase() === "k") {
        // Don't steal Cmd+K while an IME composition is in progress.
        if (e.isComposing) return;
        e.preventDefault();
        const ui = useUIStore.getState();
        if (ui.paletteOpen) ui.closePalette();
        else ui.openPalette();
        return;
      }
      if (e.key === "/" && !open) {
        const t = e.target as HTMLElement | null;
        const editable =
          !!t &&
          (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName));
        if (editable) return;
        // Slash opens the palette as a fast path; the keystroke itself
        // must not land in the input.
        e.preventDefault();
        useUIStore.getState().openPalette();
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open ]);

  React.useEffect(() => {
    if (!open) {
      setQuery("");
      setActive(0);
    }
  }, [open ]);

  const allEntries = React.useMemo<PaletteEntry[]>(() => {
    const statics = staticEntries();
    const dynamic: PaletteEntry[] = [
      ...threads.map(threadEntry),
      ...repos.map(repoEntry),
    ];
    if (!query.trim()) {
      // Empty query: show commands first, then recent-ish threads/repos.
      return [...statics.slice(0, 8), ...dynamic.slice(0, 12)];
    }
    return rankSearch(query, [...statics, ...dynamic], haystacks, 40).map(
      (r) => r.item
    );
  }, [query, threads, repos]);

  const grouped = React.useMemo(() => {
    const map = new Map<PaletteSection, PaletteEntry[]>();
    for (const e of allEntries) {
      const list = map.get(e.section) ?? [];
      list.push(e);
      map.set(e.section, list);
    }
    return SECTION_ORDER.flatMap((s) => {
      const list = map.get(s);
      return list && list.length > 0 ? [{ section: s, entries: list }] : [];
    });
  }, [allEntries]);

  const flat = React.useMemo(() => allEntries, [allEntries]);

  React.useEffect(() => {
    setActive(0);
  }, [query]);

  function close() {
    useUIStore.getState().closePalette();
  }

  function run(entry: PaletteEntry) {
    const a = entry.action;
    const ui = useUIStore.getState();
    if (a.type === "navigate") {
      close();
      router.push(a.href);
      return;
    }
    if (a.type === "external") {
      window.open(a.href, "_blank", "noopener");
      close();
      return;
    }
    if (a.type === "theme") {
      setTheme(resolvedTheme === "dark" ? "light" : "dark");
      close();
      return;
    }
    if (a.type === "refresh") {
      ui.requestRefresh();
      close();
      return;
    }
    if (a.type === "toggle-sidebar") {
      ui.toggleSidebar();
      close();
      return;
    }
    if (a.type === "show-help") {
      ui.openHelp();
      close();
      return;
    }
    if (a.type === "scroll-top") {
      ui.requestScrollTop();
      close();
      return;
    }
    if (a.type === "thread") {
      saveLastOpened(a.id);
      ui.requestOpenThread(a.id, a.repositoryId);
      close();
      // On the inbox the store opens the drawer directly. From other
      // pages fall back to navigation so scroll-restoration finds it.
      if (pathname !== "/") {
        router.push(repoFilterHref(window.location.search, a.repositoryId));
      }
      return;
    }
    if (a.type === "repo-filter") {
      close();
      router.push(repoFilterHref(window.location.search, a.repositoryId));
      return;
    }
  }

  function onInputKey(e: React.KeyboardEvent) {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      e.stopPropagation();
      setActive((i) => Math.min(flat.length - 1, i + 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      e.stopPropagation();
      setActive((i) => Math.max(0, i - 1));
    } else if (e.key === "Enter") {
      e.preventDefault();
      e.stopPropagation();
      const entry = flat[active];
      if (entry) run(entry);
    } else if (e.key === "Escape") {
      e.preventDefault();
      e.stopPropagation();
      close();
    }
  }

  React.useEffect(() => {
    // Keep the active row visible while arrowing through results.
    if (!open) return;
    document
      .getElementById(`palette-option-${active}`)
      ?.scrollIntoView({ block: "nearest" });
  }, [active, open]);

  if (!open) return null;

  const activeId = flat[active] ? `palette-option-${active}` : undefined;

  return (
    <div
      ref={dialogRef}
      role="dialog"
      aria-modal="true"
      aria-label="Search and commands"
      className="fixed inset-0 z-50 flex items-start justify-center bg-background/80 p-4 pt-[10dvh] sm:pt-[12vh]"
      onClick={close}
    >
      <div
        className="w-full max-w-xl overflow-hidden rounded-lg bg-card shadow-md"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-2 border-b border-border/40 px-4">
          <Search aria-hidden="true" className="h-4 w-4 shrink-0 text-muted-foreground" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={onInputKey}
            placeholder="Search threads, repos, commands…"
            aria-label="Search threads, repositories, and commands"
            aria-expanded="true"
            aria-controls="palette-listbox"
            aria-activedescendant={activeId}
            role="combobox"
            data-autofocus
            autoComplete="off"
            spellCheck={false}
            className="h-12 min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
          />
          {loading ? (
            <span className="text-xs text-muted-foreground">…</span>
          ) : (
            <Kbd>Esc</Kbd>
          )}
        </div>
        <div
          id="palette-listbox"
          role="listbox"
          aria-label="Results"
          className="max-h-[55dvh] overflow-y-auto p-2 sm:max-h-[50vh]"
        >
          {flat.length === 0 ? (
            <div className="px-3 py-8 text-center" role="status">
              <p className="text-sm font-medium">No matches for “{query.trim()}”.</p>
              <p className="mt-1 text-sm text-muted-foreground">
                Try a thread subject, repo name, or a command like “refresh”.
              </p>
            </div>
          ) : (
            grouped.map((group) => (
              <div key={group.section}>
                <div className="px-3 pt-2 pb-1 text-xs font-medium text-muted-foreground">
                  {SECTION_LABELS[group.section]}
                </div>
                {group.entries.map((entry) => {
                  const idx = flat.indexOf(entry);
                  const isActive = idx === active;
                  return (
                    <button
                      key={entry.id}
                      id={`palette-option-${idx}`}
                      role="option"
                      aria-selected={isActive}
                      type="button"
                      onMouseEnter={() => setActive(idx)}
                      onClick={() => run(entry)}
                      className={`flex w-full cursor-pointer items-center gap-3 rounded-md px-3 py-2 text-left text-sm transition-colors duration-100 hover:bg-accent hover:text-accent-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
                        isActive ? "bg-accent text-accent-foreground" : ""
                      }`}
                    >
                      <span className="min-w-0 flex-1">
                        <span className="block truncate font-medium">{entry.title}</span>
                        {entry.subtitle ? (
                          <span className="block truncate text-xs text-muted-foreground">
                            {entry.subtitle}
                          </span>
                        ) : null}
                      </span>
                      {entry.shortcut ? (
                        <span className="ml-auto shrink-0 pl-3 text-xs text-muted-foreground tabular-nums">
                          {entry.shortcut}
                        </span>
                      ) : null}
                    </button>
                  );
                })}
              </div>
            ))
          )}
        </div>
        <div className="flex items-center gap-4 border-t border-border/40 px-4 py-2 text-xs text-muted-foreground">
          <span className="flex items-center gap-1">
            <Kbd>↑</Kbd>
            <Kbd>↓</Kbd> <span className="ml-1">Navigate</span>
          </span>
          <span className="flex items-center gap-1">
            <Kbd>Enter</Kbd> <span className="ml-1">Select</span>
          </span>
          <span className="flex items-center gap-1">
            <Kbd>Esc</Kbd> <span className="ml-1">Close</span>
          </span>
          <span className="ml-auto hidden sm:inline">threads · repos · commands · filters</span>
        </div>
      </div>
    </div>
  );
}
