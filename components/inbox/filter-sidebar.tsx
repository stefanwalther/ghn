"use client";

import * as React from "react";
import { ChevronDown } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { RepoBulkMenu, RepoSnoozeMenu, useRowVisibility } from "@/components/inbox/repo-snooze-menu";
import type { RepoBulkTarget } from "@/components/inbox/repo-snooze-menu";
import type { DigestGroup } from "@/components/inbox/digest-section";
import { rankSearch } from "@/lib/search";
import { stripScopePrefix } from "@/lib/palette-commands";
import { nextSelection, rangeSelection, summarizeRepoSelection } from "@/lib/inbox-state";
import type { RepoSelectionSummary } from "@/lib/inbox-state";
import { cn } from "@/lib/utils";

export interface TypeFacet {
  value: string;
  label: string;
  count: number;
}

export interface RepoFacet {
  id: string;
  fullName: string;
  main: number;
  quiet: number;
  /** Not-done rows among the current filter; drives the done button. */
  pending?: number;
  /** Unread rows among the current filter; drives the read button. */
  unread?: number;
  /** All unread rows in the repository, ignoring the current filter;
   * matches the repo-wide read action so done-only repos stay actionable. */
  readable?: number;
  /** All not-done rows in the repository, ignoring the current filter;
   * matches the repo-wide done action. */
  pendingAll?: number;
  isSnoozed: boolean;
  rhythm?: string;
}

function SidebarButton({
  active,
  selected,
  rowId,
  onClick,
  label,
  children,
  className,
}: {
  active: boolean;
  selected?: boolean;
  /** Repository id; rendered as data-repo-row for arrow-key focus moves. */
  rowId?: string;
  onClick: (e: React.MouseEvent) => void;
  label: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      aria-current={active ? "true" : undefined}
      aria-pressed={rowId === undefined ? undefined : (selected ?? false)}
      data-repo-row={rowId}
      onClick={onClick}
      className={cn(
        "flex w-full cursor-pointer items-center justify-between gap-2 rounded-md px-3 py-1.5 text-left text-sm transition-colors duration-150 hover:bg-accent hover:text-accent-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
        active && "bg-sidebar-accent text-sidebar-accent-foreground",
        selected && !active && "bg-accent/60 text-accent-foreground",
        selected && active && "ring-2 ring-inset ring-ring",
        className
      )}
    >
      {children}
    </button>
  );
}

/** Bulk intent handlers plus the resolved selection, or null for single menus. */
export interface RepoBulkContext {
  members: RepoBulkTarget[];
  summary: RepoSelectionSummary;
  onSnooze: (ids: string[], snoozedUntil: number | null) => void;
  onRhythm: (ids: string[], rhythm: string) => void;
  rhythmDisabled?: boolean;
  onMarkAllDone: (ids: string[]) => void;
  markAllDoneDisabled?: boolean;
  onMarkAllRead: (ids: string[]) => void;
  markAllReadDisabled?: boolean;
  onCopied?: (ids: string[], ok: boolean) => void;
  /** True when any selected member has an update in flight. */
  anyBusy: boolean;
}

