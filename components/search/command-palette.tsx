"use client";

import { usePathname, useRouter } from "next/navigation";
import { useTheme } from "next-themes";
import * as React from "react";
import { Search } from "lucide-react";
import { Kbd } from "@/components/ui/kbd";
import {
  ageEntries,
  dimensionEntries,
  ensureRepoEntries,
  filterListEntry,
  parsePaletteScope,
  qualifierEntries,
  repoEntry,
  SECTION_LABELS,
  SCOPE_PREFIX,
  stateEntries,
  staticEntries,
  stripScopePrefix,
  threadEntry,
  typeEntries,
  type PaletteEntry,
  type PaletteScope,
  type PaletteSection,
} from "@/lib/palette-commands";
import { rankSearch } from "@/lib/search";
import { useDialogFocus } from "@/lib/dialog-focus";
import { TYPE_FILTERS } from "@/lib/filters";
import { useNotifications, useRepositories } from "@/lib/queries";
import { useUIStore } from "@/lib/ui-store";
import { parseInboxFilters, repoFilterHref, saveLastOpened, serializeInboxFilters, type InboxFilters } from "@/lib/view-state";

interface ThreadRow {
  id: string;
  repositoryId: string;
  repositoryName: string;
  subject: string;
  subjectType?: string | null;
  subjectState?: string | null;
  reason: string;
  prMerged?: boolean | null;
  createdAt: number;
  isRead: number;
  isDone: number;
  sourceUrl: string;
  due: boolean;
  dueLabel: string | null;
}

interface RepoRow {
  id: string;
  fullName: string;
}

const SECTION_ORDER: PaletteSection[] = ["syntax", "commands", "threads", "repos", "filters", "go"];

// Fixed value sets: built once, shared across renders.
const STATE_VALUE_ENTRIES = stateEntries();
const AGE_VALUE_ENTRIES = ageEntries();

function haystacks(entry: PaletteEntry): string[] {
  // Repo rows share one instructional subtitle ("Select this repo").
  // Letting it match would make every repo a hit for "select". Repos
  // match on their name; the subtitle stays visible, just not searchable.
  if (entry.action.type === "repo-filter") {
    return [entry.title, entry.keywords];
  }
  return [entry.title, entry.subtitle ?? "", entry.keywords];
}

function matchCount(term: string, entries: PaletteEntry[]): number {
  if (!term) return entries.length;
  return rankSearch(term, entries, haystacks, entries.length).length;
}

function withFilterListEntry(
  ranked: PaletteEntry[],
  trimmedTerm: string,
  repoMatchCount: number
): PaletteEntry[] {
  if (!trimmedTerm || repoMatchCount === 0) return ranked;
  const entry = filterListEntry(trimmedTerm, repoMatchCount);
  const withoutStale = ranked.filter((e) => e.section !== "repos" || e.id !== entry.id);
  // After the repo hits, never before them: the top hit keeps Enter, so a
  // thread still opens in the drawer and a repo still filters the inbox.
  // The sidebar handoff stays one arrow-press away instead of hijacking it.
  let lastRepoIdx = -1;
  for (let i = withoutStale.length - 1; i >= 0; i--) {
    if (withoutStale[i]?.section === "repos") {
      lastRepoIdx = i;
      break;
    }
  }
  const at = lastRepoIdx === -1 ? withoutStale.length : lastRepoIdx + 1;
  return [...withoutStale.slice(0, at), entry, ...withoutStale.slice(at)];
}

