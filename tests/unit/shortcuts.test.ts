import { describe, expect, test } from "bun:test";
import { SHORTCUTS, isEditableTarget } from "@/lib/shortcuts";

describe("shortcuts", () => {
  test("help lists the core triage keys", () => {
    const keys = SHORTCUTS.map((s) => s.key);
    for (const k of ["j / k", "x", "e", "Shift+U", "u", "r", "o", "a", "Esc", "?"]) {
      expect(keys).toContain(k);
    }
  });

  test("editable targets are detected without a DOM", () => {
    expect(isEditableTarget(null)).toBe(false);
    expect(isEditableTarget({} as unknown as EventTarget)).toBe(false);
    expect(
      isEditableTarget({ closest: () => null } as unknown as EventTarget)
    ).toBe(false);
    expect(
      isEditableTarget({ closest: () => ({}), isContentEditable: false } as unknown as EventTarget)
    ).toBe(true);
    expect(
      isEditableTarget({ isContentEditable: true } as unknown as EventTarget)
    ).toBe(true);
  });
});
