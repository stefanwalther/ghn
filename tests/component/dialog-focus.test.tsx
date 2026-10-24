import * as React from "react";
import { afterEach, describe, expect, test } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { useDialogFocus } from "@/lib/dialog-focus";

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
});
