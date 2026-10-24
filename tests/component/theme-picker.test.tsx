import { afterEach, beforeEach, describe, expect, test } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { ThemePicker } from "@/components/theme-picker";
import {
  THEMES,
  THEME_STORAGE_KEY,
  applyThemeId,
  readThemeId,
  writeThemeId,
} from "@/lib/themes";
import { resetUIStore } from "@/lib/ui-store";

beforeEach(() => {
  localStorage.clear();
  sessionStorage.clear();
  resetUIStore();
  document.documentElement.removeAttribute("data-theme");
  document.documentElement.classList.remove("dark");
});

afterEach(() => {
  cleanup();
});

describe("theme persistence", () => {
  test("read falls back to default when storage is empty or invalid", () => {
    expect(readThemeId()).toBe("default");
    localStorage.setItem(THEME_STORAGE_KEY, "nope");
    expect(readThemeId()).toBe("default");
  });

  test("write persists, applies data-theme, and returns the id", () => {
    expect(writeThemeId("nord")).toBe("nord");
    expect(localStorage.getItem(THEME_STORAGE_KEY)).toBe("nord");
    expect(document.documentElement.getAttribute("data-theme")).toBe("nord");
    expect(readThemeId()).toBe("nord");
  });

  test("default theme clears the attribute so base :root wins", () => {
    writeThemeId("github");
    expect(document.documentElement.getAttribute("data-theme")).toBe("github");
    writeThemeId("default");
    expect(document.documentElement.hasAttribute("data-theme")).toBe(false);
    expect(readThemeId()).toBe("default");
  });

  test("apply rejects unknown ids", () => {
    applyThemeId("nope");
    expect(document.documentElement.hasAttribute("data-theme")).toBe(false);
  });

  test("data-theme coexists with the .dark mode class", () => {
    writeThemeId("dracula");
    document.documentElement.classList.add("dark");
    expect(document.documentElement.getAttribute("data-theme")).toBe("dracula");
    expect(document.documentElement.classList.contains("dark")).toBe(true);
    writeThemeId("default");
    expect(document.documentElement.classList.contains("dark")).toBe(true);
  });
});

describe("ThemePicker", () => {
  test("renders one radio per registered theme", () => {
    render(<ThemePicker />);
    const group = screen.getByRole("radiogroup", { name: "Color theme" });
    expect(group).toBeInTheDocument();
    expect(
      screen.getAllByRole("radio", { name: /theme$/ })
    ).toHaveLength(THEMES.length);
  });

  test("selecting a theme persists it and marks it checked", () => {
    render(<ThemePicker />);
    fireEvent.click(screen.getByRole("radio", { name: "Nord theme" }));
    expect(localStorage.getItem(THEME_STORAGE_KEY)).toBe("nord");
    expect(document.documentElement.getAttribute("data-theme")).toBe("nord");
    expect(screen.getByRole("radio", { name: "Nord theme" })).toHaveAttribute(
      "aria-checked",
      "true"
    );
  });

  test("restores the stored theme on mount", () => {
    localStorage.setItem(THEME_STORAGE_KEY, "gruvbox");
    render(<ThemePicker />);
    expect(
      screen.getByRole("radio", { name: "Gruvbox theme" })
    ).toHaveAttribute("aria-checked", "true");
  });
});
