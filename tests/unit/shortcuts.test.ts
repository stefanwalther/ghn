import { describe, expect, test } from "vitest";
import {
  SHORTCUTS,
  isAltHintKey,
  isCycleThemeEvent,
  isEditableTarget,
  isToggleSidebarEvent,
} from "@/lib/shortcuts";

function keyEvent(overrides: Partial<KeyboardEvent>): KeyboardEvent {
  return {
    key: "b",
    metaKey: false,
    ctrlKey: false,
    altKey: false,
    shiftKey: false,
    ...overrides,
  } as KeyboardEvent;
}

describe("shortcuts", () => {
  test("help lists the core triage keys", () => {
    const keys = SHORTCUTS.map((s) => s.key);
    for (const k of ["j / k", "x / Space", "d", "Shift+U", "u", "r", "o", "Shift+D", "c", "a", "Esc", "?"]) {
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

  test("sidebar toggle fires on Cmd+B and Ctrl+B only", () => {
    expect(isToggleSidebarEvent(keyEvent({ key: "b", metaKey: true }))).toBe(true);
    expect(isToggleSidebarEvent(keyEvent({ key: "B", metaKey: true }))).toBe(true);
    expect(isToggleSidebarEvent(keyEvent({ key: "b", ctrlKey: true }))).toBe(true);
    expect(isToggleSidebarEvent(keyEvent({ key: "b" }))).toBe(false);
    expect(isToggleSidebarEvent(keyEvent({ key: "a", metaKey: true }))).toBe(false);
    expect(isToggleSidebarEvent(keyEvent({ key: "b", metaKey: true, altKey: true }))).toBe(false);
    expect(isToggleSidebarEvent(keyEvent({ key: "B", metaKey: true, shiftKey: true }))).toBe(false);
    expect(isToggleSidebarEvent(keyEvent({ key: "b", ctrlKey: true, shiftKey: true }))).toBe(false);
  });

  test("alt hint key accepts Alt and Option", () => {
    expect(isAltHintKey(keyEvent({ key: "Alt" }))).toBe(true);
    expect(isAltHintKey(keyEvent({ key: "Option" }))).toBe(true);
    expect(isAltHintKey(keyEvent({ key: "a" }))).toBe(false);
    expect(isAltHintKey(keyEvent({ key: "AltGraph" }))).toBe(false);
  });

  test("help lists the theme cycle key", () => {
    const keys = SHORTCUTS.map((s) => s.key);
    expect(keys).toContain("Cmd+F12");
  });

  test("theme cycle fires on Cmd+F12 and Ctrl+F12 only", () => {
    expect(isCycleThemeEvent(keyEvent({ key: "F12", metaKey: true }))).toBe(true);
    expect(isCycleThemeEvent(keyEvent({ key: "F12", ctrlKey: true }))).toBe(true);
    expect(isCycleThemeEvent(keyEvent({ key: "F12" }))).toBe(false);
    expect(isCycleThemeEvent(keyEvent({ key: "F11", metaKey: true }))).toBe(false);
    expect(isCycleThemeEvent(keyEvent({ key: "F12", metaKey: true, altKey: true }))).toBe(false);
    expect(isCycleThemeEvent(keyEvent({ key: "F12", metaKey: true, shiftKey: true }))).toBe(false);
    expect(isCycleThemeEvent(keyEvent({ key: "F12", ctrlKey: true, shiftKey: true }))).toBe(false);
  });
});
