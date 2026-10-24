import * as React from "react";

export interface AppTheme {
  /** Stable id used for `data-theme` and localStorage. */
  id: string;
  /** Display name shown in Settings. */
  name: string;
  /** One-line blurb shown under the name. */
  blurb: string;
  /**
   * Fixed swatch shown in the picker: [background, primary, secondary].
   * Inline colors on purpose, so every row previews its own theme instead
   * of resolving the currently active theme's variables.
   */
  preview: [string, string, string];
}

/**
 * Generic theme registry. The current theme is entry 0 and the default.
 * Adding a theme = one entry here + one light/dark block in
 * `app/globals.css` keyed by `[data-theme="<id>"]`. Nothing else branches
 * on theme ids.
 */
export const THEMES: AppTheme[] = [
  { id: "default", name: "Default theme", blurb: "Lime", preview: ["#F7F8EA", "#A3E635", "#3F4C5F"] },
  { id: "github", name: "GitHub", blurb: "Neutral gray with blue accent", preview: ["#FFFFFF", "#0969DA", "#24292F"] },
  { id: "dracula", name: "Dracula", blurb: "Dark-first purple and pink", preview: ["#F5EFF7", "#A875E8", "#443355"] },
  { id: "nord", name: "Nord", blurb: "Cool arctic blue-gray", preview: ["#ECEFF4", "#5E81AC", "#3B4252"] },
  { id: "solarized", name: "Solarized", blurb: "Warm paper and teal", preview: ["#FDF6E3", "#268BD2", "#586E75"] },
  { id: "tokyo-night", name: "Tokyo Night", blurb: "Deep indigo night", preview: ["#E9EAF2", "#5B67C9", "#343B58"] },
  { id: "catppuccin", name: "Catppuccin", blurb: "Pastel mauve and peach", preview: ["#EFF1F5", "#8839EF", "#4C4F69"] },
  { id: "gruvbox", name: "Gruvbox", blurb: "Retro warm contrast", preview: ["#FBF1C7", "#AF3A03", "#3C3836"] },
  { id: "one-dark", name: "One Dark", blurb: "Atom-style blue gray", preview: ["#FAFAFA", "#4078F2", "#383A42"] },
  { id: "rose-pine", name: "Rosé Pine", blurb: "Muted rose and pine", preview: ["#FAF4ED", "#D7827E", "#575279"] },
  { id: "monokai", name: "Monokai", blurb: "Classic yellow-pink editor", preview: ["#F7F5EE", "#F92672", "#272822"] },
  { id: "everforest", name: "Everforest", blurb: "Soft comfort greens", preview: ["#F3EAD3", "#8DA101", "#3D484D"] },
  { id: "kanagawa", name: "Kanagawa", blurb: "Wave blues and warm reds", preview: ["#F2ECBC", "#346487", "#1F1F28"] },
  { id: "flexoki", name: "Flexoki", blurb: "Paper and ink reading palette", preview: ["#FFFCF0", "#AF3029", "#100F0F"] },
  { id: "claude", name: "Claude", blurb: "Warm paper and terracotta", preview: ["#F1EEE6", "#D97757", "#1F1E1D"] },
  { id: "t3chat", name: "t3.chat", blurb: "Hot pink on near-black", preview: ["#FBF5F7", "#E8356E", "#2A1218"] },
];

export const DEFAULT_THEME_ID = THEMES[0]!.id;
export const THEME_STORAGE_KEY = "ghn:theme";

const IDS = new Set(THEMES.map((t) => t.id));

export function isThemeId(value: unknown): value is string {
  return typeof value === "string" && IDS.has(value);
}

export function normalizeThemeId(value: unknown): string {
  return isThemeId(value) ? value : DEFAULT_THEME_ID;
}

export function readThemeId(): string {
  try {
    if (typeof window === "undefined") return DEFAULT_THEME_ID;
    return normalizeThemeId(window.localStorage.getItem(THEME_STORAGE_KEY));
  } catch {
    return DEFAULT_THEME_ID;
  }
}

export function applyThemeId(id: string): void {
  try {
    const root = document.documentElement;
    const next = normalizeThemeId(id);
    if (next === DEFAULT_THEME_ID) root.removeAttribute("data-theme");
    else root.setAttribute("data-theme", next);
  } catch {
    // private-mode DOM failures must not break rendering
  }
}

export function writeThemeId(id: string): string {
  const next = normalizeThemeId(id);
  try {
    window.localStorage.setItem(THEME_STORAGE_KEY, next);
  } catch {
    // ignore private-mode failures
  }
  applyThemeId(next);
  return next;
}

/**
 * Client hook for the Settings picker. Reads localStorage once, applies
 * `data-theme` to `<html>`, and re-applies on change. Light/dark mode
 * stays owned by next-themes (the `.dark` class); this hook only owns
 * the color theme.
 */
export function useAppTheme(): { theme: string; setTheme: (id: string) => void } {
  const [theme, setThemeState] = React.useState<string>(DEFAULT_THEME_ID);
  React.useEffect(() => {
    setThemeState(readThemeId());
    applyThemeId(readThemeId());
  }, []);
  const setTheme = React.useCallback((id: string) => {
    setThemeState(writeThemeId(id));
  }, []);
  return { theme, setTheme };
}
