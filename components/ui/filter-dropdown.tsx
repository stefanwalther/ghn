"use client";

import * as React from "react";
import { Check, ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";

export interface FilterDropdownOption {
  value: string;
  label: string;
  /** Accessible label for the option control (defaults to label). */
  ariaLabel?: string;
}

export interface FilterDropdownProps {
  /** Short property name shown on the collapsed pill, e.g. "Age". */
  property: string;
  /** Applied value summary shown on the collapsed pill, e.g. "All time". */
  summary: string;
  /** Optional tooltip shown on hover when multiple values collapse to a count. */
  title?: string;
  /** Highlights the pill when narrowed away from its default value. */
  active?: boolean;
  /** single picks one value and closes; multi toggles checkboxes and stays open. */
  mode?: "single" | "multi";
  options: FilterDropdownOption[];
  selected: string[];
  /** Invoked when an option row is activated. */
  onSelect: (value: string) => void;
  /** Leading "all" reset row, e.g. "All time"; selected when selected is empty. */
  allLabel?: string;
  /** Accessible label for the leading "all" row (defaults to allLabel). */
  allAriaLabel?: string;
  /** Accessible label for the dropdown panel, e.g. "Age filters". */
  panelLabel: string;
  /** Footer reset button label shown when active is true. */
  resetLabel?: string;
  /** Resets the filter to its default value and closes the panel. */
  onReset?: () => void;
  /** Optional width/layout override for the popover panel. */
  panelClassName?: string;
}

/**
 * Linear-style filter pill: compact when collapsed while showing the property
 * name and active value, expanding into a clean single- or multi-select menu.
 */
export function FilterDropdown({
  property,
  summary,
  title,
  active = false,
  mode = "multi",
  options,
  selected,
  onSelect,
  allLabel,
  allAriaLabel,
  panelLabel,
  resetLabel,
  onReset,
  panelClassName,
}: FilterDropdownProps) {
  const [open, setOpen] = React.useState(false);
  const containerRef = React.useRef<HTMLDivElement>(null);
  const triggerRef = React.useRef<HTMLButtonElement>(null);
  const panelRef = React.useRef<HTMLDivElement>(null);
  const panelId = React.useId();

  React.useEffect(() => {
    if (!open) return;
    panelRef.current?.querySelector<HTMLButtonElement>("button")?.focus();

    function onPointerDown(e: MouseEvent) {
      if (!containerRef.current?.contains(e.target as Node)) {
        setOpen(false);
      }
    }

    function onKeyDown(e: KeyboardEvent) {
      if (e.key !== "Escape") return;
      if (document.querySelector('[aria-modal="true"]')) return;
      e.stopPropagation();
      setOpen(false);
      triggerRef.current?.focus();
    }

    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("keydown", onKeyDown, true);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown, true);
    };
  }, [open]);

  function handlePanelKeyDown(e: React.KeyboardEvent<HTMLDivElement>) {
    if (
      e.key !== "ArrowDown" &&
      e.key !== "ArrowUp" &&
      e.key !== "Home" &&
      e.key !== "End"
    ) {
      return;
    }
    const buttons = [
      ...(panelRef.current?.querySelectorAll<HTMLButtonElement>("button") ?? []),
    ];
    if (buttons.length === 0) return;
    e.preventDefault();
    if (e.key === "Home") {
      buttons[0]?.focus();
      return;
    }
    if (e.key === "End") {
      buttons[buttons.length - 1]?.focus();
      return;
    }
    const currentIdx = buttons.indexOf(e.target as HTMLButtonElement);
    const delta = e.key === "ArrowDown" ? 1 : -1;
    const nextIdx =
      currentIdx === -1
        ? 0
        : (currentIdx + delta + buttons.length) % buttons.length;
    buttons[nextIdx]?.focus();
  }

  function pickOption(value: string) {
    onSelect(value);
    if (mode === "single") {
      setOpen(false);
      triggerRef.current?.focus();
    }
  }

  function resetAndClose() {
    onReset?.();
    setOpen(false);
    triggerRef.current?.focus();
  }

  const isSingle = mode === "single";
  const optionRole = isSingle ? "radio" : "checkbox";
  const highlighted = active || open;
  const allSelected = selected.length === 0;
  const rowClass =
    "group/row flex w-full cursor-pointer select-none items-center gap-2 rounded-md px-2.5 py-1.5 text-left text-sm transition-colors duration-150 hover:bg-accent hover:text-accent-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring";

  return (
    <div
      ref={containerRef}
      className="relative"
      onBlur={(e) => {
        if (!open) return;
        const next = e.relatedTarget as Node | null;
        if (next && !containerRef.current?.contains(next)) {
          setOpen(false);
        }
      }}
    >
      <button
        ref={triggerRef}
        type="button"
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-controls={open ? panelId : undefined}
        aria-label={`${property}: ${summary}`}
        title={title}
        onClick={() => setOpen((wasOpen) => !wasOpen)}
        className={cn(
          "group inline-flex h-8 max-w-full cursor-pointer select-none items-center gap-2 rounded-md border px-2.5 text-xs transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
          highlighted
            ? "border-accent-foreground/25 bg-accent text-accent-foreground"
            : "border-input bg-card text-card-foreground hover:bg-accent hover:text-accent-foreground"
        )}
      >
        <span
          className={cn(
            "shrink-0 transition-colors duration-150",
            highlighted
              ? "text-accent-foreground/75"
              : "text-muted-foreground group-hover:text-accent-foreground/75"
          )}
        >
          {property}
        </span>
        <span
          aria-hidden="true"
          className={cn(
            "h-3.5 w-px shrink-0 transition-colors duration-150",
            highlighted
              ? "bg-accent-foreground/20"
              : "bg-border group-hover:bg-accent-foreground/20"
          )}
        />
        <span className="truncate font-medium">{summary}</span>
        <ChevronDown
          aria-hidden="true"
          className={cn(
            "h-3.5 w-3.5 shrink-0 transition-transform duration-150",
            highlighted
              ? "text-accent-foreground/75"
              : "text-muted-foreground group-hover:text-accent-foreground/75",
            open && "rotate-180"
          )}
        />
      </button>

      {open ? (
        <div
          id={panelId}
          ref={panelRef}
          role="dialog"
          aria-label={panelLabel}
          data-filter-popover="true"
          onKeyDown={handlePanelKeyDown}
          className={cn(
            "absolute top-full left-0 z-50 mt-1.5 w-56 max-w-[calc(100vw-2rem)] rounded-lg border border-border bg-card p-1 text-card-foreground shadow-lg",
            panelClassName
          )}
        >
          <div
            role={isSingle ? "radiogroup" : undefined}
            aria-label={isSingle ? panelLabel : undefined}
          >
            {allLabel && onReset ? (
              <>
                <button
                  type="button"
                  role={optionRole}
                  aria-checked={allSelected}
                  aria-label={allAriaLabel ?? allLabel}
                  onClick={resetAndClose}
                  className={rowClass}
                >
                  <span
                    aria-hidden="true"
                    className="flex h-4 w-4 shrink-0 items-center justify-center text-primary group-hover/row:text-accent-foreground"
                  >
                    {allSelected ? <Check className="h-3.5 w-3.5 stroke-[2.5]" /> : null}
                  </span>
                  <span
                    className={cn(
                      "min-w-0 flex-1 truncate",
                      allSelected
                        ? "font-medium text-foreground group-hover/row:text-accent-foreground"
                        : "text-muted-foreground group-hover/row:text-accent-foreground"
                    )}
                  >
                    {allLabel}
                  </span>
                </button>
                <div
                  role="separator"
                  aria-hidden="true"
                  className="my-1 border-t border-border/60"
                />
              </>
            ) : null}

            <div className="max-h-72 overflow-y-auto">
              {options.map((option) => {
                const checked = selected.includes(option.value);
                return (
                  <button
                    key={option.value}
                    type="button"
                    role={optionRole}
                    aria-checked={checked}
                    aria-label={option.ariaLabel ?? option.label}
                    onClick={() => pickOption(option.value)}
                    className={rowClass}
                  >
                    {isSingle ? (
                      <span
                        aria-hidden="true"
                        className="flex h-4 w-4 shrink-0 items-center justify-center text-primary group-hover/row:text-accent-foreground"
                      >
                        {checked ? <Check className="h-3.5 w-3.5 stroke-[2.5]" /> : null}
                      </span>
                    ) : (
                      <span
                        aria-hidden="true"
                        className={cn(
                          "flex h-4 w-4 shrink-0 items-center justify-center rounded-[4px] border transition-colors duration-150",
                          checked
                            ? "border-primary bg-primary text-primary-foreground"
                            : "border-muted-foreground/50 bg-transparent group-hover/row:border-accent-foreground/60"
                        )}
                      >
                        {checked ? <Check className="h-3 w-3 stroke-[2.75]" /> : null}
                      </span>
                    )}
                    <span
                      className={cn(
                        "min-w-0 flex-1 truncate",
                        checked
                          ? "font-medium text-foreground group-hover/row:text-accent-foreground"
                          : "text-card-foreground/90 group-hover/row:text-accent-foreground"
                      )}
                    >
                      {option.label}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

          {active && resetLabel && onReset ? (
            <div className="mt-1 border-t border-border/60 pt-1">
              <button
                type="button"
                onClick={resetAndClose}
                className="flex w-full cursor-pointer items-center gap-2 rounded-md px-2.5 py-1.5 text-left text-xs text-muted-foreground transition-colors duration-150 hover:bg-accent hover:text-accent-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
              >
                <span aria-hidden="true" className="w-4 shrink-0" />
                <span>{resetLabel}</span>
              </button>
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