function ScopeTab({
  pressed,
  onSelect,
  title,
  children,
}: {
  pressed: boolean;
  onSelect: () => void;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      aria-pressed={pressed}
      onMouseDown={(e) => e.preventDefault()}
      onClick={onSelect}
      title={title}
      className={`cursor-pointer rounded-md px-2.5 py-1 text-xs transition-colors duration-100 hover:bg-accent hover:text-accent-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
        pressed ? "bg-accent text-accent-foreground" : "text-muted-foreground"
      }`}
    >
      {children}
    </button>
  );
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
  // Local input handle for re-focusing after a query rewrite (qualifier
  // completion, dimension drill-in). Opening focus stays with the shared
  // dialog-focus hook via [data-autofocus].
  const inputRef = React.useRef<HTMLInputElement>(null);

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
        subjectType: t.subjectType ?? null,
        subjectState: t.subjectState ?? null,
        reason: t.reason,
        prMerged: t.prMerged ?? null,
        createdAt: t.createdAt,
        isRead: t.isRead,
        isDone: t.isDone,
        sourceUrl: t.sourceUrl,
        due: t.due,
        dueLabel: t.dueLabel ?? null,
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

  const { scope, term } = parsePaletteScope(query);
  const trimmedTerm = term.trim();

  const repoMatchCount = React.useMemo(() => {
    if (!trimmedTerm) return repos.length;
    return rankSearch(trimmedTerm, repos, (r) => [r.fullName], repos.length).length;
  }, [trimmedTerm, repos]);

  // Current inbox filters for the dimension subtitles. Parsed on every
  // render (cheap) so a stale filter never labels the rows.
  let currentFilters: InboxFilters;
  try {
    currentFilters = parseInboxFilters(
      new URLSearchParams(typeof window === "undefined" ? "" : window.location.search)
    );
  } catch {
    currentFilters = { repo: "all", state: "unread", type: "all", age: "all" };
  }

  // Type values come from the server facets so counts stay truthful;
  // the static type list keeps the scope usable before data lands.
  const effectiveTypeFacets = React.useMemo(() => {
    const facets = threadsQuery.data?.facets?.types ?? [];
    if (facets.length > 0) {
      const withAll = facets.some((t) => t.value === "all")
        ? facets
        : [
            {
              value: "all",
              label: "All types",
              count: facets.reduce((n, t) => n + t.count, 0),
            },
            ...facets,
          ];
      return withAll;
    }
    return TYPE_FILTERS.map((t) => ({
      ...t,
      label: t.value === "all" ? "All types" : t.label,
    }));
  }, [threadsQuery.data]);

  const typeValueEntries = React.useMemo(
    () => typeEntries(effectiveTypeFacets),
    [effectiveTypeFacets]
  );

  const dimensions = React.useMemo(
    () => dimensionEntries(currentFilters, repos, effectiveTypeFacets),
    [currentFilters, repos, effectiveTypeFacets]
  );

  const typeMatchCount = React.useMemo(
    () => matchCount(trimmedTerm, typeValueEntries),
    [trimmedTerm, typeValueEntries]
  );
  const stateMatchCount = React.useMemo(
    () => matchCount(trimmedTerm, STATE_VALUE_ENTRIES),
    [trimmedTerm]
  );
  const ageMatchCount = React.useMemo(
    () => matchCount(trimmedTerm, AGE_VALUE_ENTRIES),
    [trimmedTerm]
  );

  const allEntries = React.useMemo<PaletteEntry[]>(() => {
    const statics = staticEntries();
    const threadDynamics: PaletteEntry[] = threads.map(threadEntry);
    const repoDynamics: PaletteEntry[] = repos.map(repoEntry);
    const dynamic: PaletteEntry[] = [...threadDynamics, ...repoDynamics];
    // Qualifier being typed (`r`, `type:`): suggest the qualifier itself
    // above the hits, GitHub-style. Selecting it completes the query.
    const syntaxEntries = qualifierEntries(query);
    // Scoped queries list that dimension's values only, so a long repo
    // list can be searched without thread noise.
    if (scope === "repos") {
      if (!trimmedTerm) return [...syntaxEntries, ...repoDynamics.slice(0, 40)];
      const ranked = rankSearch(trimmedTerm, repoDynamics, haystacks, 40).map(
        (r) => r.item
      );
      return [...syntaxEntries, ...withFilterListEntry(ranked, trimmedTerm, repoMatchCount)];
    }
    if (scope === "types") {
      if (!trimmedTerm) return [...syntaxEntries, ...typeValueEntries];
      return [
        ...syntaxEntries,
        ...rankSearch(trimmedTerm, typeValueEntries, haystacks, 40).map((r) => r.item),
      ];
    }
    if (scope === "states") {
      if (!trimmedTerm) return [...syntaxEntries, ...STATE_VALUE_ENTRIES];
      return [
        ...syntaxEntries,
        ...rankSearch(trimmedTerm, STATE_VALUE_ENTRIES, haystacks, 40).map((r) => r.item),
      ];
    }
    if (scope === "ages") {
      if (!trimmedTerm) return [...syntaxEntries, ...AGE_VALUE_ENTRIES];
      return [
        ...syntaxEntries,
        ...rankSearch(trimmedTerm, AGE_VALUE_ENTRIES, haystacks, 40).map((r) => r.item),
      ];
    }
    if (!trimmedTerm) {
      // Empty query shows a balanced mix: threads alone would starve the
      // repos once the inbox fills past the slice, hiding half of what
      // the palette is for.
      return [...statics.slice(0, 8), ...threadDynamics.slice(0, 8), ...repoDynamics.slice(0, 6)];
    }
    const ranked = rankSearch(
      trimmedTerm,
      [...statics, ...dynamic, ...dimensions],
      haystacks,
      40
    ).map((r) => r.item);
    // Large accounts drown repo rows under same-named threads; splice
    // the top missing repo matches back in before the sidebar handoff.
    const withRepos = ensureRepoEntries(ranked, trimmedTerm, repos);
    return [...syntaxEntries, ...withFilterListEntry(withRepos, trimmedTerm, repoMatchCount)];
  }, [query, trimmedTerm, scope, threads, repos, repoMatchCount, typeValueEntries, dimensions]);

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

  const flat = React.useMemo(
    () => grouped.flatMap((g) => g.entries),
    [grouped]
  );

  React.useEffect(() => {
    setActive(0);
  }, [query]);

  function close() {
    useUIStore.getState().closePalette();
  }

  // The scope tabs are just a visible handle on the scope prefixes:
  // clicking rewrites the query so typing and clicking stay in sync.
  function setScope(next: PaletteScope) {
    if (next === "all") {
      setQuery((q) => stripScopePrefix(q));
      return;
    }
    const prefix = SCOPE_PREFIX[next];
    setQuery((q) =>
      parsePaletteScope(q).scope === next ? q : `${prefix}${stripScopePrefix(q)}`
    );
  }

  function run(entry: PaletteEntry, opts?: { filter?: boolean }) {
    const a = entry.action;
    const ui = useUIStore.getState();
    // Qualifier completion keeps the palette open on the scoped query.
    if (a.type === "qualifier") {
      setQuery(a.prefix);
      setActive(0);
      requestAnimationFrame(() => inputRef.current?.focus());
      return;
    }
    // Dimension drill-in keeps the palette open on the scope prefix.
    if (a.type === "dimension") {
      const prefix =
        a.dimension === "repo"
          ? SCOPE_PREFIX.repos
          : a.dimension === "type"
            ? SCOPE_PREFIX.types
            : a.dimension === "state"
              ? SCOPE_PREFIX.states
              : SCOPE_PREFIX.ages;
      setQuery(prefix);
      setActive(0);
      requestAnimationFrame(() => inputRef.current?.focus());
      return;
    }
    // Inbox filter values preserve every other active filter.
    if (a.type === "filter") {
      close();
      try {
        const current = parseInboxFilters(new URLSearchParams(window.location.search));
        router.push(
          `/${serializeInboxFilters({ ...current, [a.field]: a.value } as InboxFilters)}`
        );
      } catch {
        router.push("/");
      }
      return;
    }
    if (opts?.filter && (a.type === "thread" || a.type === "repo-filter")) {
      close();
      router.push(repoFilterHref(window.location.search, a.repositoryId));
      return;
    }
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
      const snapshot = threads.find((t) => t.id === a.id);
      ui.requestOpenThread(a.id, a.repositoryId, snapshot ?? undefined);
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
    if (a.type === "filter-list") {
      close();
      ui.setRepoListFilter(a.query);
      // The sidebar lives on the inbox: from elsewhere, land there with
      // the inbox itself unfiltered so the narrowed list is visible.
      if (pathname !== "/") {
        try {
          const current = parseInboxFilters(
            new URLSearchParams(window.location.search)
          );
          router.push(`/${serializeInboxFilters({ ...current, repo: "all" })}`);
        } catch {
          router.push("/");
        }
      }
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
      if (entry) run(entry, { filter: e.shiftKey });
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
      className="fixed inset-0 z-50 flex items-start justify-center bg-background/80 px-6 pb-4 pt-[10dvh] sm:pt-[12vh]"
      onClick={close}
    >
      <div
        className="w-full max-w-152 overflow-hidden rounded-lg bg-card shadow-md"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-2 border-b border-border/40 px-4">
          <Search aria-hidden="true" className="h-4 w-4 shrink-0 text-muted-foreground" />
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={onInputKey}
            placeholder="Search threads, repos, commands… (try repo: or type:)"
            aria-label="Search threads, repositories, commands, and filters. Prefix with repo:, type:, state:, or age: to scope the search."
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
          className="flex flex-wrap items-center gap-1 border-b border-border/40 px-4 py-1.5"
          role="group"
          aria-label="Result scope"
        >
          <ScopeTab
            pressed={scope === "all"}
            onSelect={() => setScope("all")}
            title="Show everything"
          >
            All · {allEntries.length}
          </ScopeTab>
          <ScopeTab
            pressed={scope === "repos"}
            onSelect={() => setScope("repos")}
            title="Show only repositories (same as typing repo:)"
          >
            Repos · {repoMatchCount}
          </ScopeTab>
          <ScopeTab
            pressed={scope === "types"}
            onSelect={() => setScope("types")}
            title="Show only type filters (same as typing type:)"
          >
            Types · {typeMatchCount}
          </ScopeTab>
          <ScopeTab
            pressed={scope === "states"}
            onSelect={() => setScope("states")}
            title="Show only state filters (same as typing state:)"
          >
            State · {stateMatchCount}
          </ScopeTab>
          <ScopeTab
            pressed={scope === "ages"}
            onSelect={() => setScope("ages")}
            title="Show only age filters (same as typing age:)"
          >
            Age · {ageMatchCount}
          </ScopeTab>
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
              <p className="mt-1 text-sm text-muted-foreground">
                Tip: <Kbd>repo:</Kbd> searches only repos. The <Kbd>type:</Kbd>, <Kbd>state:</Kbd>, and <Kbd>age:</Kbd> prefixes list filters. <Kbd>#</Kbd> stays part of the PR number.
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
                  const a = entry.action;
                  return (
                    <button
                      key={entry.id}
                      id={`palette-option-${idx}`}
                      role="option"
                      aria-selected={isActive}
                      type="button"
                      onMouseEnter={() => setActive(idx)}
                      onClick={(e) => run(entry, { filter: e.shiftKey })}
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
                      {a.type === "thread" ? (
                        <span
                          className={`ml-auto flex shrink-0 items-center gap-2 pl-3 text-xs text-muted-foreground tabular-nums ${isActive ? "" : "opacity-50"}`}
                        >
                          <span className="flex items-center gap-1">
                            <Kbd>↵</Kbd> Open
                          </span>
                          <span className="flex items-center gap-1">
                            <Kbd>⇧↵</Kbd> Filter
                          </span>
                        </span>
                      ) : a.type === "repo-filter" ? (
                        <span
                          className={`ml-auto flex shrink-0 items-center gap-1 pl-3 text-xs text-muted-foreground tabular-nums ${isActive ? "" : "opacity-50"}`}
                        >
                          <Kbd>↵</Kbd> Select
                        </span>
                      ) : a.type === "filter-list" ? (
                        <span
                          className={`ml-auto flex shrink-0 items-center gap-1 pl-3 text-xs text-muted-foreground tabular-nums ${isActive ? "" : "opacity-50"}`}
                        >
                          <Kbd>↵</Kbd> Filter list
                        </span>
                      ) : a.type === "qualifier" ? (
                        <span
                          className={`ml-auto flex shrink-0 items-center gap-1 pl-3 text-xs text-muted-foreground tabular-nums ${isActive ? "" : "opacity-50"}`}
                        >
                          <Kbd>↵</Kbd> Complete
                        </span>
                      ) : a.type === "dimension" ? (
                        <span
                          className={`ml-auto flex shrink-0 items-center gap-1 pl-3 text-xs text-muted-foreground tabular-nums ${isActive ? "" : "opacity-50"}`}
                        >
                          <Kbd>↵</Kbd> Browse
                        </span>
                      ) : a.type === "filter" ? (
                        <span
                          className={`ml-auto flex shrink-0 items-center gap-1 pl-3 text-xs text-muted-foreground tabular-nums ${isActive ? "" : "opacity-50"}`}
                        >
                          <Kbd>↵</Kbd> Filter
                        </span>
                      ) : entry.shortcut ? (
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
        {!trimmedTerm ? (
          <div className="border-t border-border/40 px-4 py-2 text-xs text-muted-foreground">
            Tip: the scopes above narrow the list. You can also type <Kbd>repo:</Kbd>, <Kbd>type:</Kbd>, <Kbd>state:</Kbd>, or <Kbd>age:</Kbd>.
          </div>
        ) : null}
        <div className="flex items-center gap-3 overflow-hidden border-t border-border/40 px-4 py-2 text-xs text-muted-foreground">
          <span className="flex shrink-0 items-center gap-1 whitespace-nowrap">
            <Kbd>↑</Kbd>
            <Kbd>↓</Kbd> <span className="ml-1">Navigate</span>
          </span>
          <span className="flex shrink-0 items-center gap-1 whitespace-nowrap">
            <Kbd>Enter</Kbd> <span className="ml-1">Select</span>
          </span>
          <span className="flex shrink-0 items-center gap-1 whitespace-nowrap">
            <Kbd>⇧↵</Kbd> <span className="ml-1">Filter</span>
          </span>
          <span className="flex shrink-0 items-center gap-1 whitespace-nowrap">
            <Kbd>Esc</Kbd> <span className="ml-1">Close</span>
          </span>
          <span className="ml-auto flex min-w-0 shrink-0 items-center gap-2">
            {scope !== "all" ? (
              <span className="hidden truncate sm:inline">
                {SCOPE_PREFIX[scope]} {scope} only
              </span>
            ) : null}
            <button
              type="button"
              onClick={() => {
                close();
                useUIStore.getState().openHelp();
              }}
              className="shrink-0 cursor-pointer underline-offset-2 transition-colors hover:text-accent-foreground hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              Syntax tips
            </button>
          </span>
        </div>
      </div>
    </div>
  );
}
