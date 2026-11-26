import { afterEach, describe, expect, test, vi } from "vitest";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import * as React from "react";
import { InboxFilters } from "@/components/inbox/inbox-filters";
import { DEFAULT_INBOX_FILTERS, type InboxFilters as Filters } from "@/lib/view-state";

function ControlledFilters({
  initial = DEFAULT_INBOX_FILTERS,
  onSpy,
}: {
  initial?: Filters;
  onSpy?: (next: Filters) => void;
}) {
  const [filters, setFilters] = React.useState<Filters>(initial);
  return (
    <div>
      <InboxFilters
        filters={filters}
        onChange={(next) => {
          setFilters(next);
          onSpy?.(next);
        }}
      />
      <button type="button">Outside target</button>
    </div>
  );
}

describe("InboxFilters dropdowns", () => {
  afterEach(() => {
    cleanup();
  });

  test("renders collapsed pills showing the current values with no open panel", () => {
    render(<ControlledFilters />);

    const ageTrigger = screen.getByRole("button", { name: "Age: All time" });
    const stateTrigger = screen.getByRole("button", { name: "State: Unread" });

    expect(ageTrigger).toHaveAttribute("aria-expanded", "false");
    expect(stateTrigger).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  test("age dropdown is single-select, closes on pick, and resets via All time", () => {
    const onSpy = vi.fn();
    render(<ControlledFilters onSpy={onSpy} />);

    fireEvent.click(screen.getByRole("button", { name: "Age: All time" }));
    const dialog = screen.getByRole("dialog", { name: "Age filters" });
    expect(within(dialog).getByRole("radio", { name: "Filter by age All time" })).toBeChecked();

    // Selecting one bucket applies it, closes the popover, and refocuses the trigger.
    fireEvent.click(within(dialog).getByRole("radio", { name: "Filter by age Last 7 days" }));
    expect(screen.queryByRole("dialog", { name: "Age filters" })).not.toBeInTheDocument();
    const sevenTrigger = screen.getByRole("button", { name: "Age: Last 7 days" });
    expect(document.activeElement).toBe(sevenTrigger);
    expect(onSpy).toHaveBeenLastCalledWith({
      ...DEFAULT_INBOX_FILTERS,
      ages: ["7d"],
    });

    // Picking a different age replaces the previous one in a single click.
    fireEvent.click(sevenTrigger);
    const reopened = screen.getByRole("dialog", { name: "Age filters" });
    expect(within(reopened).getByRole("radio", { name: "Filter by age Last 7 days" })).toBeChecked();
    expect(within(reopened).getByRole("radio", { name: "Filter by age All time" })).not.toBeChecked();
    fireEvent.click(within(reopened).getByRole("radio", { name: "Filter by age Last 24 hours" }));
    expect(screen.queryByRole("dialog", { name: "Age filters" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Age: Last 24 hours" })).toBeInTheDocument();
    expect(onSpy).toHaveBeenLastCalledWith({
      ...DEFAULT_INBOX_FILTERS,
      ages: ["24h"],
    });

    // Leading "All time" row resets and closes.
    fireEvent.click(screen.getByRole("button", { name: "Age: Last 24 hours" }));
    fireEvent.click(screen.getByRole("radio", { name: "Filter by age All time" }));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Age: All time" })).toBeInTheDocument();
    expect(onSpy).toHaveBeenLastCalledWith({
      ...DEFAULT_INBOX_FILTERS,
      ages: [],
    });
  });

  test("summarizes a legacy multi-age URL gracefully and collapses to single-select on pick", () => {
    render(
      <ControlledFilters
        initial={{ ...DEFAULT_INBOX_FILTERS, ages: ["24h", "7d"] }}
      />
    );

    const multiTrigger = screen.getByRole("button", { name: "Age: 2 selected" });
    expect(multiTrigger).toHaveAttribute("title", "Age: Last 24 hours, Last 7 days");

    fireEvent.click(multiTrigger);
    fireEvent.click(screen.getByRole("radio", { name: "Filter by age Last 30 days" }));
    expect(screen.getByRole("button", { name: "Age: Last 30 days" })).toBeInTheDocument();
  });

  test("supports multi-select state toggling and reset to default", () => {
    render(<ControlledFilters />);

    fireEvent.click(screen.getByRole("button", { name: "State: Unread" }));
    const dialog = screen.getByRole("dialog", { name: "State filters" });
    expect(within(dialog).getByRole("checkbox", { name: "Filter by state Unread" })).toBeChecked();
    expect(within(dialog).getByRole("checkbox", { name: "Filter by state Done" })).not.toBeChecked();
    expect(within(dialog).queryByRole("button", { name: "Reset to Unread" })).not.toBeInTheDocument();

    // Add Done -> both states active, dropdown stays open.
    fireEvent.click(within(dialog).getByRole("checkbox", { name: "Filter by state Done" }));
    expect(screen.getByRole("dialog", { name: "State filters" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "State: Unread, Done" })).toBeInTheDocument();

    // Uncheck Unread -> Done only.
    fireEvent.click(within(dialog).getByRole("checkbox", { name: "Filter by state Unread" }));
    expect(screen.getByRole("button", { name: "State: Done" })).toBeInTheDocument();

    // Footer resets straight back to Unread and closes.
    fireEvent.click(within(dialog).getByRole("button", { name: "Reset to Unread" }));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "State: Unread" })).toBeInTheDocument();
  });

  test("closes on outside click, Escape, and opening the sibling dropdown", () => {
    render(<ControlledFilters />);

    const ageTrigger = screen.getByRole("button", { name: "Age: All time" });
    fireEvent.click(ageTrigger);
    expect(screen.getByRole("dialog", { name: "Age filters" })).toBeInTheDocument();

    // Clicking outside closes the popover.
    fireEvent.mouseDown(screen.getByRole("button", { name: "Outside target" }));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();

    // Escape closes and returns focus to the trigger.
    fireEvent.click(ageTrigger);
    expect(screen.getByRole("dialog", { name: "Age filters" })).toBeInTheDocument();
    fireEvent.keyDown(document, { key: "Escape" });
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(document.activeElement).toBe(ageTrigger);

    // Opening State closes Age cleanly.
    fireEvent.click(ageTrigger);
    expect(screen.getByRole("dialog", { name: "Age filters" })).toBeInTheDocument();
    const stateTrigger = screen.getByRole("button", { name: "State: Unread" });
    fireEvent.mouseDown(stateTrigger);
    fireEvent.click(stateTrigger);
    expect(screen.queryByRole("dialog", { name: "Age filters" })).not.toBeInTheDocument();
    expect(screen.getByRole("dialog", { name: "State filters" })).toBeInTheDocument();

    // Clicking the same trigger again closes it.
    fireEvent.mouseDown(stateTrigger);
    fireEvent.click(stateTrigger);
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  test("moves focus with ArrowDown, ArrowUp, Home, and End inside the open panel", () => {
    render(<ControlledFilters />);

    fireEvent.click(screen.getByRole("button", { name: "Age: All time" }));
    const dialog = screen.getByRole("dialog", { name: "Age filters" });
    const allTime = within(dialog).getByRole("radio", { name: "Filter by age All time" });
    const last24 = within(dialog).getByRole("radio", { name: "Filter by age Last 24 hours" });
    const older = within(dialog).getByRole("radio", { name: "Filter by age Older than a year" });

    expect(document.activeElement).toBe(allTime);

    fireEvent.keyDown(allTime, { key: "ArrowDown" });
    expect(document.activeElement).toBe(last24);

    fireEvent.keyDown(last24, { key: "ArrowUp" });
    expect(document.activeElement).toBe(allTime);

    fireEvent.keyDown(allTime, { key: "ArrowUp" });
    expect(document.activeElement).toBe(older);

    fireEvent.keyDown(older, { key: "Home" });
    expect(document.activeElement).toBe(allTime);

    fireEvent.keyDown(allTime, { key: "End" });
    expect(document.activeElement).toBe(older);

    // Unrelated keys do not move focus.
    fireEvent.keyDown(older, { key: "x" });
    expect(document.activeElement).toBe(older);
  });

  test("wraps single-select radio buttons in a radiogroup and omits it for multi-select", () => {
    render(<ControlledFilters />);

    fireEvent.click(screen.getByRole("button", { name: "Age: All time" }));
    const ageDialog = screen.getByRole("dialog", { name: "Age filters" });
    const radiogroup = within(ageDialog).getByRole("radiogroup", { name: "Age filters" });
    expect(within(radiogroup).getAllByRole("radio")).toHaveLength(8);

    fireEvent.click(screen.getByRole("button", { name: "State: Unread" }));
    const stateDialog = screen.getByRole("dialog", { name: "State filters" });
    expect(within(stateDialog).queryByRole("radiogroup")).not.toBeInTheDocument();
  });

  test("closes when focus leaves the popover and yields Escape while a modal is open", () => {
    render(
      <div>
        <ControlledFilters />
        <div role="dialog" aria-modal="true" aria-label="Mock modal" data-testid="modal-host" />
      </div>
    );
    const modal = screen.getByTestId("modal-host");
    modal.removeAttribute("aria-modal");

    const ageTrigger = screen.getByRole("button", { name: "Age: All time" });
    fireEvent.click(ageTrigger);
    const allTime = screen.getByRole("radio", { name: "Filter by age All time" });
    const outside = screen.getByRole("button", { name: "Outside target" });

    // Null relatedTarget (e.g. mouse click in Safari) keeps the panel open.
    fireEvent.blur(allTime, { relatedTarget: null });
    expect(screen.getByRole("dialog", { name: "Age filters" })).toBeInTheDocument();

    // Focus moving to an outside control closes the panel cleanly.
    fireEvent.blur(allTime, { relatedTarget: outside });
    expect(screen.queryByRole("dialog", { name: "Age filters" })).not.toBeInTheDocument();

    // Reopen and simulate an active modal dialog: Escape must reach the modal,
    // not be hijacked by the dropdown underneath.
    fireEvent.click(ageTrigger);
    modal.setAttribute("aria-modal", "true");
    const modalEscapeSpy = vi.fn();
    window.addEventListener("keydown", modalEscapeSpy);
    try {
      fireEvent.keyDown(document, { key: "Escape" });
      expect(modalEscapeSpy).toHaveBeenCalledTimes(1);
      expect(screen.getByRole("dialog", { name: "Age filters" })).toBeInTheDocument();
    } finally {
      window.removeEventListener("keydown", modalEscapeSpy);
    }
  });
});
