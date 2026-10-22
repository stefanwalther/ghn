"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Bell, ExternalLink, Gauge, Github, Search, Settings, Settings2 } from "lucide-react";
import * as React from "react";
import { ContributionsChip } from "@/components/contributions-chip";
import { BrandMark } from "@/components/brand-mark";
import { DemoBanner } from "@/components/demo-banner";
import { CommandPalette } from "@/components/search/command-palette";
import { ShortcutsHelp } from "@/components/inbox/shortcuts-help";
import { ThemeSwitcher } from "@/components/theme-switcher";
import { VersionIndicator } from "@/components/version-indicator";
import { Kbd } from "@/components/ui/kbd";
import { GITHUB_REPO_URL } from "@/lib/app-meta";
import { cn } from "@/lib/utils";
import { isAltHintKey, isEditableTarget, isToggleSidebarEvent } from "@/lib/shortcuts";

const NAV = [
  { href: "/", label: "Inbox", icon: Bell },
  { href: "/repos", label: "Repositories", icon: Settings2 },
  { href: "/rate-limits", label: "Rate limits", icon: Gauge },
  { href: "/settings", label: "Settings", icon: Settings },
];

const GITHUB_NAV = [
  {
    href: "https://github.com/notifications",
    label: "GitHub Notifications",
    icon: ExternalLink,
  },
  {
    href: "https://github.com/watching",
    label: "Watched repositories",
    icon: ExternalLink,
  },
  {
    href: "https://github.com/notifications/subscriptions",
    label: "Subscriptions",
    icon: ExternalLink,
  },
  {
    href: "https://github.com/settings/notifications",
    label: "Notification settings",
    icon: ExternalLink,
  },
];

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const [open, setOpen] = React.useState(true);
  const [showHints, setShowHints] = React.useState(false);
  const [helpOpen, setHelpOpen] = React.useState(false);

  React.useEffect(() => {
    try {
      const saved = localStorage.getItem("ghn:sidebar");
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
          "ghn:sidebar",
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

  React.useEffect(() => {
    function onToggle() {
      toggleRef.current();
    }
    window.addEventListener("ghn:toggle-sidebar", onToggle);
    return () => window.removeEventListener("ghn:toggle-sidebar", onToggle);
  }, []);

  React.useEffect(() => {
    function onShowHelp() {
      setHelpOpen(true);
    }
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") {
        if (helpOpen) setHelpOpen(false);
        return;
      }
      if (isEditableTarget(e.target)) return;
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      if (e.key === "?") setHelpOpen(true);
    }
    window.addEventListener("ghn:show-help", onShowHelp);
    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.removeEventListener("ghn:show-help", onShowHelp);
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [helpOpen]);

  return (
    <div className="flex min-h-screen bg-background text-foreground">
      <CommandPalette />
      {open ? (
        <>
          <div
            aria-hidden="true"
            onClick={toggleSidebar}
            className="fixed inset-0 z-30 cursor-pointer bg-background/80 md:hidden"
          />
          <aside className="fixed inset-y-0 left-0 z-40 flex w-60 shrink-0 flex-col gap-1 overflow-y-auto bg-sidebar p-4 shadow-md md:sticky md:top-0 md:z-auto md:h-screen md:shadow-none">
          <BrandMark />
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
          <div className="mt-6 mb-1 px-3 text-xs font-medium text-muted-foreground">
            GitHub
          </div>
          {GITHUB_NAV.map((item) => {
            const Icon = item.icon;
            return (
              <a
                key={item.href}
                href={item.href}
                target="_blank"
                rel="noopener noreferrer"
                onClick={() => {
                  if (window.innerWidth < 768) setOpen(false);
                }}
                className={cn(
                  "flex cursor-pointer items-center gap-2 rounded-md px-3 py-2 text-sm transition-colors duration-150 hover:bg-accent hover:text-accent-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                )}
              >
                <Icon className="h-4 w-4" aria-hidden />
                {item.label}
              </a>
            );
          })}
          <div className="mt-auto flex items-center justify-between gap-2 px-3 pt-4 text-xs text-muted-foreground">
            <VersionIndicator />
            <a
              href={GITHUB_REPO_URL}
              target="_blank"
              rel="noopener noreferrer"
              aria-label="GitHub repository"
              title="GitHub repository"
              className="flex cursor-pointer items-center gap-1 rounded-md p-1 transition-colors duration-150 hover:bg-accent hover:text-accent-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <Github className="h-4 w-4" aria-hidden />
            </a>
          </div>
          </aside>
        </>
      ) : null}
      <div className="flex min-w-0 flex-1 flex-col">
        <DemoBanner />
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
                : pathname === "/settings"
                  ? "Database location and GitHub auth status"
                  : "Triage with fewer clicks"}
          </div>
          <button
            type="button"
            aria-label="Search and commands"
            title="Search and commands (Cmd+K)"
            onClick={() => window.dispatchEvent(new CustomEvent("ghn:open-palette"))}
            className="hidden cursor-pointer items-center gap-2 rounded-md border border-input bg-background px-3 py-1.5 text-sm text-muted-foreground transition-colors duration-150 hover:bg-accent hover:text-accent-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring sm:inline-flex"
          >
            <Search className="h-4 w-4" aria-hidden />
            <span className="hidden lg:inline">Search or command…</span>
            <Kbd>⌘K</Kbd>
          </button>
          <button
            type="button"
            aria-label="Search and commands"
            title="Search and commands (Cmd+K)"
            onClick={() => window.dispatchEvent(new CustomEvent("ghn:open-palette"))}
            className="cursor-pointer rounded-md p-2 transition-colors duration-150 hover:bg-accent hover:text-accent-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring sm:hidden"
          >
            <Search className="h-4 w-4" aria-hidden />
          </button>
          <ContributionsChip />
          <button
            type="button"
            aria-label="Show keyboard shortcuts"
            title="Keyboard shortcuts (?)"
            onClick={() => setHelpOpen(true)}
            className="cursor-pointer rounded-md p-2 transition-colors duration-150 hover:bg-accent hover:text-accent-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <span aria-hidden="true" className="flex h-4 w-4 items-center justify-center text-sm font-medium">?</span>
          </button>
          <ThemeSwitcher />
        </header>
        <main className="min-w-0 flex-1 px-4 pb-10">{children}</main>
      </div>
      {helpOpen ? <ShortcutsHelp onClose={() => setHelpOpen(false)} /> : null}
    </div>
  );
}
