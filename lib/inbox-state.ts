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
 * The state-aware optimistic list update shared by the local working copy
 * and the query cache so both stay in sync.
 *
 * Mirrors applyLocalAction for the default unread view. Diverges only where
 * the filter demands it: marking done while viewing done is a no-op, and
 * marking unread while viewing done removes the restored rows.
 */
export function applyOptimisticList<T extends ActionableItem>(
  items: T[],
  ids: string[],
  action: BulkAction,
  state: string
): T[] {
  const targetSet = new Set(ids);
  if (action === "done" || action === "unsubscribe") {
    if (state === "done") return items;
    return items.filter((item) => !targetSet.has(item.id));
  }
  if (action === "read") {
    return items.map((item) =>
      targetSet.has(item.id) ? { ...item, isRead: 1 } : item
    );
  }
  if (state === "done") {
    return items.filter((item) => !targetSet.has(item.id));
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

export interface RepoCount {
  id: string;
  main: number;
  quiet: number;
  isSnoozed?: boolean;
}

/**
 * The repository to select after its pending items are marked done.
 *
 * The sidebar hides repositories with zero items unless they are the active
 * filter, so leaving the focus on an emptied repository would pin an empty
 * row in the list. Returns the next visible repository, the previous one when
 * the emptied row was last, "all" when nothing else remains, or null when no
 * navigation is needed (the emptied repo was not the active filter).
 *
 * The display order matches the sidebar: regular repositories in facet order,
 * then snoozed repositories in facet order.
 */
export function nextRepoAfterMarkDone(
  repos: RepoCount[],
  activeRepoId: string,
  emptiedRepoId: string
): string | null {
  if (activeRepoId !== emptiedRepoId) return null;
  if (activeRepoId === "all") return null;
  const visible = repos.filter(
    (r) => r.id === activeRepoId || r.main > 0 || r.quiet > 0
  );
  const display = [
    ...visible.filter((r) => !r.isSnoozed),
    ...visible.filter((r) => r.isSnoozed),
  ];
  const idx = display.findIndex((r) => r.id === emptiedRepoId);
  if (idx === -1) return null;
  const remaining = display.filter((r) => r.id !== emptiedRepoId);
  if (remaining.length === 0) return "all";
  if (idx < remaining.length) return remaining[idx]?.id ?? "all";
  return remaining[remaining.length - 1]?.id ?? "all";
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
