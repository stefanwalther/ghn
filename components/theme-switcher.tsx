"use client";

import { useTheme } from "next-themes";
import { Check, Monitor, Moon, Sun } from "lucide-react";
import * as React from "react";
import { createPortal } from "react-dom";
import { cn } from "@/lib/utils";
import { isCycleThemeEvent, isEditableTarget } from "@/lib/shortcuts";

type ThemeMode = "light" | "dark" | "system";

const OPTIONS: { mode: ThemeMode; label: string; Icon: typeof Sun }[] = [
  { mode: "light", label: "Light", Icon: Sun },
  { mode: "dark", label: "Dark", Icon: Moon },
  { mode: "system", label: "System", Icon: Monitor },
];

const MENU_WIDTH = 160;
const MENU_GAP = 8;

function nextMode(mode: string | undefined): ThemeMode {
  if (mode === "system" || mode === undefined) return "light";
  if (mode === "light") return "dark";
  return "system";
}

export function ThemeSwitcher() {
  const { theme, setTheme } = useTheme();
  const [mounted, setMounted] = React.useState(false);
  const [open, setOpen] = React.useState(false);
  const [pos, setPos] = React.useState({ top: 0, left: 0 });
  const triggerRef = React.useRef<HTMLButtonElement>(null);
  const menuRef = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    setMounted(true);
  }, []);

  // Cmd+F12 cycles light / dark / system, matching the advertised hint.
  React.useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (!isCycleThemeEvent(e)) return;
      if (isEditableTarget(e.target)) return;
      e.preventDefault();
      setTheme(nextMode(theme));
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [theme, setTheme]);

  function openMenu() {
    const rect = triggerRef.current?.getBoundingClientRect();
    if (rect) {
      setPos({
        top: rect.bottom + MENU_GAP,
        left: Math.max(
          MENU_GAP,
          Math.min(rect.right - MENU_WIDTH, window.innerWidth - MENU_WIDTH - MENU_GAP)
        ),
      });
    }
    setOpen(true);
  }

  function closeMenu(refocus: boolean) {
    setOpen(false);
    if (refocus) triggerRef.current?.focus();
    else triggerRef.current?.blur();
  }

  function choose(mode: ThemeMode) {
    setTheme(mode);
    closeMenu(false);
  }

  React.useEffect(() => {
    if (!open) return;
    const selected = menuRef.current?.querySelector<HTMLButtonElement>(
      'button[aria-checked="true"]'
    );
    (selected ?? menuRef.current?.querySelector<HTMLButtonElement>("button"))?.focus();
    function onPointerDown(e: MouseEvent) {
      const target = e.target as Node | null;
      if (
        target &&
        !menuRef.current?.contains(target) &&
        !triggerRef.current?.contains(target)
      ) {
        closeMenu(false);
      }
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") {
        e.stopPropagation();
        closeMenu(true);
      }
    }
    function onViewportChange() {
      closeMenu(false);
    }
    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("keydown", onKey, true);
    window.addEventListener("scroll", onViewportChange, true);
    window.addEventListener("resize", onViewportChange);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("keydown", onKey, true);
      window.removeEventListener("scroll", onViewportChange, true);
      window.removeEventListener("resize", onViewportChange);
    };
  }, [open]);

  function moveFocus(current: HTMLElement, delta: 1 | -1) {
    const buttons = [...(menuRef.current?.querySelectorAll<HTMLButtonElement>("button") ?? [])];
    const idx = buttons.indexOf(current as HTMLButtonElement);
    const next = buttons[(idx + delta + buttons.length) % buttons.length];
    next?.focus();
  }

  const active: ThemeMode =
    theme === "light" || theme === "dark" || theme === "system" ? theme : "system";
  const ActiveIcon = OPTIONS.find((o) => o.mode === active)?.Icon ?? Monitor;

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        aria-label="Theme"
        aria-haspopup="menu"
        aria-expanded={open}
        title="Theme (Cmd+F12)"
        onClick={() => {
          if (open) closeMenu(false);
          else openMenu();
        }}
        className="cursor-pointer rounded-md p-2 transition-colors duration-150 hover:bg-accent hover:text-accent-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        {/* Before hydration always show Monitor to match the server render. */}
        {!mounted ? (
          <Monitor className="h-4 w-4" aria-hidden />
        ) : (
          <ActiveIcon className="h-4 w-4" aria-hidden />
        )}
      </button>
      {open
        ? createPortal(
            <div
              ref={menuRef}
              role="menu"
              aria-label="Theme"
              onKeyDown={(e) => {
                if (e.key === "ArrowDown" || e.key === "ArrowUp") {
                  e.preventDefault();
                  moveFocus(e.target as HTMLElement, e.key === "ArrowDown" ? 1 : -1);
                }
              }}
              className="fixed z-50 overflow-hidden rounded-lg border border-border bg-card py-1 shadow-md"
              style={{ top: pos.top, left: pos.left, width: MENU_WIDTH }}
            >
              {OPTIONS.map(({ mode, label, Icon }) => (
                <button
                  key={mode}
                  type="button"
                  role="menuitemradio"
                  aria-checked={active === mode}
                  onClick={() => choose(mode)}
                  className={cn(
                    "flex w-full cursor-pointer items-center gap-2 px-3 py-2 text-left text-sm transition-colors duration-150 hover:bg-accent hover:text-accent-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
                  )}
                >
                  <Icon className="h-4 w-4 shrink-0" aria-hidden />
                  <span className="min-w-0 flex-1">{label}</span>
                  {active === mode ? (
                    <Check aria-label="Selected" className="h-4 w-4 shrink-0" />
                  ) : null}
                </button>
              ))}
            </div>,
            document.body
          )
        : null}
    </>
  );
}
