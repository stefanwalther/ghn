"use client";

import * as React from "react";
import { ChevronDown } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { RepoSnoozeMenu, useRowVisibility } from "@/components/inbox/repo-snooze-menu";
import type { DigestGroup } from "@/components/inbox/digest-section";
import { rankSearch } from "@/lib/search";
import { stripScopePrefix } from "@/lib/palette-commands";
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
  isSnoozed: boolean;
}

function SidebarButton({
  active,
  onClick,
  label,
  children,
  className,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      aria-current={active ? "true" : undefined}
      onClick={onClick}
      className={cn(
        "flex w-full cursor-pointer items-center justify-between gap-2 rounded-md px-3 py-1.5 text-left text-sm transition-colors duration-150 hover:bg-accent hover:text-accent-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
        active && "bg-sidebar-accent text-sidebar-accent-foreground",
        className
      )}
    >
      {children}
    </button>
  );
}

/** One repository filter row with hover actions and a right-click menu. */
function RepoFilterRow({
  repo: r,
  active,
  onRepo,
  onSnooze,
  snoozeDisabled,
  snoozedSection,
  onMarkAllDone,
  markAllDoneBusy,
  onMarkAllRead,
  markAllReadBusy,
  onCopied,
}: {
  repo: RepoFacet;
  active: boolean;
  onRepo: (repo: string) => void;
  onSnooze?: (id: string, snoozedUntil: number | null) => void;
  snoozeDisabled?: boolean;
  snoozedSection?: boolean;
  onMarkAllDone?: (id: string) => void;
  markAllDoneBusy?: boolean;
  onMarkAllRead?: (id: string) => void;
  markAllReadBusy?: boolean;
  onCopied?: (id: string, ok: boolean) => void;
}) {
  const { visible, rowHandlers } = useRowVisibility();
  const [contextAnchor, setContextAnchor] = React.useState<{ x: number; y: number } | null>(null);
  const pendingTotal = r.main + r.quiet;
  // Actionable counts fall back to the visible total for payloads that
  // predate the pending/unread facet fields (tests, cached responses).
  const doneable = r.pending ?? pendingTotal;
  const readable = r.unread ?? pendingTotal;
  return (
    <div
      className="relative"
      {...rowHandlers}
      onContextMenu={(e) => {
        e.preventDefault();
        e.stopPropagation();
        setContextAnchor({ x: e.clientX, y: e.clientY });
      }}
    >
      <SidebarButton
        active={active}
        label={`Filter by ${r.fullName}`}
        onClick={() => onRepo(active ? "all" : r.id)}
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
      {onSnooze ? (
        <RepoSnoozeMenu
          repoId={r.id}
          fullName={r.fullName}
          isSnoozed={r.isSnoozed}
          disabled={snoozeDisabled}
          onSnooze={onSnooze}
          onMarkAllDone={onMarkAllDone}
          markAllDoneDisabled={markAllDoneBusy || doneable === 0}
          markAllDoneCount={doneable}
          onMarkAllRead={onMarkAllRead}
          markAllReadDisabled={markAllReadBusy || readable === 0}
          markAllReadCount={readable}
          onCopied={onCopied}
          visible={visible}
          contextAnchor={contextAnchor}
          onContextClose={() => setContextAnchor(null)}
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
  onMarkAllDone,
  markAllDoneBusy,
  onMarkAllRead,
  markAllReadBusy,
  onCopied,
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
  onMarkAllDone?: (id: string) => void;
  markAllDoneBusy?: boolean;
  onMarkAllRead?: (id: string) => void;
  markAllReadBusy?: boolean;
  onCopied?: (id: string, ok: boolean) => void;
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
  const activeSnoozedName = snoozedRepos.find((r) => r.id === activeRepo)?.fullName;
  const quietTotal = quietGroups.reduce((n, g) => n + g.pendingCount, 0);

  return (
    <div className="flex flex-col gap-6">
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
          <div className="relative px-0 pb-1">
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
              onRepo={onRepo}
              onSnooze={onSnooze}
              snoozeDisabled={snoozeDisabled}
              onMarkAllDone={onMarkAllDone}
              markAllDoneBusy={markAllDoneBusy}
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
              onRepo={onRepo}
              onSnooze={onSnooze}
              snoozeDisabled={snoozeDisabled}
              snoozedSection
              onMarkAllDone={onMarkAllDone}
              markAllDoneBusy={markAllDoneBusy}
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