/** One repository filter row with hover actions and a right-click menu. */
function RepoFilterRow({
  repo: r,
  active,
  selected,
  bulk,
  onClearSelection,
  onRowClick,
  onRowKeyDown,
  onSnooze,
  snoozeDisabled,
  onRhythm,
  rhythmDisabled,
  snoozedSection,
  onMarkAllDone,
  markAllDoneBusy,
  busyRepoIds,
  onMarkAllRead,
  markAllReadBusy,
  onCopied,
}: {
  repo: RepoFacet;
  active: boolean;
  /** Whether this row is part of the multi-selection. */
  selected: boolean;
  /** Resolved bulk context; null renders the single-row menu. */
  bulk: RepoBulkContext | null;
  onClearSelection: () => void;
  onRowClick: (repo: RepoFacet, e: React.MouseEvent) => void;
  onRowKeyDown: (repo: RepoFacet, e: React.KeyboardEvent) => void;
  onSnooze?: (id: string, snoozedUntil: number | null) => void;
  snoozeDisabled?: boolean;
  onRhythm?: (id: string, rhythm: string) => void;
  rhythmDisabled?: boolean;
  snoozedSection?: boolean;
  onMarkAllDone?: (id: string) => void;
  markAllDoneBusy?: boolean;
  /** Per-repo pending set; when provided it replaces the global busy flag. */
  busyRepoIds?: Set<string>;
  onMarkAllRead?: (id: string) => void;
  markAllReadBusy?: boolean;
  onCopied?: (id: string, ok: boolean) => void;
}) {
  const { visible, reset, rowHandlers } = useRowVisibility();
  const [contextAnchor, setContextAnchor] = React.useState<{ x: number; y: number } | null>(null);
  const [bulkAnchor, setBulkAnchor] = React.useState<{ x: number; y: number } | null>(null);
  // A selected row with a bulk context opens the combined menu; anywhere
  // else the prior selection clears and the single-row menu targets one repo.
  const isBulkTarget = selected && bulk !== null;
  const pendingTotal = r.main + r.quiet;
  // Actionable counts fall back to the visible total for payloads that
  // predate the facet fields (tests, cached responses).
  // Readable and pendingAll are repo-wide (ignore the current filter) so
  // they stay correct for repos hidden by it; pending/unread describe the
  // current view and come next in the fallback chain.
  const doneable = r.pendingAll ?? r.pending ?? pendingTotal;
  const readable = r.readable ?? r.unread ?? pendingTotal;
  const repoBusy = busyRepoIds?.has(r.id) ?? false;
  const doneBusy = repoBusy || (markAllDoneBusy ?? false);
  const readBusy = repoBusy || (markAllReadBusy ?? false);
  return (
    <div
      className="relative"
      {...rowHandlers}
      onContextMenu={(e) => {
        e.preventDefault();
        e.stopPropagation();
        if (isBulkTarget) setBulkAnchor({ x: e.clientX, y: e.clientY });
        else {
          onClearSelection();
          setContextAnchor({ x: e.clientX, y: e.clientY });
        }
      }}
      // Row-level keyboard handling covers the filter button and the
      // hover "..." trigger alike: Escape with the trigger focused clears
      // the selection after the menu closed, and Shift+Arrow never reaches
      // the inbox list behind the sidebar.
      onKeyDown={(e) => onRowKeyDown(r, e)}
    >
      <SidebarButton
        active={active}
        selected={selected}
        rowId={r.id}
        label={`Filter by ${r.fullName}`}
        onClick={(e) => onRowClick(r, e)}
        className="min-w-0 flex-1"
      >
        <span className="min-w-0 flex-1 truncate" title={r.fullName}>
          {r.fullName}
          {r.isSnoozed && !snoozedSection ? " · snoozed" : ""}
        </span>
        <span className="flex items-center gap-1">
          {r.quiet > 0 ? (
            <span className="text-xs text-muted-foreground">+{r.quiet}</span>
          ) : null}
          <Badge variant="muted">{r.main}</Badge>
        </span>
      </SidebarButton>
      {isBulkTarget && bulk ? (
        <RepoBulkMenu
          targets={bulk.members}
          summary={bulk.summary}
          anchorId={r.id}
          disabled={snoozeDisabled}
          onSnooze={bulk.onSnooze}
          onRhythm={bulk.onRhythm}
          rhythmDisabled={bulk.rhythmDisabled ?? snoozeDisabled}
          bulkBusy={bulk.anyBusy}
          onMarkAllDone={bulk.onMarkAllDone}
          markAllDoneDisabled={bulk.markAllDoneDisabled ?? (doneBusy || bulk.anyBusy)}
          onMarkAllRead={bulk.onMarkAllRead}
          markAllReadDisabled={bulk.markAllReadDisabled ?? (readBusy || bulk.anyBusy)}
          onCopied={bulk.onCopied}
          visible={visible}
          contextAnchor={bulkAnchor}
          onContextClose={() => setBulkAnchor(null)}
          onVisibilityReset={reset}
          triggerClassName="bg-background"
          triggerStyle={{
            position: "absolute",
            top: "50%",
            right: 4,
            transform: "translateY(-50%)",
          }}
        />
      ) : (onSnooze || onRhythm) ? (
        <RepoSnoozeMenu
          repoId={r.id}
          fullName={r.fullName}
          isSnoozed={r.isSnoozed}
          disabled={snoozeDisabled}
          onSnooze={onSnooze}
          currentRhythm={r.rhythm}
          onRhythm={onRhythm}
          rhythmDisabled={rhythmDisabled ?? snoozeDisabled}
          onMarkAllDone={onMarkAllDone}
          markAllDoneDisabled={doneBusy || doneable === 0}
          markAllDoneCount={doneable}
          markAllDoneMain={r.main}
          markAllDoneQuiet={r.quiet}
          onMarkAllRead={onMarkAllRead}
          markAllReadDisabled={readBusy || readable === 0}
          markAllReadCount={readable}
          onCopied={onCopied}
          visible={visible}
          contextAnchor={contextAnchor}
          onContextClose={() => setContextAnchor(null)}
          onVisibilityReset={reset}
          triggerClassName="bg-background"
          triggerStyle={{
            position: "absolute",
            top: "50%",
            right: 4,
            transform: "translateY(-50%)",
          }}
        />
      ) : null}
    </div>
  );
}

