"use client";

import * as React from "react";
import { createPortal } from "react-dom";
import { CalendarClock, Check, CheckCheck, ChevronRight, Clock, ExternalLink, Link2, MailOpen, MoreHorizontal } from "lucide-react";
import { copyText } from "@/lib/clipboard";
import { HintTooltip } from "@/components/ui/hint-tooltip";
import { snoozePresets } from "@/lib/snooze";
import { cn } from "@/lib/utils";

const MENU_WIDTH = 220;
const SUBMENU_WIDTH = 260;
const MENU_GAP = 8;
const MENU_ITEM_HEIGHT = 44;
const MENU_LIST_PADDING = 8;

/** Digest rhythms in the same order as the Repositories page select. */
const RHYTHM_OPTIONS = [
  { value: "immediate", label: "Immediate" },
  { value: "weekly", label: "Weekly" },
  { value: "biweekly", label: "Every 2 weeks" },
  { value: "monthly", label: "Monthly" },
] as const;

function rhythmLabel(value: string | undefined): string | null {
  if (!value) return null;
  return RHYTHM_OPTIONS.find((o) => o.value === value)?.label ?? value;
}

/** The five inbox presets from the request, in order. */
function inboxPresets(now: number) {
  const all = snoozePresets(now);
  const order = ["1h", "3h", "tomorrow", "nextWeek", "nextMonth"];
  return order
    .map((v) => all.find((p) => p.value === v))
    .filter((p): p is NonNullable<typeof p> => p != null);
}

/**
 * Row hover plus keyboard-focus tracking for the hover trigger. Mouse focus
 * (e.g. focus returning to the trigger after picking a preset by click)
 * does not keep the trigger visible, so it auto-hides once the pointer
 * leaves. Keyboard focus keeps it visible while tabbing.
 */
export function useRowVisibility() {
  const [hovered, setHovered] = React.useState(false);
  const [focused, setFocused] = React.useState(false);
  // Clears hover and keyboard focus so the hover trigger hides after an
  // action runs. Called before the menu closes: a keyboard close refocuses
  // the trigger afterwards (restoring visibility via :focus-visible), while
  // a pointer close leaves it hidden until the next hover.
  const reset = React.useCallback(() => {
    setHovered(false);
    setFocused(false);
  }, []);
  return {
    visible: hovered || focused,
    reset,
    rowHandlers: {
      onMouseEnter: () => setHovered(true),
      onMouseLeave: () => setHovered(false),
      onFocus: (e: React.FocusEvent) => {
        try {
          if (e.target instanceof HTMLElement && e.target.matches(":focus-visible")) {
            setFocused(true);
          }
        } catch {
          setFocused(true);
        }
      },
      onBlur: (e: React.FocusEvent) => {
        // Focus moving between the filter and the actions button keeps the
        // row active; only leaving the row hides the trigger.
        if (!e.currentTarget.contains(e.relatedTarget as Node | null)) {
          setFocused(false);
        }
      },
    },
  };
}

/** Hover actions for one repository row. More first-level entries plug in here later. */
export type RepoRowAction = "snooze" | "mark-all-done";

/**
 * "..." button revealed on row hover/focus. Opens a menu with Mark all as
 * done/read for the repository, a digest rhythm submenu, a Snooze submenu,
 * and repo link actions. Rhythm and snooze rows only appear when their
 * handler is provided.
 */
