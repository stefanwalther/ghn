import * as React from "react";
import { afterEach, describe, expect, test, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { ThemeSwitcher } from "@/components/theme-switcher";

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

function rect(partial: Partial<DOMRect>): DOMRect {
  return {
    x: 0,
    y: 0,
    width: 32,
    height: 32,
    top: 660,
    right: 200,
    bottom: 692,
    left: 168,
    toJSON: () => ({}),
    ...partial,
  } as DOMRect;
}

describe("ThemeSwitcher menu placement", () => {
  test("opens below the trigger when room allows", () => {
    Object.defineProperty(window, "innerHeight", { value: 1000, configurable: true });
    vi.spyOn(HTMLButtonElement.prototype, "getBoundingClientRect").mockReturnValue(rect({}));
    render(<ThemeSwitcher />);

    fireEvent.click(screen.getByRole("button", { name: "Theme" }));
    const menu = screen.getByRole("menu", { name: "Theme" });
    expect(menu.style.top).toBe("700px");
  });

  test("flips above the trigger near the viewport bottom", () => {
    vi.spyOn(HTMLButtonElement.prototype, "getBoundingClientRect").mockReturnValue(rect({}));
    Object.defineProperty(window, "innerHeight", { value: 700, configurable: true });
    render(<ThemeSwitcher />);

    fireEvent.click(screen.getByRole("button", { name: "Theme" }));
    const menu = screen.getByRole("menu", { name: "Theme" });
    // 692 + 8 + 140 exceeds 700, so the menu opens upward.
    expect(menu.style.top).toBe("512px");
  });

  test("choosing an option closes the menu and refocuses the trigger", async () => {
    vi.spyOn(HTMLButtonElement.prototype, "getBoundingClientRect").mockReturnValue(rect({}));
    render(<ThemeSwitcher />);
    const trigger = screen.getByRole("button", { name: "Theme" });

    fireEvent.click(trigger);
    expect(await screen.findByRole("menu", { name: "Theme" })).toBeTruthy();
    fireEvent.click(screen.getByRole("menuitemradio", { name: "Light" }));

    await waitFor(() => {
      expect(screen.queryByRole("menu", { name: "Theme" })).toBeNull();
    });
    expect(trigger).toHaveFocus();
  });

  test("tabbing out closes the menu", async () => {
    vi.spyOn(HTMLButtonElement.prototype, "getBoundingClientRect").mockReturnValue(rect({}));
    render(<ThemeSwitcher />);

    fireEvent.click(screen.getByRole("button", { name: "Theme" }));
    const menu = await screen.findByRole("menu", { name: "Theme" });
    fireEvent.blur(menu, { relatedTarget: document.body });

    await waitFor(() => {
      expect(screen.queryByRole("menu", { name: "Theme" })).toBeNull();
    });
  });
});
