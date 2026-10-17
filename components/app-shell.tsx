"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useTheme } from "next-themes";
import { Bell, Gauge, Moon, Settings2, Sun } from "lucide-react";
import * as React from "react";
import { ContributionsChip } from "@/components/contributions-chip";
import { Kbd } from "@/components/ui/kbd";
import { cn } from "@/lib/utils";
import { isAltHintKey, isToggleSidebarEvent } from "@/lib/shortcuts";

const NAV = [
  { href: "/", label: "Inbox", icon: Bell },
  { href: "/repos", label: "Repositories", icon: Settings2 },
  { href: "/rate-limits", label: "Rate limits", icon: Gauge },
];

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const { resolvedTheme, setTheme } = useTheme();
  // Render the server-consistent header until mounted: theme resolution and
  // viewport width are client-only and must not fork the first render.
  const [mounted, setMounted] = React.useState(false);
  const [open, setOpen] = React.useState(true);
  const [showHints, setShowHints] = React.useState(false);

  React.useEffect(() => {
    setMounted(true);
    try {
      const saved = localStorage.getItem("quiet-notifications:sidebar");
      if (saved === "closed") setOpen(false);
      else if (saved !== "open" && window.innerWidth < 768) setOpen(false);
    } catch {
      // ignore
    }
  }, []);

  function toggleSidebar() {
    setOpen((v) => {
      try {
        localStorage.setItem(
          "quiet-notifications:sidebar",
          v ? "closed" : "open"
        );
      } catch {
        // ignore
      }
      return !v;
    });
  }

  const toggleRef = React.useRef(toggleSidebar);
  toggleRef.current = toggleSidebar;

  React.useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (isAltHintKey(e)) {
        setShowHints(true);
        // Prevent the browser from shifting focus to its own menu while
        // hints are visible (Windows Alt behavior).
        e.preventDefault();
        return;
      }
      if (isToggleSidebarEvent(e)) {
        e.preventDefault();
        toggleRef.current();
      }
    }
    function onKeyUp(e: KeyboardEvent) {
      if (isAltHintKey(e) || !e.altKey) setShowHints(false);
    }
    function onBlur() {
      setShowHints(false);
    }
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);
    window.addEventListener("blur", onBlur);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
      window.removeEventListener("blur", onBlur);
    };
  }, []);

  return (
    <div className="flex min-h-screen bg-background text-foreground">
      {open ? (
        <>
          <div
            aria-hidden="true"
            onClick={toggleSidebar}
            className="fixed inset-0 z-30 cursor-pointer bg-background/80 md:hidden"
          />
          <aside className="fixed inset-y-0 left-0 z-40 flex w-60 shrink-0 flex-col gap-1 bg-sidebar p-4 shadow-md md:static md:z-auto md:shadow-none">
          <div className="mb-4 px-2 text-sm font-semibold">Quiet Notifications</div>
          {NAV.map((item) => {
            const active =
              item.href === "/" ? pathname === "/" : pathname.startsWith(item.href);
            const Icon = item.icon;
            return (
              <Link
                key={item.href}
                href={item.href}
                aria-current={active ? "page" : undefined}
                onClick={() => {
                  if (window.innerWidth < 768) setOpen(false);
                }}
                className={cn(
                  "flex cursor-pointer items-center gap-2 rounded-md px-3 py-2 text-sm transition-colors duration-150 hover:bg-accent hover:text-accent-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                  active && "bg-sidebar-accent text-sidebar-accent-foreground"
                )}
              >
                <Icon className="h-4 w-4" aria-hidden />
                {item.label}
              </Link>
            );
          })}
          </aside>
        </>
      ) : null}
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex items-center gap-2 px-4 py-3">
          <span className="relative inline-flex">
            <button
              type="button"
              aria-expanded={open}
              aria-label="Toggle sidebar"
              title="Toggle sidebar (Cmd+B)"
              onClick={toggleSidebar}
              className="cursor-pointer rounded-md p-2 transition-colors duration-150 hover:bg-accent hover:text-accent-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <span aria-hidden="true">☰</span>
            </button>
            {showHints ? (
              <Kbd
                className="pointer-events-none absolute -top-2 -right-3 shadow-sm"
              >
                <span aria-hidden="true">⌘B</span>
              </Kbd>
            ) : null}
          </span>
          <div className="min-w-0 flex-1 text-sm text-muted-foreground">
            {pathname === "/repos"
              ? "Digest settings per repository"
              : pathname === "/rate-limits"
                ? "GitHub API buckets from response headers"
                : "Triage with fewer clicks"}
          </div>
          <ContributionsChip />
          <button
            type="button"
            aria-label="Toggle theme"
            aria-pressed={mounted && resolvedTheme === "dark"}
            title="Toggle theme (Cmd+F12)"
            onClick={() => setTheme(resolvedTheme === "dark" ? "light" : "dark")}
            className="cursor-pointer rounded-md p-2 transition-colors duration-150 hover:bg-accent hover:text-accent-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            {mounted && resolvedTheme === "dark" ? (
              <Sun className="h-4 w-4" aria-hidden />
            ) : (
              <Moon className="h-4 w-4" aria-hidden />
            )}
          </button>
        </header>
        <main className="min-w-0 flex-1 px-4 pb-10">{children}</main>
      </div>
    </div>
  );
}
