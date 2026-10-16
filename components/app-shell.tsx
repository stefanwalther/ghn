"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useTheme } from "next-themes";
import { Bell, Moon, Settings2, Sun } from "lucide-react";
import * as React from "react";
import { ContributionsChip } from "@/components/contributions-chip";
import { cn } from "@/lib/utils";

const NAV = [
  { href: "/", label: "Inbox", icon: Bell },
  { href: "/repos", label: "Repositories", icon: Settings2 },
];

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const { theme, setTheme } = useTheme();
  const [open, setOpen] = React.useState(true);

  React.useEffect(() => {
    try {
      const saved = localStorage.getItem("quiet-notifications:sidebar");
      if (saved === "closed") setOpen(false);
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

  return (
    <div className="flex min-h-screen bg-background text-foreground">
      {open ? (
        <aside className="flex w-60 shrink-0 flex-col gap-1 bg-sidebar p-4">
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
      ) : null}
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex items-center gap-2 px-4 py-3">
          <button
            type="button"
            aria-expanded={open}
            aria-label="Toggle sidebar"
            title="Toggle sidebar (Cmd+B)"
            onClick={toggleSidebar}
            className="cursor-pointer rounded-md p-2 transition-colors duration-150 hover:bg-accent hover:text-accent-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            ☰
          </button>
          <div className="min-w-0 flex-1 text-sm text-muted-foreground">
            {pathname === "/repos" ? "Digest settings per repository" : "Triage with fewer clicks"}
          </div>
          <ContributionsChip />
          <button
            type="button"
            aria-label="Toggle theme"
            aria-pressed={theme === "dark"}
            title="Toggle theme (Cmd+F12)"
            onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
            className="cursor-pointer rounded-md p-2 transition-colors duration-150 hover:bg-accent hover:text-accent-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            {theme === "dark" ? (
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
