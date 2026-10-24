"use client";

import * as React from "react";
import { createPortal } from "react-dom";
import { BellOff, Check, ExternalLink, Link2, Mail, MailOpen, MoreHorizontal, MousePointerClick, PanelRight } from "lucide-react";
import { Kbd } from "@/components/ui/kbd";
import { SyncSpinner } from "@/components/ui/sync-spinner";
import type { BulkAction } from "@/components/inbox/bulk-bar";
import type { InboxItem } from "@/components/inbox/notification-list";
import { cn } from "@/lib/utils";

export type ItemMenuAction = "open" | "drawer" | "copy" | "sync" | "select-repo" | BulkAction;

const MENU_WIDTH = 240;
const MENU_GAP = 8;
const ITEM_HEIGHT = 37;
const MENU_PADDING = 16;
/** Heading plus divider added between menu sections (cursor-anchored height). */
const SECTION_EXTRA = 34;

interface MenuEntry {
  value: ItemMenuAction;
  label: string;
  hint?: string;
}

interface MenuSection {
  heading: string;
  items: MenuEntry[];
}

function menuSections(item: InboxItem, isRepoSelected?: boolean): MenuSection[] {
  return [
    {
      heading: "Triage",
      items: [
        { value: "done", label: "Mark as done", hint: "d" },
        item.isRead === 0
          ? { value: "read", label: "Mark as read", hint: "r" }
          : { value: "unread", label: "Mark as unread", hint: "u" },
        { value: "unsubscribe", label: "Unsubscribe and mute", hint: "⇧U" },
      ],
    },
    {
      heading: "Open",
      items: [
        { value: "drawer", label: "Open details", hint: "⇧D" },
        { value: "open", label: "Open source", hint: "o" },
        { value: "copy", label: "Copy link", hint: "c" },
      ],
    },
    {
      heading: "Manage",
      items: [
        { value: "sync", label: "Sync this item", hint: "s" },
        isRepoSelected
          ? { value: "select-repo", label: "Show all repositories" }
          : { value: "select-repo", label: "Select this repository" },
      ],
    },
  ];
}

function menuHeight(sections: MenuSection[]): number {
  const rows = sections.reduce((n, s) => n + s.items.length, 0);
  return rows * ITEM_HEIGHT + sections.length * SECTION_EXTRA + MENU_PADDING;
}

export function ItemMenu({
  item,
  syncing,
  onAction,
  isRepoSelected,
  contextAnchor,
  onContextClose,
}: {
  item: InboxItem;
  syncing?: boolean;
  onAction: (item: InboxItem, action: ItemMenuAction) => void;
  /** True when the list is already showing only this item's repository. */
  isRepoSelected?: boolean;
  /**
   * Cursor position from a row right-click. A new object opens the same menu
   * at the cursor instead of at the trigger. Cleared via onContextClose.
   */
  contextAnchor?: { x: number; y: number } | null;
  onContextClose?: () => void;
}) {
  const [open, setOpen] = React.useState(false);
  const [pos, setPos] = React.useState({ top: 0, left: 0 });
  const triggerRef = React.useRef<HTMLButtonElement>(null);
  const menuRef = React.useRef<HTMLDivElement>(null);

  const sections = React.useMemo(
    () => menuSections(item, isRepoSelected),
    [item, isRepoSelected]
  );

  // Parent callback without re-subscribing effects on every parent render.
  const contextCloseRef = React.useRef(onContextClose);
  contextCloseRef.current = onContextClose;

  /** Closes the menu and the context anchor, refocusing the trigger on request. */
  function closeAll(focusTrigger = false) {
    setOpen(false);
    contextCloseRef.current?.();
    if (focusTrigger) triggerRef.current?.focus();
  }

  const openMenu = React.useCallback(
    (at?: { x: number; y: number } | null) => {
    if (at && (at.x > 0 || at.y > 0)) {
      // Right-click: open at the cursor, clamped into the viewport.
      const height = menuHeight(sections);
      setPos({
        top: Math.max(MENU_GAP, Math.min(at.y, window.innerHeight - height - MENU_GAP)),
        left: Math.max(
          MENU_GAP,
          Math.min(at.x, window.innerWidth - MENU_WIDTH - MENU_GAP)
        ),
      });
      setOpen(true);
      return;
    }
    // Keyboard-initiated (Shift+F10 / Menu key carries no cursor position)
    // or "..." click: anchor to the whole action group (menu trigger +
    // source link) so the dropdown clears both buttons instead of touching
    // the external link.
    const anchor = triggerRef.current?.parentElement ?? triggerRef.current;
    const rect = anchor?.getBoundingClientRect();
    if (rect) {
      const height = menuHeight(sections);
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
    },
    [sections]
  );

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
        closeAll();
      }
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") {
        closeAll(true);
      }
    }
    function onScroll() {
      closeAll();
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

  // Right-click on the row opens the same menu at the cursor. Each
  // right-click passes a new anchor object, so repeats reposition.
  // Keyboard-initiated context menus (Shift+F10 / Menu key) arrive with a
  // (0, 0) anchor; openMenu falls back to the trigger in that case.
  React.useEffect(() => {
    if (!contextAnchor) return;
    openMenu(contextAnchor);
  }, [contextAnchor, openMenu]);

  function moveFocus(current: HTMLElement, delta: 1 | -1) {
    const buttons = [...(menuRef.current?.querySelectorAll<HTMLButtonElement>("button") ?? [])];
    const idx = buttons.indexOf(current as HTMLButtonElement);
    const next = buttons[(idx + delta + buttons.length) % buttons.length];
    next?.focus();
  }

  function choose(action: ItemMenuAction) {
    closeAll(true);
    onAction(item, action);
  }

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        aria-label={`Actions for ${item.subject}`}
        aria-haspopup="menu"
        aria-expanded={open}
        title={`Actions for ${item.subject} (m)`}
        onClick={(e) => {
          e.stopPropagation();
          if (open) closeAll();
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
                const down = e.key === "ArrowDown" || e.key === "j";
                const up = e.key === "ArrowUp" || e.key === "k";
                if (down || up) {
                  e.preventDefault();
                  moveFocus(e.target as HTMLElement, down ? 1 : -1);
                }
              }}
              className="fixed z-50 overflow-hidden rounded-lg border border-border bg-card py-1 shadow-md"
              style={{ top: pos.top, left: pos.left, width: MENU_WIDTH }}
            >
              {sections.map((section) => (
                <React.Fragment key={section.heading}>
                  <div role="separator" aria-hidden="true" className="my-1 border-t border-border/40" />
                  <div role="group" aria-label={section.heading}>
                    <p
                      aria-hidden="true"
                      className="px-3 pt-1.5 pb-0.5 text-[11px] font-semibold tracking-wider text-muted-foreground uppercase"
                    >
                      {section.heading}
                    </p>
                    {section.items.map((entry) => (
                <button
                  key={entry.value}
                  type="button"
                  role="menuitem"
                  title={entry.hint ? `${entry.label} (${entry.hint})` : entry.label}
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
                  ) : entry.value === "select-repo" ? (
                    <MousePointerClick className="h-4 w-4 shrink-0" aria-hidden />
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
                  {entry.hint ? <Kbd>{entry.hint}</Kbd> : null}
                </button>
                    ))}
                  </div>
                </React.Fragment>
              ))}
            </div>,
            document.body
          )
        : null}
    </>
  );
}
