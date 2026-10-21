"use client";

import * as React from "react";
import { ChevronDown } from "lucide-react";
import { Badge } from "@/components/ui/badge";
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
  isSnoozed: boolean;
}

function SidebarButton({
  active,
  onClick,
  label,
  children,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      aria-current={active ? "true" : undefined}
      onClick={onClick}
      className={cn(
        "flex w-full cursor-pointer items-center justify-between gap-2 rounded-md px-3 py-1.5 text-left text-sm transition-colors duration-150 hover:bg-accent hover:text-accent-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
        active && "bg-sidebar-accent text-sidebar-accent-foreground"
      )}
    >
      {children}
    </button>
  );
}

export function FilterSidebar({
  types,
  activeType,
  repos,
  activeRepo,
  onType,
  onRepo,
}: {
  types: TypeFacet[];
  activeType: string;
  repos: RepoFacet[];
  activeRepo: string;
  onType: (type: string) => void;
  onRepo: (repo: string) => void;
}) {
  // Render open on the server and first client paint; saved prefs apply after
  // mount so hydration stays consistent.
  const [collapsed, setCollapsed] = React.useState({ types: false, repos: false });

  React.useEffect(() => {
    try {
      const saved = localStorage.getItem("quiet-notifications:filter-sections");
      if (saved) setCollapsed({ types: false, repos: false, ...JSON.parse(saved) });
    } catch {
      // ignore corrupt prefs and keep both sections open
    }
  }, []);

  function toggle(key: "types" | "repos") {
    setCollapsed((prev) => {
      const next = { ...prev, [key]: !prev[key] };
      try {
        localStorage.setItem("quiet-notifications:filter-sections", JSON.stringify(next));
      } catch {
        // ignore private-mode writes; collapsing still works for the session
      }
      return next;
    });
  }

  const activeTypeLabel = types.find((t) => t.value === activeType)?.label;
  const activeRepoName = repos.find((r) => r.id === activeRepo)?.fullName;
  const visibleRepos = repos.filter(
    (r) => r.id === activeRepo || r.main > 0
  );

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
          {visibleRepos.map((r) => {
            const active = activeRepo === r.id;
            return (
              <SidebarButton
                key={r.id}
                active={active}
                label={`Filter by ${r.fullName}`}
                onClick={() => onRepo(active ? "all" : r.id)}
              >
                <span className="min-w-0 flex-1 truncate" title={r.fullName}>
                  {r.fullName}
                  {r.isSnoozed ? " · snoozed" : ""}
                </span>
                <span className="flex items-center gap-1">
                  {r.quiet > 0 ? (
                    <span className="text-xs text-muted-foreground">+{r.quiet}</span>
                  ) : null}
                  <Badge variant="muted">{r.main}</Badge>
                </span>
              </SidebarButton>
            );
          })}
        </div>
        )}
      </section>
    </div>
  );
}
