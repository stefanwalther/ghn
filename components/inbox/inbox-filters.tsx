"use client";

import { Select } from "@/components/ui/select";
import type { InboxFilters } from "@/lib/view-state";

export function InboxFilters({
  filters,
  repoOptions,
  onChange,
}: {
  filters: InboxFilters;
  repoOptions: { id: string; fullName: string }[];
  onChange: (next: InboxFilters) => void;
}) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <label className="text-xs text-muted-foreground" htmlFor="repo-filter">
        Repository
      </label>
      <Select
        id="repo-filter"
        value={filters.repo}
        onChange={(e) => onChange({ ...filters, repo: e.target.value })}
        aria-label="Filter by repository"
      >
        <option value="all">All repositories</option>
        {repoOptions.map((r) => (
          <option key={r.id} value={r.id}>
            {r.fullName}
          </option>
        ))}
      </Select>
      <label className="text-xs text-muted-foreground" htmlFor="state-filter">
        State
      </label>
      <Select
        id="state-filter"
        value={filters.state}
        onChange={(e) =>
          onChange({ ...filters, state: e.target.value as InboxFilters["state"] })
        }
        aria-label="Filter by state"
      >
        <option value="unread">Unread</option>
        <option value="all">All open</option>
        <option value="done">Done</option>
      </Select>
    </div>
  );
}
