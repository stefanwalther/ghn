import { describe, expect, test } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { DEFAULT_THEME_ID, THEMES, isThemeId, normalizeThemeId } from "@/lib/themes";

const REQUIRED_VARS = [
  "--background",
  "--foreground",
  "--card",
  "--card-foreground",
  "--primary",
  "--primary-foreground",
  "--secondary",
  "--secondary-foreground",
  "--muted",
  "--muted-foreground",
  "--accent",
  "--accent-foreground",
  "--border",
  "--input",
  "--ring",
  "--sidebar",
  "--sidebar-accent",
  "--sidebar-accent-foreground",
  "--destructive",
  "--destructive-foreground",
  "--merged",
];

describe("theme registry", () => {
  test("holds the default plus fifteen more themes", () => {
    expect(THEMES).toHaveLength(16);
    expect(THEMES[0]!.id).toBe("default");
    expect(DEFAULT_THEME_ID).toBe("default");
  });

  test("ids are unique and non-empty with display metadata", () => {
    const ids = THEMES.map((t) => t.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const t of THEMES) {
      expect(t.id.length).toBeGreaterThan(0);
      expect(t.name.length).toBeGreaterThan(0);
      expect(t.blurb.length).toBeGreaterThan(0);
      // The picker previews each row with its own colors, so every theme
      // ships exactly three swatches.
      expect(t.preview).toHaveLength(3);
      for (const swatch of t.preview) {
        expect(swatch.length).toBeGreaterThan(0);
      }
    }
  });

  test("normalize falls back to the default for unknown values", () => {
    expect(normalizeThemeId("github")).toBe("github");
    expect(normalizeThemeId("nope")).toBe("default");
    expect(normalizeThemeId(null)).toBe("default");
    expect(normalizeThemeId(undefined)).toBe("default");
    expect(isThemeId("dracula")).toBe(true);
    expect(isThemeId("nope")).toBe(false);
  });
});

describe("theme css coverage", () => {
  const css = readFileSync(
    fileURLToPath(new URL("../../app/globals.css", import.meta.url)),
    "utf8"
  );

  test.each(THEMES.filter((t) => t.id !== "default").map((t) => [t.id]))(
    "theme %s ships a light and a dark block with the full variable set",
    (id) => {
      // The ` {` suffix keeps the light lookup from matching inside the
      // dark selector, which contains the light selector as a substring.
      const light = extractBlock(css, `:root[data-theme="${id}"] {`);
      const dark = extractBlock(css, `:root[data-theme="${id}"].dark {`);
      expect(light, `missing light block for ${id}`).toBeDefined();
      expect(dark, `missing dark block for ${id}`).toBeDefined();
      for (const v of REQUIRED_VARS) {
        expect(light, `${id} light misses ${v}`).toContain(v);
        expect(dark, `${id} dark misses ${v}`).toContain(v);
      }
    }
  );

  test("base :root and .dark keep the default theme working standalone", () => {
    expect(css).toContain(":root {");
    expect(css).toContain(".dark {");
  });
});

function extractBlock(css: string, selector: string): string | undefined {
  const at = css.indexOf(selector);
  if (at === -1) return undefined;
  const open = css.indexOf("{", at);
  if (open === -1) return undefined;
  let depth = 0;
  for (let i = open; i < css.length; i++) {
    if (css[i] === "{") depth += 1;
    if (css[i] === "}") {
      depth -= 1;
      if (depth === 0) return css.slice(open, i + 1);
    }
  }
  return undefined;
}
