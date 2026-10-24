export interface ShortcutDef {
  key: string;
  label: string;
  description: string;
  group: "Navigate" | "Triage" | "App";
}

export const SHORTCUTS: ShortcutDef[] = [
  { key: "j / k", label: "Move down / up", description: "Move focus between rows, or to the next / previous thread when details are open", group: "Navigate" },
  { key: "[ / ]", label: "Prev / next in details", description: "Jump to the previous / next thread while details are open", group: "Navigate" },
  { key: "o", label: "Open", description: "Open the focused thread in a new tab", group: "Navigate" },
  { key: "Shift+D", label: "Details", description: "Open the focused thread details in the side panel", group: "Navigate" },
  { key: "x", label: "Select", description: "Toggle the focused row", group: "Triage" },
  { key: "d", label: "Done", description: "Mark selection done (or the focused row)", group: "Triage" },
  { key: "Shift+U", label: "Unsubscribe", description: "Unsubscribe selection (or the focused row), with confirmation", group: "Triage" },
  { key: "u", label: "Unread", description: "Mark selection unread (or the focused row)", group: "Triage" },
  { key: "r", label: "Read", description: "Mark selection read (or the focused row)", group: "Triage" },
  { key: "s", label: "Sync", description: "Refresh selection from GitHub (or the focused row)", group: "Triage" },
  { key: "c", label: "Copy", description: "Copy the focused thread link", group: "Triage" },
  { key: "a", label: "All", description: "Select or clear all visible rows", group: "Triage" },
  { key: "Cmd+K", label: "Search", description: "Search threads, repos, commands, and filters", group: "App" },
  { key: "Cmd+B", label: "Sidebar", description: "Show or hide the main menu", group: "App" },
  { key: "Cmd+F12", label: "Theme", description: "Cycle light / dark / system", group: "App" },
  { key: "Alt", label: "Hints", description: "Hold to reveal key hints", group: "App" },
  { key: "Esc", label: "Clear", description: "Clear selection, or close this help", group: "App" },
  { key: "?", label: "Help", description: "Show this shortcut list", group: "App" },
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