/** Sidebar with type filters, repository filters, snoozed and quiet digests. */
export function FilterSidebar({
  types,
  activeType,
  repos,
  activeRepo,
  onType,
  onRepo,
  onSnooze,
  snoozeDisabled,
  onRhythm,
  rhythmDisabled,
  onMarkAllDone,
  markAllDoneBusy,
  busyRepoIds,
  onMarkAllRead,
  markAllReadBusy,
  onCopied,
  onBulkSnooze,
  onBulkRhythm,
  onBulkDone,
  onBulkRead,
  onBulkCopied,
  quietGroups = [],
  quietActive = false,
  onQuietView,
  repoFilter,
  onRepoFilterChange,
}: {
  types: TypeFacet[];
  activeType: string;
  repos: RepoFacet[];
  activeRepo: string;
  onType: (type: string) => void;
  onRepo: (repo: string) => void;
  onSnooze?: (id: string, snoozedUntil: number | null) => void;
  snoozeDisabled?: boolean;
  onRhythm?: (id: string, rhythm: string) => void;
  rhythmDisabled?: boolean;
  onMarkAllDone?: (id: string) => void;
  markAllDoneBusy?: boolean;
  /** Per-repo pending set; when provided it replaces the global busy flag. */
  busyRepoIds?: Set<string>;
  onMarkAllRead?: (id: string) => void;
  markAllReadBusy?: boolean;
  onCopied?: (id: string, ok: boolean) => void;
  /** Bulk fan-out intents; all four enable the combined menu for selections. */
  onBulkSnooze?: (ids: string[], snoozedUntil: number | null) => void;
  onBulkRhythm?: (ids: string[], rhythm: string) => void;
  onBulkDone?: (ids: string[]) => void;
  onBulkRead?: (ids: string[]) => void;
  onBulkCopied?: (ids: string[], ok: boolean) => void;
  quietGroups?: DigestGroup[];
  quietActive?: boolean;
  onQuietView?: () => void;
  /** Optional controlled repo-list filter; falls back to local state. */
  repoFilter?: string;
  onRepoFilterChange?: (query: string) => void;
}) {
  // Render open on the server and first client paint; saved prefs apply after
  // mount so hydration stays consistent.
  const [collapsed, setCollapsed] = React.useState({
    types: false,
    repos: false,
    snoozed: false,
    quiet: false,
  });
  // Multi-selection working set, independent of the active inbox filter.
  // Empty means nothing selected; anchorId bases Shift-range extension.
  const [selected, setSelected] = React.useState<Set<string>>(new Set());
  const [anchorId, setAnchorId] = React.useState<string | null>(null);
  // Controlled when the inbox wires the palette handoff through; otherwise
  // local so the sidebar works standalone in tests and embeds.
  const [internalFilter, setInternalFilter] = React.useState("");
  const repoQuery = repoFilter ?? internalFilter;
  const setRepoQuery = onRepoFilterChange ?? setInternalFilter;

  React.useEffect(() => {
    try {
      const saved = localStorage.getItem("ghn:filter-sections");
      if (saved)
        setCollapsed({
          types: false,
          repos: false,
          snoozed: false,
          quiet: false,
          ...JSON.parse(saved),
        });
    } catch {
      // ignore corrupt prefs and keep both sections open
    }
  }, []);

  function toggle(key: "types" | "repos" | "snoozed" | "quiet") {
    setCollapsed((prev) => {
      const next = { ...prev, [key]: !prev[key] };
      try {
        localStorage.setItem("ghn:filter-sections", JSON.stringify(next));
      } catch {
        // ignore private-mode writes; collapsing still works for the session
      }
      return next;
    });
  }

  const activeTypeLabel = types.find((t) => t.value === activeType)?.label;
  const activeRepoName = repos.find((r) => r.id === activeRepo)?.fullName;
  // Badge shows main, so visibility follows main/quiet only. readable and
  // pendingAll stay for the row actions (Mark all read/done) but must not
  // keep a 0-badge row in the list. The active repo stays pinned so the
  // current filter never vanishes from under the user.
  const visibleRepos = repos.filter(
    (r) => r.id === activeRepo || r.main > 0 || r.quiet > 0
  );
  // Same fuzzy engine as the command palette, so a palette query handed
  // off here behaves identically. Scope qualifiers (`repo:`, `type:`…)
  // are stripped: this box already lists only repositories, and the
  // active repo stays pinned so the current filter never vanishes from
  // under the user.
  const trimmedQuery = stripScopePrefix(repoQuery).trim();
  const searchedRepos = trimmedQuery
    ? rankSearch(trimmedQuery, visibleRepos, (r) => [r.fullName], visibleRepos.length).map(
        (r) => r.item
      )
    : visibleRepos;
  const listedRepos =
    activeRepo !== "all" && trimmedQuery
      ? searchedRepos.some((r) => r.id === activeRepo)
        ? searchedRepos
        : [
            ...visibleRepos.filter((r) => r.id === activeRepo),
            ...searchedRepos,
          ]
      : searchedRepos;
  const regularRepos = listedRepos.filter((r) => !r.isSnoozed);
  const snoozedRepos = listedRepos.filter((r) => r.isSnoozed);
  // Display order for Shift-range extension and arrow-key moves: only rows
  // currently rendered (regular and snoozed sections, unless collapsed),
  // regulars in facet order, then snoozed rows in facet order. Hidden
  // selections stay selected but are never range or focus targets.
  const displayIds = [
    ...(collapsed.repos ? [] : regularRepos),
    ...(collapsed.snoozed ? [] : snoozedRepos),
  ].map((r) => r.id);
  const activeSnoozedName = snoozedRepos.find((r) => r.id === activeRepo)?.fullName;
  // Resolved bulk context for the combined menu. Members cover the whole
  // selection by repository identity (visible members in display order,
  // hidden members appended in facet order) so search-hidden selections
  // stay included; counts derive from the same facet fields as the single menu.
  const visibleIdSet = new Set(displayIds);
  const memberIds = [
    ...displayIds.filter((id) => selected.has(id)),
    ...repos.map((r) => r.id).filter((id) => selected.has(id) && !visibleIdSet.has(id)),
  ];
  const bulk: RepoBulkContext | null =
    onBulkSnooze && onBulkRhythm && onBulkDone && onBulkRead && selected.size > 0
      ? {
          members: memberIds.map((id) => {
            const facet = repos.find((r) => r.id === id);
            return {
              id,
              fullName: facet?.fullName ?? id,
              isSnoozed: facet?.isSnoozed ?? false,
              rhythm: facet?.rhythm,
            };
          }),
          summary: summarizeRepoSelection(repos, [...selected]),
          onSnooze: onBulkSnooze,
          onRhythm: onBulkRhythm,
          rhythmDisabled,
          onMarkAllDone: onBulkDone,
          onMarkAllRead: onBulkRead,
          onCopied: onBulkCopied,
          anyBusy: memberIds.some((id) => busyRepoIds?.has(id) ?? false),
        }
      : null;
  const quietTotal = quietGroups.reduce((n, g) => n + g.pendingCount, 0);

  function clearSelection() {
    setSelected(new Set());
    setAnchorId(null);
  }

  /** Modifier-aware row activation: range, toggle, or plain filter. */
  function handleRowClick(repo: RepoFacet, e: React.MouseEvent) {
    // Shift wins over Ctrl/Cmd so combined modifiers extend the range
    // instead of toggling a single row.
    if (e.shiftKey) {
      const base = anchorId ?? repo.id;
      if (anchorId === null) setAnchorId(repo.id);
      setSelected((prev) => rangeSelection(displayIds, base, repo.id, prev));
      return;
    }
    if (e.ctrlKey || e.metaKey) {
      setSelected((prev) =>
        nextSelection(
          displayIds.map((id) => ({ id })),
          prev,
          repo.id
        )
      );
      setAnchorId(repo.id);
      return;
    }
    clearSelection();
    onRepo(activeRepo === repo.id ? "all" : repo.id);
  }

  /** Escape clears; Shift+Arrow extends a range and moves focus. */
  function handleRowKeyDown(repo: RepoFacet, e: React.KeyboardEvent) {
    if (e.key === "Escape") {
      clearSelection();
      return;
    }
    if (e.shiftKey && (e.key === "ArrowDown" || e.key === "ArrowUp")) {
      e.preventDefault();
      // The inbox list owns window-level arrow handling; stop here so the
      // focused notification row does not also move behind the sidebar.
      e.stopPropagation();
      const idx = displayIds.indexOf(repo.id);
      const next = idx === -1 ? undefined : displayIds[idx + (e.key === "ArrowDown" ? 1 : -1)];
      if (!next) return;
      const base = anchorId ?? repo.id;
      if (anchorId === null) setAnchorId(repo.id);
      setSelected((prev) => rangeSelection(displayIds, base, next, prev));
      requestAnimationFrame(() => {
        const el = document.querySelector(`[data-repo-row="${next}"]`);
        if (el instanceof HTMLElement) el.focus();
      });
    }
  }

  /** Clicks landing on sidebar chrome (not controls) clear the selection. */
  function handleContainerClick(e: React.MouseEvent) {
    const target = e.target as HTMLElement | null;
    if (target?.closest?.("button, input, a, [role='menu'], [role='dialog']")) return;
    if (selected.size > 0) clearSelection();
  }

  return (
    <div className="flex flex-col gap-6" onClick={handleContainerClick}>
      <section aria-label="Type filters">
        <button
          type="button"
          aria-expanded={!collapsed.types}
          aria-label={collapsed.types ? "Expand type filters" : "Collapse type filters"}
          onClick={() => toggle("types")}
          className="mb-1 flex w-full cursor-pointer items-center justify-between gap-2 rounded-md px-3 py-1 text-xs font-medium text-muted-foreground transition-colors duration-150 hover:bg-accent hover:text-accent-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <span className="min-w-0 truncate text-left">
            Filters
            {collapsed.types && activeType !== "all" && activeTypeLabel
              ? ` · ${activeTypeLabel}`
              : ""}
          </span>
          <ChevronDown
            className={cn(
              "h-3.5 w-3.5 shrink-0 transition-transform duration-150",
              collapsed.types && "-rotate-90"
            )}
            aria-hidden
          />
        </button>
        {collapsed.types ? null : (
        <div className="flex flex-col gap-0.5">
          {(() => {
            const allFacet = types.find((t) => t.value === "all");
            const rest = types.filter((t) => t.value !== "all");
            const allActive = activeType === "all";
            return (
              <>
                <SidebarButton
                  active={allActive}
                  label="Show all"
                  onClick={() => onType("all")}
                >
                  <span className="truncate">All</span>
                  <Badge variant="muted">{allFacet?.count ?? 0}</Badge>
                </SidebarButton>
                {rest.map((t) => {
                  const active = activeType === t.value;
                  return (
                    <SidebarButton
                      key={t.value}
                      active={active}
                      label={`Filter by ${t.label}`}
                      onClick={() => onType(active ? "all" : t.value)}
                    >
                      <span className="truncate">{t.label}</span>
                      <Badge variant="muted">{t.count}</Badge>
                    </SidebarButton>
                  );
                })}
              </>
            );
          })()}
        </div>
        )}
      </section>
      <section aria-label="Repository filters">
        <button
          type="button"
          aria-expanded={!collapsed.repos}
          aria-label={collapsed.repos ? "Expand repository filters" : "Collapse repository filters"}
          onClick={() => toggle("repos")}
          className="mb-1 flex w-full cursor-pointer items-center justify-between gap-2 rounded-md px-3 py-1 text-xs font-medium text-muted-foreground transition-colors duration-150 hover:bg-accent hover:text-accent-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <span className="min-w-0 truncate text-left">
            Repositories
            {collapsed.repos && activeRepo !== "all" && activeRepoName
              ? ` · ${activeRepoName}`
              : ""}
          </span>
          <ChevronDown
            className={cn(
              "h-3.5 w-3.5 shrink-0 transition-transform duration-150",
              collapsed.repos && "-rotate-90"
            )}
            aria-hidden
          />
        </button>
        {collapsed.repos ? null : (
        <div className="flex flex-col gap-0.5">
          {/* px-1 keeps the input visually full-width while leaving room
          for its border and focus ring: at px-0 both are flush with the
          scrollable aside edge and the right side is clipped. */}
          <div className="relative px-1 pb-1">
            <span aria-hidden="true" className="pointer-events-none absolute top-1/2 left-3 -translate-y-[calc(50%+2px)] text-muted-foreground">⌕</span>
            <input
              type="search"
              value={repoQuery}
              onChange={(e) => setRepoQuery(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Escape" && repoQuery) {
                  e.stopPropagation();
                  setRepoQuery("");
                }
              }}
              placeholder="Filter repositories…"
              aria-label="Filter repositories"
              autoComplete="off"
              spellCheck={false}
              className="h-8 w-full rounded-md border border-input bg-background pr-7 pl-8 text-sm outline-none placeholder:text-muted-foreground focus-visible:ring-2 focus-visible:ring-ring [&::-webkit-search-cancel-button]:hidden"
            />
            {repoQuery ? (
              <button
                type="button"
                aria-label="Clear repository filter"
                onClick={() => setRepoQuery("")}
                className="absolute top-1/2 right-1 -translate-y-[calc(50%+2px)] cursor-pointer rounded px-1.5 text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                ×
              </button>
            ) : null}
          </div>
          {trimmedQuery ? (
            <p className="px-3 pb-1 text-xs text-muted-foreground" role="status">
              {listedRepos.length === 0
                ? `No repositories match “${trimmedQuery}”.`
                : `${listedRepos.length} of ${visibleRepos.length} repositories`}
            </p>
          ) : null}
          <SidebarButton
            active={activeRepo === "all"}
            label="Show all repositories"
            onClick={() => onRepo("all")}
          >
            <span className="truncate">All repositories</span>
            <Badge variant="muted">
              {repos.reduce((n, r) => n + r.main, 0)}
            </Badge>
          </SidebarButton>
          {regularRepos.map((r) => (
            <RepoFilterRow
              key={r.id}
              repo={r}
              active={activeRepo === r.id}
              selected={selected.has(r.id)}
              bulk={bulk}
              onClearSelection={clearSelection}
              onRowClick={handleRowClick}
              onRowKeyDown={handleRowKeyDown}
              onSnooze={onSnooze}
              snoozeDisabled={snoozeDisabled}
              onRhythm={onRhythm}
              rhythmDisabled={rhythmDisabled}
              onMarkAllDone={onMarkAllDone}
              markAllDoneBusy={markAllDoneBusy}
              busyRepoIds={busyRepoIds}
              onMarkAllRead={onMarkAllRead}
              markAllReadBusy={markAllReadBusy}
              onCopied={onCopied}
            />
          ))}
          {trimmedQuery && regularRepos.length === 0 && snoozedRepos.length === 0 ? (
            <button
              type="button"
              onClick={() => setRepoQuery("")}
              className="cursor-pointer rounded-md px-3 py-2 text-left text-sm text-muted-foreground underline-offset-2 transition-colors hover:bg-accent hover:text-accent-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              Clear the filter to see every repository.
            </button>
          ) : null}
        </div>
        )}
      </section>
      {snoozedRepos.length > 0 ? (
      <section aria-label="Snoozed repositories">
        <button
          type="button"
          aria-expanded={!collapsed.snoozed}
          aria-label={collapsed.snoozed ? "Expand snoozed repositories" : "Collapse snoozed repositories"}
          onClick={() => toggle("snoozed")}
          className="mb-1 flex w-full cursor-pointer items-center justify-between gap-2 rounded-md px-3 py-1 text-xs font-medium text-muted-foreground transition-colors duration-150 hover:bg-accent hover:text-accent-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <span className="min-w-0 truncate text-left">
            Snoozed ({snoozedRepos.length})
            {collapsed.snoozed && activeSnoozedName ? ` · ${activeSnoozedName}` : ""}
          </span>
          <ChevronDown
            className={cn(
              "h-3.5 w-3.5 shrink-0 transition-transform duration-150",
              collapsed.snoozed && "-rotate-90"
            )}
            aria-hidden
          />
        </button>
        {collapsed.snoozed ? null : (
        <div className="flex flex-col gap-0.5">
          {snoozedRepos.map((r) => (
            <RepoFilterRow
              key={r.id}
              repo={r}
              active={activeRepo === r.id}
              selected={selected.has(r.id)}
              bulk={bulk}
              onClearSelection={clearSelection}
              onRowClick={handleRowClick}
              onRowKeyDown={handleRowKeyDown}
              onSnooze={onSnooze}
              snoozeDisabled={snoozeDisabled}
              onRhythm={onRhythm}
              rhythmDisabled={rhythmDisabled}
              snoozedSection
              onMarkAllDone={onMarkAllDone}
              markAllDoneBusy={markAllDoneBusy}
              busyRepoIds={busyRepoIds}
              onMarkAllRead={onMarkAllRead}
              markAllReadBusy={markAllReadBusy}
              onCopied={onCopied}
            />
          ))}
        </div>
        )}
      </section>
      ) : null}
      {quietGroups.length > 0 ? (
      <section aria-label="Quiet digests">
        <button
          type="button"
          aria-expanded={!collapsed.quiet}
          aria-label={collapsed.quiet ? "Expand quiet digests" : "Collapse quiet digests"}
          onClick={() => toggle("quiet")}
          className="mb-1 flex w-full cursor-pointer items-center justify-between gap-2 rounded-md px-3 py-1 text-xs font-medium text-muted-foreground transition-colors duration-150 hover:bg-accent hover:text-accent-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <span className="min-w-0 truncate text-left">
            Quiet until due ({quietTotal} pending)
          </span>
          <ChevronDown
            className={cn(
              "h-3.5 w-3.5 shrink-0 transition-transform duration-150",
              collapsed.quiet && "-rotate-90"
            )}
            aria-hidden
          />
        </button>
        {collapsed.quiet ? null : (
        <div className="flex flex-col gap-0.5">
          <SidebarButton
            active={quietActive}
            label="Show all quiet repositories"
            onClick={() => onQuietView?.()}
          >
            <span className="truncate">All repositories</span>
            <Badge variant="muted">{quietTotal}</Badge>
          </SidebarButton>
        </div>
        )}
      </section>
      ) : null}
    </div>
  );
}
