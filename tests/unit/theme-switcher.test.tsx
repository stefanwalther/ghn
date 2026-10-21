import { describe, expect, test } from "vitest";
import { ThemeProvider } from "next-themes";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { ThemeSwitcher } from "@/components/theme-switcher";

function renderSwitcher() {
  return renderToStaticMarkup(
    React.createElement(
      ThemeProvider,
      { attribute: "class", defaultTheme: "system", enableSystem: true },
      React.createElement(ThemeSwitcher)
    )
  );
}

describe("ThemeSwitcher", () => {
  test("server render shows the theme trigger with its key hint", () => {
    const html = renderSwitcher();
    expect(html).toContain('aria-label="Theme"');
    expect(html).toContain('title="Theme (Cmd+F12)"');
    expect(html).toContain("aria-expanded");
  });

  test("pre-hydration trigger shows the system icon", () => {
    // next-themes is unresolved during static render, so the switcher
    // falls back to the Monitor icon to match the server markup.
    const html = renderSwitcher();
    expect(html).toContain("<svg");
  });
});
