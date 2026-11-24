"use client";

import { Checkbox } from "@/components/ui/checkbox";
import { AGE_FILTERS } from "@/lib/filters";
import { toggleAge, toggleState, type InboxFilters, type StateFilter } from "@/lib/view-state";

const STATE_OPTIONS: { value: StateFilter; label: string }[] = [
  { value: "unread", label: "Unread" },
  { value: "done", label: "Done" },
];

export function InboxFilters({
  filters,
  onChange,
}: {
  filters: InboxFilters;
  onChange: (next: InboxFilters) => void;
}) {
  return (
    <div className="flex flex-wrap items-center gap-x-5 gap-y-2">
      <fieldset className="flex flex-wrap items-center gap-2">
        <legend className="sr-only">Filter by age</legend>
        <span aria-hidden="true" className="text-xs text-muted-foreground">
          Age
        </span>
        {AGE_FILTERS.map((a) => {
          const checked =
            a.value === "all" ? filters.ages.length === 0 : filters.ages.includes(a.value);
          return (
            <label
              key={a.value}
              className="flex cursor-pointer items-center gap-1.5 text-sm"
            >
              <Checkbox
                checked={checked}
                onChange={() =>
                  onChange({
                    ...filters,
                    ages: toggleAge(filters.ages, a.value),
                  })
                }
                aria-label={`Filter by age ${a.label}`}
              />
              <span className={checked ? "" : "text-muted-foreground"}>{a.label}</span>
            </label>
          );
        })}
      </fieldset>
      <fieldset className="flex flex-wrap items-center gap-2">
        <legend className="sr-only">Filter by state</legend>
        <span aria-hidden="true" className="text-xs text-muted-foreground">
          State
        </span>
        {STATE_OPTIONS.map((s) => {
          const checked = filters.states.includes(s.value);
          return (
            <label
              key={s.value}
              className="flex cursor-pointer items-center gap-1.5 text-sm"
            >
              <Checkbox
                checked={checked}
                onChange={() =>
                  onChange({
                    ...filters,
                    states: toggleState(filters.states, s.value),
                  })
                }
                aria-label={`Filter by state ${s.label}`}
              />
              <span className={checked ? "" : "text-muted-foreground"}>{s.label}</span>
            </label>
          );
        })}
      </fieldset>
    </div>
  );
}
