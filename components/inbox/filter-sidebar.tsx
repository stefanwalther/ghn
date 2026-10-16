"use client";

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
  return (
    <div className="flex flex-col gap-6">
      <section aria-label="Type filters">
        <h2 className="mb-1 px-3 text-xs font-medium text-muted-foreground">Filters</h2>
        <div className="flex flex-col gap-0.5">
          {types.map((t) => {
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
        </div>
      </section>
      <section aria-label="Repository filters">
        <h2 className="mb-1 px-3 text-xs font-medium text-muted-foreground">Repositories</h2>
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
          {repos.map((r) => {
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
      </section>
    </div>
  );
}
