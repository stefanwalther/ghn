"use client";

import { usePathname, useRouter } from "next/navigation";
import { useTheme } from "next-themes";
import * as React from "react";
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
  const [open, setOpen] = React.useState(false);
  const [query, setQuery] = React.useState("");
  const [threads, setThreads] = React.useState<ThreadRow[]>([]);
  const [repos, setRepos] = React.useState<RepoRow[]>([]);
  const [loading, setLoading] = React.useState(false);
  const [active, setActive] = React.useState(0);
  const inputRef = React.useRef<HTMLInputElement>(null);
  const loadedAt = React.useRef(0);

  React.useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const mod = e.metaKey || e.ctrlKey;
      if (mod && e.key.toLowerCase() === "k") {
        // Don't steal Cmd+K while an IME composition is in progress.
        if (e.isComposing) return;
        e.preventDefault();
        setOpen((v) => !v);
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
        setOpen(true);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open ]);

  React.useEffect(() => {
    function onOpen() {
      setOpen(true);
    }
    window.addEventListener("ghn:open-palette", onOpen);
    return () => window.removeEventListener("ghn:open-palette", onOpen);
  }, []);

  React.useEffect(() => {
    if (!open) {
      setQuery("");
      setActive(0);
      return;
    }
    requestAnimationFrame(() => inputRef.current?.focus());
    // Refresh cached rows at most once per 30s.
    if (Date.now() - loadedAt.current < 30_000 && (threads.length > 0 || repos.length > 0)) return;
    setLoading(true);
    (async () => {
      try {
        const [nRes, rRes] = await Promise.all([
          fetch("/api/notifications?state=all&limit=400", { cache: "no-store" }),
          fetch("/api/repositories", { cache: "no-store" }),
        ]);
        if (nRes.ok) {
          const data = await nRes.json().catch(() => null);
          const flows = (data?.mainFlow ?? []) as ThreadRow[];
          setThreads(
            flows.slice(0, 400).map((t) => ({
              id: t.id,
              repositoryId: t.repositoryId,
              repositoryName: t.repositoryName,
              subject: t.subject,
              reason: t.reason,
            }))
          );
        }
        if (rRes.ok) {
          const data = await rRes.json().catch(() => null);
          const rows = (data?.repositories ?? []) as RepoRow[];
          setRepos(rows.map((r) => ({ id: r.id, fullName: r.fullName })));
        }
        loadedAt.current = Date.now();
      } catch {
        // Palette still shows static commands when fetches fail.
      } finally {
        setLoading(false);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

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
    setOpen(false);
  }

  function run(entry: PaletteEntry) {
    const a = entry.action;
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
    if (a.type === "event") {
      window.dispatchEvent(new CustomEvent(a.name, { detail: a.detail }));
      close();
      return;
    }
    if (a.type === "thread") {
      saveLastOpened(a.id);
      window.dispatchEvent(new CustomEvent("ghn:open-thread", { detail: { id: a.id } }));
      close();
      // On the inbox the event opens the drawer directly. From other
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
      role="dialog"
      aria-modal="true"
      aria-label="Search and commands"
      className="fixed inset-0 z-50 flex items-start justify-center bg-background/80 p-4 pt-[12vh]"
      onClick={close}
    >
      <div
        className="w-full max-w-xl overflow-hidden rounded-lg bg-card shadow-md"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-2 border-b border-border/40 px-4">
          <span aria-hidden="true" className="text-muted-foreground">⌕</span>
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={onInputKey}
            placeholder="Search threads, repos, commands…"
            aria-label="Search threads, repositories, and commands"
            aria-expanded="true"
            aria-controls="palette-listbox"
            aria-activedescendant={activeId}
            role="combobox"
            autoComplete="off"
            spellCheck={false}
            className="h-12 min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
          />
          {loading ? (
            <span className="text-xs text-muted-foreground">…</span>
          ) : (
            <Kbd>esc</Kbd>
          )}
        </div>
        <div
          id="palette-listbox"
          role="listbox"
          aria-label="Results"
          className="max-h-[50vh] overflow-y-auto p-2"
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
                      {isActive ? <Kbd>↵</Kbd> : null}
                    </button>
                  );
                })}
              </div>
            ))
          )}
        </div>
        <div className="flex items-center gap-3 border-t border-border/40 px-4 py-2 text-xs text-muted-foreground">
          <span className="flex items-center gap-1">
            <Kbd>↑</Kbd>
            <Kbd>↓</Kbd> move
          </span>
          <span className="flex items-center gap-1">
            <Kbd>↵</Kbd> run
          </span>
          <span className="ml-auto hidden sm:inline">threads · repos · commands · filters</span>
        </div>
      </div>
    </div>
  );
}
