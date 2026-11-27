"use client";

import { FilterDropdown, type FilterDropdownOption } from "@/components/ui/filter-dropdown";
import { AGE_FILTERS, type AgeFilter } from "@/lib/filters";
import {
  isUnreadOnly,
  toggleState,
  type InboxFilters,
  type StateFilter,
} from "@/lib/view-state";

const AGE_LABELS = new Map<AgeFilter, string>(
  AGE_FILTERS.map((a) => [a.value, a.label])
);

const AGE_OPTIONS: FilterDropdownOption[] = AGE_FILTERS.filter(
  (a) => a.value !== "all"
).map((a) => ({
  value: a.value,
  label: a.label,
  ariaLabel: `Filter by age ${a.label}`,
}));

const STATE_OPTIONS: FilterDropdownOption[] = [
  { value: "unread", label: "Unread", ariaLabel: "Filter by state Unread" },
  { value: "done", label: "Done", ariaLabel: "Filter by state Done" },
];

function summarizeAges(ages: AgeFilter[]): string {
  if (ages.length === 0) return "All time";
  if (ages.length === 1) return AGE_LABELS.get(ages[0]!) ?? ages[0]!;
  return `${ages.length} selected`;
}

function summarizeStates(states: StateFilter[]): string {
  const hasUnread = states.includes("unread");
  const hasDone = states.includes("done");
  if (hasUnread && hasDone) return "Unread, Done";
  if (hasDone) return "Done";
  return "Unread";
}

export function InboxFilters({
  filters,
  onChange,
}: {
  filters: InboxFilters;
  onChange: (next: InboxFilters) => void;
}) {
  const ageSummary = summarizeAges(filters.ages);
  const ageTitle =
    filters.ages.length > 1
      ? `Age: ${filters.ages.map((a) => AGE_LABELS.get(a) ?? a).join(", ")}`
      : undefined;
  const stateSummary = summarizeStates(filters.states);

  return (
    <div className="flex flex-wrap items-center gap-2">
      <FilterDropdown
        property="Age"
        summary={ageSummary}
        title={ageTitle}
        active={filters.ages.length > 0}
        mode="single"
        options={AGE_OPTIONS}
        selected={filters.ages}
        onSelect={(value) =>
          onChange({
            ...filters,
            ages: [value as AgeFilter],
          })
        }
        allLabel="All time"
        allAriaLabel="Filter by age All time"
        panelLabel="Age filters"
        onReset={() => onChange({ ...filters, ages: [] })}
      />
      <FilterDropdown
        property="State"
        summary={stateSummary}
        active={!isUnreadOnly(filters)}
        mode="multi"
        options={STATE_OPTIONS}
        selected={filters.states}
        onSelect={(value) =>
          onChange({
            ...filters,
            states: toggleState(filters.states, value as StateFilter),
          })
        }
        panelLabel="State filters"
        resetLabel="Reset to Unread"
        onReset={() => onChange({ ...filters, states: ["unread"] })}
        panelClassName="w-48"
      />
    </div>
  );
}
