export interface ShortcutDef {
  key: string;
  label: string;
  description: string;
}

export const SHORTCUTS: ShortcutDef[] = [
  { key: "j / k", label: "Move down / up", description: "Move focus between rows, or to the next / previous thread when the drawer is open" },
  { key: "[ / ]", label: "Prev / next in drawer", description: "Jump to the previous / next thread while the drawer is open" },
  { key: "x", label: "Select", description: "Toggle the focused row" },
  { key: "e", label: "Done", description: "Mark selection done (or the focused row)" },
  { key: "Shift+U", label: "Unsubscribe", description: "Unsubscribe selection (or the focused row)" },
  { key: "u", label: "Unread", description: "Mark selection unread (or the focused row)" },
  { key: "r", label: "Read", description: "Mark selection read (or the focused row)" },
  { key: "s", label: "Sync", description: "Refresh selection from GitHub (or the focused row)" },
  { key: "o", label: "Open", description: "Open the focused thread in a new tab" },
  { key: "c", label: "Copy", description: "Copy the focused thread link" },
  { key: "d", label: "Drawer", description: "Open the focused thread in the side drawer" },
  { key: "a", label: "All", description: "Select or clear all visible rows" },
  { key: "Cmd+B", label: "Sidebar", description: "Show or hide the main menu" },
  { key: "Cmd+F12", label: "Theme", description: "Cycle light / dark / system" },
  { key: "Alt", label: "Hints", description: "Hold to reveal key hints" },
  { key: "Esc", label: "Clear", description: "Clear selection, or close this help" },
  { key: "?", label: "Help", description: "Show this shortcut list" },
];

export function isToggleSidebarEvent(e: KeyboardEvent): boolean {
  // Cmd+B on macOS, Ctrl+B elsewhere. Case-insensitive; ignore Alt and
  // Shift combos so e.g. Alt+Cmd+B or Cmd+Shift+B (browser bookmark
  // bar) does not toggle.
  if (e.altKey || e.shiftKey) return false;
  if (!e.metaKey && !e.ctrlKey) return false;
  return typeof e.key === "string" && e.key.toLowerCase() === "b";
}

export function isCycleThemeEvent(e: KeyboardEvent): boolean {
  // Cmd+F12 on macOS, Ctrl+F12 elsewhere. Ignore Alt and Shift combos.
  if (e.altKey || e.shiftKey) return false;
  if (!e.metaKey && !e.ctrlKey) return false;
  return e.key === "F12";
}

export function isAltHintKey(e: KeyboardEvent): boolean {
  // Browsers report the Alt modifier as "Alt"; some macOS layouts
  // historically report "Option". Accept both.
  return e.key === "Alt" || e.key === "Option";
}

export function isEditableTarget(target: EventTarget | null): boolean {
  const el = target as unknown as {
    closest?: (selector: string) => unknown;
    isContentEditable?: boolean;
  } | null;
  if (!el) return false;
  if (el.isContentEditable) return true;
  try {
    return !!el.closest?.("input, textarea, select");
  } catch {
    return false;
  }
}