export function RepoSnoozeMenu({
  repoId,
  fullName,
  isSnoozed,
  disabled,
  onSnooze,
  currentRhythm,
  onRhythm,
  rhythmDisabled,
  onMarkAllDone,
  markAllDoneDisabled,
  markAllDoneCount,
  markAllDoneMain,
  markAllDoneQuiet,
  onMarkAllRead,
  markAllReadDisabled,
  markAllReadCount,
  repoUrl,
  onCopied,
  triggerClassName,
  triggerStyle,
  visible = true,
  contextAnchor,
  onContextClose,
  onVisibilityReset,
}: {
  repoId: string;
  fullName: string;
  isSnoozed: boolean;
  disabled?: boolean;
  onSnooze?: (id: string, snoozedUntil: number | null) => void;
  /** Current digest rhythm, shown in the Rhythm row. Omit when unknown. */
  currentRhythm?: string;
  /** Sets the digest rhythm. Omit to hide the Rhythm row. */
  onRhythm?: (id: string, rhythm: string) => void;
  /** Disables the rhythm entries, e.g. while a rhythm update is in flight. */
  rhythmDisabled?: boolean;
  /** Marks every pending notification of this repo done. Omit to hide. */
  onMarkAllDone?: (id: string) => void;
  /** Disables the done entry, e.g. while busy or with nothing pending. */
  markAllDoneDisabled?: boolean;
  /** Pending total shown in the done entry label. Omit for no count. */
  markAllDoneCount?: number;
  /** Visible main-flow items within the done total, for the quiet breakdown. */
  markAllDoneMain?: number;
  /** Collapsed quiet items within the done total, for the quiet breakdown. */
  markAllDoneQuiet?: number;
  /** Marks every pending notification of this repo read. Omit to hide. */
  onMarkAllRead?: (id: string) => void;
  /** Disables the read entry, e.g. while busy or with nothing pending. */
  markAllReadDisabled?: boolean;
  /** Pending total shown in the read entry label. Omit for no count. */
  markAllReadCount?: number;
  /**
   * Web URL of the repository root. Defaults to the github.com fallback
   * used across the app when no stored URL exists.
   */
  repoUrl?: string;
  /** Reports the clipboard result after "Copy repo link". Omit to stay silent. */
  onCopied?: (id: string, ok: boolean) => void;
  /** Extra classes for the trigger, e.g. background. */
  triggerClassName?: string;
  /** Inline style for the trigger, e.g. absolute overlay positioning. */
  triggerStyle?: React.CSSProperties;
  /**
   * Whether the row is hovered or focused. Drives trigger visibility through
   * inline styles so it never depends on CSS group-hover variants.
   * Defaults to true (always interactive).
   */
  visible?: boolean;
  /**
   * Cursor position from a row right-click. A new object opens the same menu
   * at the cursor instead of at the trigger. Cleared via onContextClose.
   */
  contextAnchor?: { x: number; y: number } | null;
  onContextClose?: () => void;
  /**
   * Clears the parent row hover/focus so the "..." trigger hides after an
   * action runs. Called before the menu closes: keyboard closes refocus the
   * trigger afterwards and become visible again via :focus-visible, pointer
   * closes stay hidden until the next hover.
   */
  onVisibilityReset?: () => void;
}) {
  const [open, setOpen] = React.useState(false);
  const [snoozeOpen, setSnoozeOpen] = React.useState(false);
  const [rhythmOpen, setRhythmOpen] = React.useState(false);
  const [pos, setPos] = React.useState({ top: 0, left: 0 });
  const [subPos, setSubPos] = React.useState({ top: 0, left: 0 });
  const [rhythmPos, setRhythmPos] = React.useState({ top: 0, left: 0 });
  const triggerRef = React.useRef<HTMLButtonElement>(null);
  const menuRef = React.useRef<HTMLDivElement>(null);
  const snoozeRowRef = React.useRef<HTMLButtonElement>(null);
  const subRef = React.useRef<HTMLDivElement>(null);
  const rhythmRowRef = React.useRef<HTMLButtonElement>(null);
  const rhythmSubRef = React.useRef<HTMLDivElement>(null);

  // Fresh timestamps at open time so "1 hr" never goes stale on a long-lived page.
  const [presets, setPresets] = React.useState(() => inboxPresets(Date.now()));
  // Unique hint ids per menu instance for aria-describedby below.
  const hintIdBase = React.useId();
  const markAllDoneHintId = `${hintIdBase}-done-hint`;
  const markAllReadHintId = `${hintIdBase}-read-hint`;

  // Parent callback without re-subscribing effects on every parent render.
  const contextCloseRef = React.useRef(onContextClose);
  contextCloseRef.current = onContextClose;

  // Row count for the cursor-anchored height without re-subscribing the
  // effect on every parent render.
  const onMarkAllDoneRef = React.useRef(onMarkAllDone);
  onMarkAllDoneRef.current = onMarkAllDone;
  const onMarkAllReadRef = React.useRef(onMarkAllRead);
  onMarkAllReadRef.current = onMarkAllRead;
  const onSnoozeRef = React.useRef(onSnooze);
  onSnoozeRef.current = onSnooze;
  const onRhythmRef = React.useRef(onRhythm);
  onRhythmRef.current = onRhythm;
  const onCopiedRef = React.useRef(onCopied);
  onCopiedRef.current = onCopied;
  const onVisibilityResetRef = React.useRef(onVisibilityReset);
  onVisibilityResetRef.current = onVisibilityReset;

  /** Hides the parent "..." trigger before the menu closes. */
  function resetVisibility() {
    onVisibilityResetRef.current?.();
  }

  /** Opens the menu below the trigger, flipping above when space is short. */
  function openMenu() {
    const fresh = inboxPresets(Date.now());
    setPresets(fresh);
    const rect = triggerRef.current?.getBoundingClientRect();
    if (rect) {
      const rows =
        2 +
        (onSnooze ? 1 : 0) +
        (onRhythm ? 1 : 0) +
        (onMarkAllDone ? 1 : 0) +
        (onMarkAllRead ? 1 : 0);
      const height = rows * MENU_ITEM_HEIGHT + MENU_LIST_PADDING;
      const below = rect.bottom + MENU_GAP;
      const top =
        below + height + MENU_GAP > window.innerHeight
          ? Math.max(MENU_GAP, rect.top - height - MENU_GAP)
          : below;
      setPos({
        top,
        left: Math.max(
          MENU_GAP,
          Math.min(rect.right - MENU_WIDTH, window.innerWidth - MENU_WIDTH - MENU_GAP)
        ),
      });
    }
    setSnoozeOpen(false);
    setRhythmOpen(false);
    setOpen(true);
  }

  /** Closes menus and the context anchor, refocusing the trigger on request. */
  function closeAll(focusTrigger = false) {
    setSnoozeOpen(false);
    setRhythmOpen(false);
    setOpen(false);
    contextCloseRef.current?.();
    if (focusTrigger) triggerRef.current?.focus();
  }

  // Right-click on the row opens the same menu at the cursor. Each
  // right-click passes a new anchor object, so repeats reposition.
  React.useEffect(() => {
    if (!contextAnchor) return;
    setPresets(inboxPresets(Date.now()));
    const rows =
      2 +
      (onSnoozeRef.current ? 1 : 0) +
      (onRhythmRef.current ? 1 : 0) +
      (onMarkAllDoneRef.current ? 1 : 0) +
      (onMarkAllReadRef.current ? 1 : 0);
    const height = rows * MENU_ITEM_HEIGHT + MENU_LIST_PADDING;
    setPos({
      top: Math.max(MENU_GAP, Math.min(contextAnchor.y, window.innerHeight - height - MENU_GAP)),
      left: Math.max(
        MENU_GAP,
        Math.min(contextAnchor.x, window.innerWidth - MENU_WIDTH - MENU_GAP)
      ),
    });
    setSnoozeOpen(false);
    setRhythmOpen(false);
    setOpen(true);
  }, [contextAnchor]);

  /** Opens the snooze presets next to the Snooze row, flipping sides as needed. */
  function openSubmenu(focusFirst: boolean) {
    const rowRect = snoozeRowRef.current?.getBoundingClientRect();
    if (rowRect) {
      const height = presets.length * 37 + (isSnoozed ? 45 : 8);
      let top = Math.min(rowRect.top, window.innerHeight - height - MENU_GAP);
      top = Math.max(MENU_GAP, top);
      let left = rowRect.right + 4;
      if (left + SUBMENU_WIDTH + MENU_GAP > window.innerWidth) {
        left = Math.max(MENU_GAP, rowRect.left - SUBMENU_WIDTH - 4);
      }
      setSubPos({ top, left });
    }
    setRhythmOpen(false);
    setSnoozeOpen(true);
    if (focusFirst) {
      requestAnimationFrame(() => {
        subRef.current?.querySelector<HTMLButtonElement>("button")?.focus();
      });
    }
  }

  /**
   * Whether a menu click came from the keyboard (Enter/Space carry detail 0;
   * real pointer clicks carry the click count). Focus returns to the trigger
   * only for keyboard use: handing it back after a pointer click pins the
   * trigger visible with a focus ring after the menu is gone.
   */
  function refocusForClick(e: React.SyntheticEvent): boolean {
    const detail = (e as unknown as { detail?: number }).detail;
    return detail === 0;
  }

  /** Applies one snooze preset choice and closes the menu. */
  function choose(at: number | null, e: React.SyntheticEvent) {
    resetVisibility();
    closeAll(refocusForClick(e));
    onSnooze?.(repoId, at);
  }

  /** Opens the rhythm options next to the Rhythm row, flipping sides as needed. */
  function openRhythmSubmenu(focusFirst: boolean) {
    const rowRect = rhythmRowRef.current?.getBoundingClientRect();
    if (rowRect) {
      const height = RHYTHM_OPTIONS.length * 37 + 8;
      let top = Math.min(rowRect.top, window.innerHeight - height - MENU_GAP);
      top = Math.max(MENU_GAP, top);
      let left = rowRect.right + 4;
      if (left + SUBMENU_WIDTH + MENU_GAP > window.innerWidth) {
        left = Math.max(MENU_GAP, rowRect.left - SUBMENU_WIDTH - 4);
      }
      setRhythmPos({ top, left });
    }
    setSnoozeOpen(false);
    setRhythmOpen(true);
    if (focusFirst) {
      requestAnimationFrame(() => {
        rhythmSubRef.current?.querySelector<HTMLButtonElement>("button")?.focus();
      });
    }
  }

  /** Applies one rhythm choice unless it is disabled or already active. */
  function chooseRhythm(value: string, e: React.SyntheticEvent) {
    if (rhythmDisabled || value === currentRhythm) return;
    closeAll(refocusForClick(e));
    onRhythm?.(repoId, value);
  }

  /** Reports the repo-wide done action unless the entry is disabled. */
  function chooseMarkAllDone(e: React.SyntheticEvent) {
    if (markAllDoneDisabled) return;
    resetVisibility();
    closeAll(refocusForClick(e));
    onMarkAllDone?.(repoId);
  }

  /** Reports the repo-wide read action unless the entry is disabled. */
  function chooseMarkAllRead(e: React.SyntheticEvent) {
    if (markAllReadDisabled) return;
    resetVisibility();
    closeAll(refocusForClick(e));
    onMarkAllRead?.(repoId);
  }

  const markAllDoneLabel =
    typeof markAllDoneCount === "number"
      ? `Mark all as done (${markAllDoneCount})`
      : "Mark all as done";
  const markAllReadLabel =
    typeof markAllReadCount === "number"
      ? `Mark all as read (${markAllReadCount})`
      : "Mark all as read";
  // Consequence hints live in the row itself, so no native title tooltip is
  // needed on these two rows (the duplicated-label ghost from the sidebar).
  const markAllDoneHint =
    typeof markAllDoneMain === "number" &&
    typeof markAllDoneQuiet === "number" &&
    markAllDoneQuiet > 0
      ? `Removes from inbox · ${markAllDoneMain} visible + ${markAllDoneQuiet} quiet`
      : "Removes from inbox";
  const markAllReadHint = "Stays in list";
  const rootUrl = repoUrl ?? `https://github.com/${fullName}`;

  /** Opens the repository root in a new window and closes the menu. */
  function openRepo(e: React.SyntheticEvent) {
    resetVisibility();
    closeAll(refocusForClick(e));
    window.open(rootUrl, "_blank", "noopener");
  }

  /** Copies the repository link and reports the clipboard result. */
  async function copyRepoLink(e: React.SyntheticEvent) {
    const keyboard = refocusForClick(e);
    resetVisibility();
    const ok = await copyText(rootUrl);
    closeAll(keyboard);
    onCopiedRef.current?.(repoId, ok);
  }

  React.useEffect(() => {
    if (!open) return;
    // Initial focus only: depending on snoozeOpen here re-ran this on
    // every submenu open/close and yanked focus back to the first row.
    const buttons = menuRef.current?.querySelectorAll("button") ?? [];
    [...buttons].find((b) => !b.disabled)?.focus();
  }, [open ]);

  React.useEffect(() => {
    if (!open) return;
    function onPointerDown(e: MouseEvent) {
      const target = e.target as Node | null;
      if (
        target &&
        !menuRef.current?.contains(target) &&
        !subRef.current?.contains(target) &&
        !rhythmSubRef.current?.contains(target) &&
        !triggerRef.current?.contains(target)
      ) {
        setSnoozeOpen(false);
        setRhythmOpen(false);
        setOpen(false);
        contextCloseRef.current?.();
      }
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") {
        if (rhythmOpen) {
          setRhythmOpen(false);
          rhythmRowRef.current?.focus();
        } else if (snoozeOpen) {
          setSnoozeOpen(false);
          snoozeRowRef.current?.focus();
        } else {
          closeAll(true);
        }
      }
    }
    function onScroll() {
      setSnoozeOpen(false);
      setRhythmOpen(false);
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
  }, [open, snoozeOpen, rhythmOpen]);

  /** Moves keyboard focus between enabled menu entries, wrapping at the ends. */
  function moveFocus(container: React.RefObject<HTMLDivElement | null>, target: HTMLElement, delta: 1 | -1) {
    // Disabled entries cannot take focus; stepping onto one stalls
    // arrow-key navigation, so they are left out of the cycle.
    const buttons = [...(container.current?.querySelectorAll<HTMLButtonElement>("button") ?? [])].filter(
      (b) => !b.disabled
    );
    const idx = buttons.indexOf(target as HTMLButtonElement);
    const next = buttons[(idx + delta + buttons.length) % buttons.length];
    next?.focus();
  }

  const shown = open || visible;
  const currentRhythmLabel = rhythmLabel(currentRhythm);

  return (
    <>
      <HintTooltip label={`Actions for ${fullName}`}>
        <button
          ref={triggerRef}
          type="button"
          aria-label={`Actions for ${fullName}`}
          aria-haspopup="menu"
          aria-expanded={open}
          disabled={disabled}
          style={{
            ...triggerStyle,
            opacity: shown ? 1 : 0,
            pointerEvents: shown ? "auto" : "none",
          }}
          onClick={(e) => {
            e.stopPropagation();
            if (open) closeAll();
            else openMenu();
          }}
          className={cn(
            "shrink-0 cursor-pointer rounded-md p-1.5 text-muted-foreground transition-opacity duration-150 hover:bg-accent hover:text-accent-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50",
            triggerClassName
          )}
        >
          <MoreHorizontal className="h-4 w-4" aria-hidden />
        </button>
      </HintTooltip>
      {open
        ? createPortal(
            <div
              ref={menuRef}
              role="menu"
              aria-label={`Actions for ${fullName}`}
              onKeyDown={(e) => {
                const down = e.key === "ArrowDown" || e.key === "j";
                const up = e.key === "ArrowUp" || e.key === "k";
                if (down || up) {
                  e.preventDefault();
                  moveFocus(menuRef, e.target as HTMLElement, down ? 1 : -1);
                } else if (e.key === "ArrowRight") {
                  if (e.target === snoozeRowRef.current) {
                    e.preventDefault();
                    openSubmenu(true);
                  } else if (e.target === rhythmRowRef.current) {
                    e.preventDefault();
                    openRhythmSubmenu(true);
                  }
                }
              }}
              className="fixed z-50 overflow-hidden rounded-lg border border-border bg-card py-1 shadow-md"
              style={{ top: pos.top, left: pos.left, width: MENU_WIDTH }}
            >
              {onMarkAllDone ? (
                <>
                  <p
                    aria-hidden="true"
                    className="px-3 pt-1.5 pb-0.5 text-[11px] font-semibold tracking-wider text-muted-foreground uppercase"
                  >
                    Triage
                  </p>
                  <button
                    type="button"
                    role="menuitem"
                    aria-label={markAllDoneLabel}
                    aria-describedby={markAllDoneHintId}
                    disabled={markAllDoneDisabled}
                    onClick={chooseMarkAllDone}
                    className="flex w-full cursor-pointer items-center gap-2 px-3 py-2 text-left text-sm transition-colors duration-150 hover:bg-accent hover:text-accent-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    <CheckCheck className="h-4 w-4 shrink-0" aria-hidden />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate">{markAllDoneLabel}</span>
                      <span id={markAllDoneHintId} className="block truncate text-xs text-muted-foreground">
                        {markAllDoneHint}
                      </span>
                    </span>
                  </button>
                </>
              ) : null}
              <p
                aria-hidden="true"
                className="px-3 pt-1.5 pb-0.5 text-[11px] font-semibold tracking-wider text-muted-foreground uppercase"
              >
                Manage
              </p>
              {onRhythm ? (
              <button
                ref={rhythmRowRef}
                type="button"
                role="menuitem"
                aria-haspopup="menu"
                aria-expanded={rhythmOpen}
                title={`Digest rhythm for ${fullName}`}
                disabled={rhythmDisabled}
                onClick={() => {
                  if (rhythmDisabled) return;
                  if (rhythmOpen) setRhythmOpen(false);
                  else openRhythmSubmenu(false);
                }}
                onMouseEnter={() => {
                  if (!rhythmOpen && !rhythmDisabled) openRhythmSubmenu(false);
                }}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    if (rhythmDisabled) return;
                    if (rhythmOpen) setRhythmOpen(false);
                    else openRhythmSubmenu(true);
                  }
                }}
                className="flex w-full cursor-pointer items-center gap-2 px-3 py-2 text-left text-sm transition-colors duration-150 hover:bg-accent hover:text-accent-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
              >
                <CalendarClock className="h-4 w-4 shrink-0" aria-hidden />
                <span className="min-w-0 flex-1 truncate">
                  Rhythm{currentRhythmLabel ? ` · ${currentRhythmLabel}` : ""}
                </span>
                <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
              </button>
              ) : null}
              {onSnooze ? (
              <button
                ref={snoozeRowRef}
                type="button"
                role="menuitem"
                aria-haspopup="menu"
                aria-expanded={snoozeOpen}
                onClick={() => {
                  if (snoozeOpen) setSnoozeOpen(false);
                  else openSubmenu(false);
                }}
                onMouseEnter={() => {
                  if (!snoozeOpen) openSubmenu(false);
                }}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    if (snoozeOpen) setSnoozeOpen(false);
                    else openSubmenu(true);
                  }
                }}
                className="flex w-full cursor-pointer items-center gap-2 px-3 py-2 text-left text-sm transition-colors duration-150 hover:bg-accent hover:text-accent-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
              >
                <Clock className="h-4 w-4 shrink-0" aria-hidden />
                <span className="min-w-0 flex-1 truncate">
                  Snooze{isSnoozed ? " (snoozed)" : ""}
                </span>
                <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
              </button>
              ) : null}
              {onMarkAllRead ? (
                <button
                  type="button"
                  role="menuitem"
                  aria-label={markAllReadLabel}
                  aria-describedby={markAllReadHintId}
                  disabled={markAllReadDisabled}
                  onClick={chooseMarkAllRead}
                  className="flex w-full cursor-pointer items-center gap-2 px-3 py-2 text-left text-sm opacity-80 transition-colors duration-150 hover:bg-accent hover:text-accent-foreground hover:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
                >
                  <MailOpen className="h-4 w-4 shrink-0" aria-hidden />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate">{markAllReadLabel}</span>
                    <span id={markAllReadHintId} className="block truncate text-xs text-muted-foreground">
                      {markAllReadHint}
                    </span>
                  </span>
                </button>
              ) : null}
              <button
                type="button"
                role="menuitem"
                onClick={openRepo}
                className="flex w-full cursor-pointer items-center gap-2 px-3 py-2 text-left text-sm transition-colors duration-150 hover:bg-accent hover:text-accent-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
              >
                <ExternalLink className="h-4 w-4 shrink-0" aria-hidden />
                <span className="min-w-0 flex-1 truncate">Open repo</span>
              </button>
              <button
                type="button"
                role="menuitem"
                onClick={copyRepoLink}
                className="flex w-full cursor-pointer items-center gap-2 px-3 py-2 text-left text-sm transition-colors duration-150 hover:bg-accent hover:text-accent-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
              >
                <Link2 className="h-4 w-4 shrink-0" aria-hidden />
                <span className="min-w-0 flex-1 truncate">Copy repo link</span>
              </button>
            </div>,
            document.body
          )
        : null}
      {open && snoozeOpen
        ? createPortal(
            <div
              ref={subRef}
              role="menu"
              aria-label={`Snooze ${fullName}`}
              onKeyDown={(e) => {
                const down = e.key === "ArrowDown" || e.key === "j";
                const up = e.key === "ArrowUp" || e.key === "k";
                if (down || up) {
                  e.preventDefault();
                  moveFocus(subRef, e.target as HTMLElement, down ? 1 : -1);
                } else if (e.key === "ArrowLeft") {
                  e.preventDefault();
                  setSnoozeOpen(false);
                  snoozeRowRef.current?.focus();
                }
              }}
              className="fixed z-50 overflow-hidden rounded-lg border border-border bg-card py-1 shadow-md"
              style={{ top: subPos.top, left: subPos.left, width: SUBMENU_WIDTH }}
            >
              <p className="px-3 py-1.5 text-xs font-medium text-muted-foreground">
                Snooze {fullName}
              </p>
              {presets.map((p) => (
                <button
                  key={p.value}
                  type="button"
                  role="menuitem"
                  onClick={(e) => choose(p.at, e)}
                  className="flex w-full cursor-pointer items-center gap-2 px-3 py-2 text-left text-sm transition-colors duration-150 hover:bg-accent hover:text-accent-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
                >
                  <span className="min-w-0 flex-1 truncate">{p.label}</span>
                </button>
              ))}
              {isSnoozed ? (
                <button
                  type="button"
                  role="menuitem"
                  onClick={(e) => choose(null, e)}
                  className="flex w-full cursor-pointer items-center gap-2 border-t border-border/40 px-3 py-2 text-left text-sm transition-colors duration-150 hover:bg-accent hover:text-accent-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
                >
                  <span className="min-w-0 flex-1 truncate">Unsnooze</span>
                </button>
              ) : null}
            </div>,
            document.body
          )
        : null}
      {open && rhythmOpen && onRhythm
        ? createPortal(
            <div
              ref={rhythmSubRef}
              role="menu"
              aria-label={`Rhythm ${fullName}`}
              onKeyDown={(e) => {
                const down = e.key === "ArrowDown" || e.key === "j";
                const up = e.key === "ArrowUp" || e.key === "k";
                if (down || up) {
                  e.preventDefault();
                  moveFocus(rhythmSubRef, e.target as HTMLElement, down ? 1 : -1);
                } else if (e.key === "ArrowLeft") {
                  e.preventDefault();
                  setRhythmOpen(false);
                  rhythmRowRef.current?.focus();
                }
              }}
              className="fixed z-50 overflow-hidden rounded-lg border border-border bg-card py-1 shadow-md"
              style={{ top: rhythmPos.top, left: rhythmPos.left, width: SUBMENU_WIDTH }}
            >
              <p className="px-3 py-1.5 text-xs font-medium text-muted-foreground">
                Digest rhythm for {fullName}
              </p>
              {RHYTHM_OPTIONS.map((o) => {
                const active = o.value === currentRhythm;
                return (
                <button
                  key={o.value}
                  type="button"
                  role="menuitem"
                  title={active ? `${o.label} (current)` : `Switch ${fullName} to ${o.label}`}
                  disabled={rhythmDisabled || active}
                  onClick={(e) => chooseRhythm(o.value, e)}
                  className="flex w-full cursor-pointer items-center gap-2 px-3 py-2 text-left text-sm transition-colors duration-150 hover:bg-accent hover:text-accent-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
                >
                  <span className="flex h-4 w-4 shrink-0 items-center justify-center" aria-hidden>
                    {active ? <Check className="h-4 w-4" /> : null}
                  </span>
                  <span className="min-w-0 flex-1 truncate">{o.label}{active ? " (current)" : ""}</span>
                </button>
                );
              })}
            </div>,
            document.body
          )
        : null}
    </>
  );
}
