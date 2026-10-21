/**
 * The pure decision logic behind the inbox.
 *
 * These functions were moved out of the inbox screen so they can be checked
 * directly. Inside the component they were closures over component state,
 * which made them impossible to reach in isolation and impossible to point a
 * failure at a behaviour rather than at "the inbox page".
 */

export type BulkAction = "done" | "unsubscribe" | "read" | "unread";

export interface SelectableItem {
  id: string;
}

export interface ActionableItem {
  id: string;
  isRead?: number;
  isDone?: number;
}

/**
 * Toggles one item in the selection.
 *
 * The selection is a set, so toggling is set arithmetic and nothing more.
 */
export function nextSelection(
  items: SelectableItem[],
  selected: Set<string>,
  id: string
): Set<string> {
  const next = new Set(selected);
  if (next.has(id)) next.delete(id);
  else if (items.some((item) => item.id === id)) next.add(id);
  return next;
}

/**
 * Selects everything, or clears the selection when everything is already
 * selected.
 */
export function toggleAllSelection(
  items: SelectableItem[],
  selected: Set<string>
): Set<string> {
  if (items.length === 0) return new Set();
  if (items.every((item) => selected.has(item.id))) return new Set();
  return new Set(items.map((item) => item.id));
}

/**
 * The optimistic update for a triage action.
 *
 * "done" and "unsubscribe" remove the rows from the list. "read" marks them
 * as read. "unread" puts them back into the unread state.
 */
export function applyLocalAction<T extends ActionableItem>(
  items: T[],
  ids: string[],
  action: BulkAction
): T[] {
  const targetSet = new Set(ids);
  if (action === "done" || action === "unsubscribe") {
    return items.filter((item) => !targetSet.has(item.id));
  }
  if (action === "read") {
    return items.map((item) =>
      targetSet.has(item.id) ? { ...item, isRead: 1 } : item
    );
  }
  return items.map((item) =>
    targetSet.has(item.id) ? { ...item, isDone: 0, isRead: 0 } : item
  );
}

/**
 * The index the keyboard focus moves to.
 *
 * With nothing focused, moving down lands on the first row and moving up
 * lands on the last one. From a focused row the index is clamped to the
 * list.
 */
export function nextFocusIndex(
  count: number,
  current: number | null,
  delta: number
): number | null {
  if (count === 0) return null;
  if (current === null) return delta > 0 ? 0 : count - 1;
  return Math.min(count - 1, Math.max(0, current + delta));
}

export interface PollWindow {
  /** Whether the next refresh is still being held back. */
  inWindow: boolean;
  /** The seconds left before the next refresh is allowed. */
  countdownSecs: number;
}

/**
 * Whether the refresh button is being held back, and for how long.
 *
 * A sync that has never happened is never held back.
 */
export function pollWindow(
  lastSyncAt: number | null,
  pollSecs: number,
  nowMs: number
): PollWindow {
  if (lastSyncAt === null) return { inWindow: false, countdownSecs: 0 };
  const nextAllowedAt = lastSyncAt + pollSecs * 1000;
  if (nowMs >= nextAllowedAt) return { inWindow: false, countdownSecs: 0 };
  return {
    inWindow: true,
    countdownSecs: Math.ceil((nextAllowedAt - nowMs) / 1000),
  };
}
