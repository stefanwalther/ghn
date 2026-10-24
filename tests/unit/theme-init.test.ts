import { readFileSync } from "node:fs";
import { describe, expect, test } from "vitest";
import { DEFAULT_THEME_ID, THEME_STORAGE_KEY } from "@/lib/themes";

describe("theme init script", () => {
  test("inline script in app/layout.tsx stays in sync with lib/themes", () => {
    expect(THEME_STORAGE_KEY).toBe("ghn:theme");
    expect(DEFAULT_THEME_ID).toBe("default");
    const source = readFileSync(new URL("../../app/layout.tsx", import.meta.url), "utf8");
    expect(source).toContain('var k="ghn:theme"');
    expect(source).toContain('var d="default"');
  });
});
