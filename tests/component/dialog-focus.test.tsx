import * as React from "react";
import { afterEach, describe, expect, test } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { useDialogFocus } from "@/lib/dialog-focus";
import { FilterDropdown } from "@/components/ui/filter-dropdown";

afterEach(() => {
  cleanup();
});

function Harness({
  autofocus = true,
  withInput = true,
}: {
  autofocus?: boolean;
  withInput?: boolean;
}) {
  const ref = React.useRef<HTMLDivElement>(null);
  useDialogFocus(ref);
  return (
    <div>
      <button type="button">outside</button>
      <div ref={ref} role="dialog" aria-label="Harness dialog" tabIndex={-1}>
        {withInput ? (
          <input aria-label="Harness input" data-autofocus={autofocus || undefined} />
        ) : null}
        <button type="button">first</button>
        <button type="button">last</button>
      </div>
    </div>
  );
}

function Opener() {
  const [open, setOpen] = React.useState(false);
  const ref = React.useRef<HTMLDivElement>(null);
  useDialogFocus(ref, open);
  return (
    <div>
      <button type="button" onClick={() => setOpen(true)}>
        open it
      </button>
      {open ? (
        <div ref={ref} role="dialog" aria-label="Opener dialog" tabIndex={-1}>
          <button type="button" onClick={() => setOpen(false)}>
            close it
          </button>
        </div>
      ) : null}
    </div>
  );
}

describe("useDialogFocus", () => {
  test("moves focus to the autofocus element on mount", async () => {
    render(<Harness />);
    await waitFor(() => {
      expect(screen.getByLabelText("Harness input")).toHaveFocus();
    });
  });

  test("falls back to the first input without an autofocus marker", async () => {
    render(<Harness autofocus={false} />);
    await waitFor(() => {
      expect(screen.getByLabelText("Harness input")).toHaveFocus();
    });
  });

  test("falls back to the root when nothing focusable exists", async () => {
    render(<Harness withInput={false} />);
    const dialog = await screen.findByRole("dialog", { name: "Harness dialog" });
    await waitFor(() => {
      expect(dialog).toHaveFocus();
    });
  });

  test("Tab wraps from the last focusable back to the first", async () => {
    render(<Harness />);
    const input = await screen.findByLabelText("Harness input");
    const dialog = screen.getByRole("dialog", { name: "Harness dialog" });
    const last = screen.getByRole("button", { name: "last" });
    last.focus();
    fireEvent.keyDown(dialog, { key: "Tab", bubbles: true });
    expect(input).toHaveFocus();
  });

  test("Shift+Tab wraps from the first focusable to the last", async () => {
    render(<Harness />);
    const input = await screen.findByLabelText("Harness input");
    const dialog = screen.getByRole("dialog", { name: "Harness dialog" });
    const last = screen.getByRole("button", { name: "last" });
    expect(input).toHaveFocus();
    fireEvent.keyDown(dialog, { key: "Tab", shiftKey: true, bubbles: true });
    expect(last).toHaveFocus();
  });

  test("returns focus to the opener on close", async () => {
    render(<Opener />);
    const opener = screen.getByRole("button", { name: "open it" });
    opener.focus();
    fireEvent.click(opener);
    await screen.findByRole("dialog", { name: "Opener dialog" });
    fireEvent.click(screen.getByRole("button", { name: "close it" }));
    await waitFor(() => {
      expect(opener).toHaveFocus();
    });
  });

  test("falls back to the controlling dropdown trigger when an open option unmounts", async () => {
    function FilterWithPalette() {
      const [paletteOpen, setPaletteOpen] = React.useState(false);
      const paletteRef = React.useRef<HTMLDivElement>(null);
      useDialogFocus(paletteRef, paletteOpen);
      return (
        <div>
          <FilterDropdown
            property="Age"
            summary="All time"
            mode="single"
            options={[{ value: "7d", label: "Last 7 days" }]}
            selected={[]}
            onSelect={() => {}}
            allLabel="All time"
            onReset={() => {}}
            panelLabel="Age filters"
          />
          <button type="button" onClick={() => setPaletteOpen(true)}>
            Trigger palette
          </button>
          {paletteOpen ? (
            <div ref={paletteRef} role="dialog" aria-modal="true" aria-label="Search and commands">
              <input aria-label="Palette input" data-autofocus />
              <button type="button" onClick={() => setPaletteOpen(false)}>
                Close palette
              </button>
            </div>
          ) : null}
        </div>
      );
    }

    render(<FilterWithPalette />);
    const ageTrigger = screen.getByRole("button", { name: "Age: All time" });
    fireEvent.click(ageTrigger);
    expect(screen.getByRole("radio", { name: "All time" })).toHaveFocus();

    // Open the palette without moving focus via mouse (simulates Cmd+K or /).
    fireEvent.click(screen.getByRole("button", { name: "Trigger palette" }));
    const paletteInput = await screen.findByLabelText("Palette input");
    await waitFor(() => {
      expect(paletteInput).toHaveFocus();
    });
    // Blur onto the palette input closes the dropdown and unmounts the option.
    expect(screen.queryByRole("dialog", { name: "Age filters" })).not.toBeInTheDocument();

    // Closing the palette returns focus to the still-connected Age trigger.
    fireEvent.click(screen.getByRole("button", { name: "Close palette" }));
    await waitFor(() => {
      expect(ageTrigger).toHaveFocus();
    });
  });
});
