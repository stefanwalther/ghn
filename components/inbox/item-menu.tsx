"use client";

import * as React from "react";
import { createPortal } from "react-dom";
import { BellOff, Check, ExternalLink, Link2, Mail, MailOpen, MoreHorizontal, PanelRight } from "lucide-react";
import { Kbd } from "@/components/ui/kbd";
import { SyncSpinner } from "@/components/ui/sync-spinner";
import type { BulkAction } from "@/components/inbox/bulk-bar";
import type { InboxItem } from "@/components/inbox/notification-list";
import { cn } from "@/lib/utils";

export type ItemMenuAction = "open" | "drawer" | "copy" | "sync" | BulkAction;

const MENU_WIDTH = 240;
const MENU_GAP = 8;
const ITEM_HEIGHT = 37;
const MENU_PADDING = 16;

function menuItems(item: InboxItem): { value: ItemMenuAction; label: string; hint: string }[] {
  return [
    { value: "open", label: "Open source", hint: "O" },
    { value: "drawer", label: "Open details", hint: "⇧D" },
    { value: "copy", label: "Copy link", hint: "C" },
    { value: "sync", label: "Sync this item", hint: "S" },
    { value: "done", label: "Mark as done", hint: "D" },
    item.isRead === 0
      ? { value: "read", label: "Mark as read", hint: "R" }
      : { value: "unread", label: "Mark as unread", hint: "U" },
    { value: "unsubscribe", label: "Unsubscribe and mute", hint: "⇧U" },
  ];
}

export function ItemMenu({
  item,
  syncing,
  onAction,
}: {
  item: InboxItem;
  syncing?: boolean;
  onAction: (item: InboxItem, action: ItemMenuAction) => void;
}) {
  const [open, setOpen] = React.useState(false);
  const [pos, setPos] = React.useState({ top: 0, left: 0 });
  const triggerRef = React.useRef<HTMLButtonElement>(null);
  const menuRef = React.useRef<HTMLDivElement>(null);

  function openMenu() {
    // Anchor to the whole action group (menu trigger + source link) so the
    // dropdown clears both buttons instead of touching the external link.
    const anchor = triggerRef.current?.parentElement ?? triggerRef.current;
    const rect = anchor?.getBoundingClientRect();
    if (rect) {
      const height = items.length * ITEM_HEIGHT + MENU_PADDING;
      const below = rect.bottom + MENU_GAP;
      const top =
        below + height + MENU_GAP > window.innerHeight
          ? Math.max(MENU_GAP, rect.top - height - MENU_GAP)
          : below;
      setPos({
        top,
        left: Math.max(MENU_GAP, Math.min(rect.right - MENU_WIDTH, window.innerWidth - MENU_WIDTH - MENU_GAP)),
      });
    }
    setOpen(true);
  }

  React.useEffect(() => {
    if (!open) return;
    menuRef.current?.querySelector<HTMLButtonElement>("button")?.focus();
    function onPointerDown(e: MouseEvent) {
      const target = e.target as Node | null;
      if (
        target &&
        !menuRef.current?.contains(target) &&
        !triggerRef.current?.contains(target)
      ) {
        setOpen(false);
      }
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") {
        setOpen(false);
        triggerRef.current?.focus();
      }
    }
    function onScroll() {
      setOpen(false);
    }
    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("keydown", onKey);
    window.addEventListener("scroll", onScroll, true);
    window.addEventListener("resize", onScroll);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("keydown", onKey);
      window.removeEventListener("scroll", onScroll, true);
      window.removeEventListener("resize", onScroll);
    };
  }, [open ]);

  function moveFocus(current: HTMLElement, delta: 1 | -1) {
    const buttons = [...(menuRef.current?.querySelectorAll<HTMLButtonElement>("button") ?? [])];
    const idx = buttons.indexOf(current as HTMLButtonElement);
    const next = buttons[(idx + delta + buttons.length) % buttons.length];
    next?.focus();
  }

  function choose(action: ItemMenuAction) {
    setOpen(false);
    triggerRef.current?.focus();
    onAction(item, action);
  }

  const items = menuItems(item);

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        aria-label={`Actions for ${item.subject}`}
        aria-haspopup="menu"
        aria-expanded={open}
        title={`Actions for ${item.subject}`}
        onClick={(e) => {
          e.stopPropagation();
          if (open) setOpen(false);
          else openMenu();
        }}
        className="cursor-pointer rounded-md p-2 transition-colors duration-150 hover:bg-accent hover:text-accent-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <MoreHorizontal className="h-4 w-4" aria-hidden />
      </button>
      {open
        ? createPortal(
            <div
              ref={menuRef}
              role="menu"
              aria-label={`Actions for ${item.subject}`}
              onKeyDown={(e) => {
                if (e.key === "ArrowDown" || e.key === "ArrowUp") {
                  e.preventDefault();
                  moveFocus(e.target as HTMLElement, e.key === "ArrowDown" ? 1 : -1);
                }
              }}
              className="fixed z-50 overflow-hidden rounded-lg border border-border bg-card py-1 shadow-md"
              style={{ top: pos.top, left: pos.left, width: MENU_WIDTH }}
            >
              {items.map((entry) => (
                <button
                  key={entry.value}
                  type="button"
                  role="menuitem"
                  title={`${entry.label} (${entry.hint})`}
                  onClick={() => choose(entry.value)}
                  className={cn(
                    "flex w-full cursor-pointer items-center gap-2 px-3 py-2 text-left text-sm transition-colors duration-150 hover:bg-accent hover:text-accent-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
                  )}
                >
                  {entry.value === "open" ? (
                    <ExternalLink className="h-4 w-4 shrink-0" aria-hidden />
                  ) : entry.value === "drawer" ? (
                    <PanelRight className="h-4 w-4 shrink-0" aria-hidden />
                  ) : entry.value === "copy" ? (
                    <Link2 className="h-4 w-4 shrink-0" aria-hidden />
                  ) : entry.value === "sync" ? (
                    <SyncSpinner spinning={syncing} className="shrink-0" />
                  ) : entry.value === "done" ? (
                    <Check className="h-4 w-4 shrink-0" aria-hidden />
                  ) : entry.value === "read" ? (
                    <MailOpen className="h-4 w-4 shrink-0" aria-hidden />
                  ) : entry.value === "unread" ? (
                    <Mail className="h-4 w-4 shrink-0" aria-hidden />
                  ) : (
                    <BellOff className="h-4 w-4 shrink-0" aria-hidden />
                  )}
                  <span className="min-w-0 flex-1 truncate">
                    {entry.value === "sync" && syncing ? "Syncing…" : entry.label}
                  </span>
                  <Kbd>{entry.hint}</Kbd>
                </button>
              ))}
            </div>,
            document.body
          )
        : null}
    </>
  );
}
