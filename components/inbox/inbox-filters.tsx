"use client";

import { Select } from "@/components/ui/select";
import { AGE_FILTERS } from "@/lib/filters";
import type { InboxFilters } from "@/lib/view-state";

export function InboxFilters({
  filters,
  onChange,
}: {
  filters: InboxFilters;
  onChange: (next: InboxFilters) => void;
}) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <label className="text-xs text-muted-foreground" htmlFor="age-filter">
        Age
      </label>
      <Select
        id="age-filter"
        value={filters.age}
        onChange={(e) =>
          onChange({ ...filters, age: e.target.value as InboxFilters["age"] })
        }
        aria-label="Filter by age"
      >
        {AGE_FILTERS.map((a) => (
          <option key={a.value} value={a.value}>
            {a.label}
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
