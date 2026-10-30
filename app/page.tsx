"use client";

import { useRouter, useSearchParams } from "next/navigation";
import * as React from "react";
import { BulkBar, type BulkAction } from "@/components/inbox/bulk-bar";
import { DigestSection } from "@/components/inbox/digest-section";
import { EmptyInbox, ErrorInbox, LoadingInbox, QuietEmptyState } from "@/components/inbox/empty-states";
import { FilterSidebar } from "@/components/inbox/filter-sidebar";
import { InboxFilters } from "@/components/inbox/inbox-filters";
import { ItemDrawer } from "@/components/inbox/item-drawer";
import type { ItemMenuAction } from "@/components/inbox/item-menu";
import { ListToolbar, NotificationList, type InboxItem } from "@/components/inbox/notification-list";
import { Button } from "@/components/ui/button";
import { SyncSpinner } from "@/components/ui/sync-spinner";
import { isAltHintKey, isEditableTarget } from "@/lib/shortcuts";
import { useDialogFocus } from "@/lib/dialog-focus";
import { copyText } from "@/lib/clipboard";
import { describeBulkResult, describeRepoDoneResult, queuedBannerText } from "@/lib/bulk";
import {
  useBulkAction,
  useMarkRepoDone,
  useMarkRepoRead,
  useNotifications,
  useSyncFlow,
  useThreadSync,
  useUpdateRepository,
  type NotificationsResponse,
} from "@/lib/queries";
import { useUIStore } from "@/lib/ui-store";
import { selectByQuickFilter } from "@/lib/filters";
import {
  applyPendingIntents,
  nextFocusIndex,
  nextRepoAfterMarkDone,
  nextSelection,
  toggleAllSelection,
  type PendingIntent,
} from "@/lib/inbox-state";
import {
  parseInboxFilters,
  serializeInboxFilters,
  loadLastOpened,
  saveLastOpened,
  FILTER_DEFAULT_WIDTH,
  FILTER_MAX_WIDTH,
  FILTER_MIN_WIDTH,
  clampFilterWidth,
  loadFilterWidth,
  saveFilterWidth,
  type InboxFilters as Filters,
} from "@/lib/view-state";
import { useQueryClient } from "@tanstack/react-query";
import { queryKeys } from "@/lib/query-keys";

// Runs before paint on the client (no-op on the server) so the stored
// width is applied before anything is shown.
const useIsomorphicLayoutEffect =
  typeof window !== "undefined" ? React.useLayoutEffect : React.useEffect;

function InboxView() {
  const router = useRouter();  const searchParams = useSearchParams();
  const filters = parseInboxFilters(searchParams);
  const client = useQueryClient();
  const notifKey = queryKeys.notifications(filters);
  // Sent triage intents not yet confirmed. The displayed list folds these
  // over the last trusted server snapshot, so pre-commit refetches can
  // never restore rows that optimistic triage just removed.
  const pendingRef = React.useRef<PendingIntent[]>([]);
  const [selected, setSelected] = React.useState<Set<string>>(new Set());
  const [focusIdx, setFocusIdx] = React.useState<number | null>(null);
  const [drawerItem, setDrawerItem] = React.useState<InboxItem | null>(null);
  const [showHints, setShowHints] = React.useState(false);
  const [notice, setNotice] = React.useState<string | null>(null);
  const [confirmUnsub, setConfirmUnsub] = React.useState<string[] | null>(null);
  const confirmDialogRef = React.useRef<HTMLDivElement>(null);
  useDialogFocus(confirmDialogRef, confirmUnsub !== null);
  // Filter sidebar width persists across visits. It stays hidden until the
  // stored value is applied before first paint, so the wrong width never
  // flashes on screen.
  const [sidebarWidth, setSidebarWidth] = React.useState<number>(FILTER_DEFAULT_WIDTH);
  const [sidebarReady, setSidebarReady] = React.useState(false);
  const [resizingSidebar, setResizingSidebar] = React.useState(false);
  const [handleVisible, setHandleVisible] = React.useState(false);
  const sidebarRef = React.useRef<HTMLElement>(null);
  const sidebarDraggingRef = React.useRef(false);

  useIsomorphicLayoutEffect(() => {
    setSidebarWidth(loadFilterWidth());
    setSidebarReady(true);
  }, []);

  function resizeSidebarTo(clientX: number): void {
    const left = sidebarRef.current?.getBoundingClientRect().left ?? 0;
    setSidebarWidth(clampFilterWidth(clientX - left));
  }

  function endSidebarResize(): void {
    if (!sidebarDraggingRef.current) return;
    sidebarDraggingRef.current = false;
    setResizingSidebar(false);
    setHandleVisible(false);
    setSidebarWidth((current) => {
      saveFilterWidth(current);
      return current;
    });
  }
  // Busy state derives from the in-flight mutations, so overlapping triage
  // and sync operations keep the controls disabled until all settle.
  const bulkMutation = useBulkAction(filters);
  const markRepoDoneMutation = useMarkRepoDone(filters);
  const markRepoReadMutation = useMarkRepoRead(filters);
  const {
    syncOne: syncThread,
    syncingIds,
    isPending: threadBusy,
  } = useThreadSync(filters);
  const updateRepo = useUpdateRepository();
  const busy =
    bulkMutation.isPending ||
    markRepoDoneMutation.isPending ||
    markRepoReadMutation.isPending ||
    threadBusy;
  // Central sync flow: manual refresh, poll window, and the truthful header
  // state derived from the shared notifications and connection entries.
  const sync = useSyncFlow(filters);
  const {
    lastSyncAt,
    stale,
    syncError,
    conn,
    syncing,
    pollSecs,
    inPollWindow,
    countdownSecs,
  } = sync;

  const notifQuery = useNotifications(filters);
  const serverList = React.useMemo(
    () => notifQuery.data?.mainFlow ?? [],
    [notifQuery.data]
  );
  const collapsed = notifQuery.data?.collapsedSection ?? [];
  const quietTotal = collapsed.reduce((n, g) => n + g.pendingCount, 0);
  // The quiet group matching the repo filter, if the filter points at a
  // repo whose items are all still collapsed. Its panel explains where the
  // items are instead of claiming everything is done.
  const activeQuietGroup =
    filters.repo === "all"
      ? undefined
      : collapsed.find((g) => g.repositoryId === filters.repo);
  const showQuietNotice =
    collapsed.length > 0 && (filters.repo === "all" || activeQuietGroup !== undefined);
  const typeFacets = notifQuery.data?.facets?.types ?? [];
  const repoFacets = notifQuery.data?.facets?.repos ?? [];
  const refreshing = notifQuery.isFetching && !notifQuery.isPending;
  const queuedBanner = queuedBannerText(notifQuery.data?.queueDepth ?? 0);
  const status =
    notifQuery.isPending || notifQuery.isPlaceholderData
      ? "loading"
      : notifQuery.isError && !notifQuery.data
        ? "error"
        : "ready";

  // The displayed list folds sent-but-unconfirmed triage intents over the
  // last trusted server snapshot for the active view. Intents only apply
  // to the view that sent them, and the snapshot refreshes on every view
  // change, so rows from another filter can never appear here. Facets and
  // sidebar counts come from the shared cache, which applies the same
  // optimistic math.
  const viewKey = JSON.stringify(notifKey);
  const [viewSnapshot, setViewSnapshot] = React.useState<{
    key: string;
    base: InboxItem[];
  } | null>(null);
  const viewIntents = pendingRef.current.filter((i) => i.viewKey === viewKey);
  // The snapshot only adopts settled server data: the shared query keeps
  // showing the previous view's rows while the new view loads, and those
  // must never become the trusted base. While intents for this view are
  // pending the base stays frozen so pre-commit refetches cannot restore
  // triaged rows.
  const settled = !notifQuery.isFetching;
  if (
    !viewSnapshot ||
    (viewSnapshot.key !== viewKey && settled) ||
    (viewSnapshot.key === viewKey &&
      viewIntents.length === 0 &&
      settled &&
      viewSnapshot.base !== serverList)
  ) {
    // Adjusting state during render for a changed key or a fresh snapshot
    // is the sanctioned pattern; it renders the corrected value immediately
    // instead of flashing one frame of stale rows.
    setViewSnapshot({ key: viewKey, base: serverList });
  }
  // On a view mismatch the snapshot falls back to an empty list, never to
  // the other view's rows: placeholder data must not leak across views.
  const snapshot =
    viewSnapshot && viewSnapshot.key === viewKey ? viewSnapshot.base : [];
  const items = applyPendingIntents(snapshot, viewIntents, viewKey);

  React.useEffect(() => {
    if (notifQuery.isError && notifQuery.data) {
      setNotice("Refresh failed. Showing last loaded data.");
    }
  }, [notifQuery.isError, notifQuery.data]);

  React.useEffect(() => {
    try {
      if ("scrollRestoration" in history) history.scrollRestoration = "auto";
    } catch {
      // ignore
    }
    if (status !== "ready") return;
    const last = loadLastOpened();
    if (last) {
      document.getElementById(`notification-${last}`)?.scrollIntoView({ block: "nearest" });
    }
  }, [status]);

  function formatSyncTime(ts: number): string {
    return new Date(ts).toLocaleTimeString(undefined, {
      hour: "2-digit",
      minute: "2-digit",
    });
  }

  const refresh = sync.refresh;

  function setFilters(next: Filters) {
    router.replace(`/${serializeInboxFilters(next)}`, { scroll: false });
  }

  /** The quiet digest list takes over the main column until a real filter is picked. */
  const [quietView, setQuietView] = React.useState(false);

  function selectType(type: string) {
    setQuietView(false);
    setFilters({ ...filters, type });
  }

  function selectRepo(repo: string) {
    setQuietView(false);
    setFilters({ ...filters, repo });
  }

  function showQuietDigests() {
    setQuietView(true);
  }

  function toggle(id: string) {
    setSelected((prev) => nextSelection(items, prev, id));
  }

  function toggleAll() {
    setSelected((prev) => toggleAllSelection(items, prev));
  }

  function quickSelect(reason: string) {
    setSelected(new Set(selectByQuickFilter(items, reason)));
  }

  function openDrawer(item: InboxItem) {
    const idx = items.findIndex((i) => i.id === item.id);
    if (idx >= 0) setFocusIdx(idx);
    setDrawerItem(item);
  }

  async function menuAction(item: InboxItem, action: ItemMenuAction) {
    if (action === "drawer") {
      openDrawer(item);
      return;
    }
    if (action === "copy") {
      const ok = await copyText(item.sourceUrl);
      setNotice(ok ? "Link copied to clipboard." : "Copy failed in this browser.");
      return;
    }
    if (action === "open") {
      saveLastOpened(item.id);
      window.open(item.sourceUrl, "_blank", "noopener");
      return;
    }
    if (action === "sync") {
      await syncOne(item.id);
      return;
    }
    if (action === "select-repo") {
      setFilters({
        ...filters,
        repo: filters.repo === item.repositoryId ? "all" : item.repositoryId,
      });
      return;
    }
    void apply(action, [item.id]);
  }

  function drawerAction(item: InboxItem, action: ItemMenuAction) {
    // Done closes the drawer right away. Unsubscribe waits for the
    // confirm dialog: cancel must leave the drawer exactly as it was,
    // and apply() closes it on the confirmed path.
    if (action === "done") setDrawerItem(null);
    menuAction(item, action);
  }

  async function syncOne(id: string) {
    setNotice(null);
    try {
      const result = await syncThread(id);
      if (result.gone === true) {
        // Confirmed server truth, safe to drop from the shared cache and
        // the snapshot. The snapshot follows cache updates on the next
        // render, but a pending triage intent would freeze it with the gone
        // row still in it, so drop the row here too.
        client.setQueryData<NotificationsResponse>(notifKey, (old) =>
          old
            ? { ...old, mainFlow: old.mainFlow.filter((row) => row.id !== id) }
            : old
        );
        setViewSnapshot((prev) =>
          prev && prev.key === viewKey
            ? { key: prev.key, base: prev.base.filter((i) => i.id !== id) }
            : prev
        );
        setDrawerItem((prev) => (prev?.id === id ? null : prev));
        setNotice("Thread is gone on GitHub; marked done.");
      }
    } catch {
      setNotice("Sync failed for this item.");
    }
  }

  async function apply(action: BulkAction, ids?: string[], opts?: { confirmed?: boolean }) {
    const targets = ids ?? [...selected];
    if (targets.length === 0) return;
    if (action === "unsubscribe" && !opts?.confirmed) {
      setConfirmUnsub(targets);
      return;
    }
    setNotice(null);
    const targetSet = new Set(targets);
    if (drawerItem && targetSet.has(drawerItem.id) && (action === "done" || action === "unsubscribe")) {
      setDrawerItem(null);
    }
    // The displayed list folds this intent over the trusted snapshot until
    // the mutation confirms or fails. Rollback lives in the mutation cache.
    const intent: PendingIntent = { action, ids: targets, state: filters.state, viewKey };
    pendingRef.current = [...pendingRef.current, intent];
    setSelected(new Set());
    try {
      const body = await bulkMutation.mutateAsync({ action, ids: targets });
      // A partial remote failure queues write-backs server-side; the rows
      // stay hidden locally while the retry runs automatically. Say so
      // explicitly: without this, triage looks like a silent no-op.
      const queued = typeof body?.queued === "number" ? body.queued : 0;
      const updated = typeof body?.updated === "number" ? body.updated : targets.length;
      const queuedNotice = describeBulkResult(action, {
        updated,
        queued,
        error: typeof body?.error === "string" ? body.error : null,
      });
      if (queuedNotice) setNotice(queuedNotice);
    } catch {
      setNotice("Action failed. Restored previous state.");
    } finally {
      pendingRef.current = pendingRef.current.filter((i) => i !== intent);
    }
  }

  async function snoozeRepo(id: string, snoozedUntil: number | null) {
    setNotice(null);
    try {
      await updateRepo.mutateAsync({ id, patch: { snoozedUntil } });
      await notifQuery.refetch();
    } catch {
      setNotice("Snooze failed. Previous setting restored.");
    }
  }

  /** Promotes one repo to the immediate rhythm so its quiet items surface now. */
  async function promoteRepo(id: string) {
    setNotice(null);
    try {
      await updateRepo.mutateAsync({ id, patch: { rhythm: "immediate" } });
      await notifQuery.refetch();
    } catch {
      setNotice("Promotion failed. Previous setting restored.");
    }
  }

  /** Marks every pending item of one repo done, with rollback on failure. */
  async function markRepoDone(repositoryId: string) {
    if (markRepoDoneMutation.isPending) return;
    setNotice(null);
    const repoName =
      repoFacets.find((r) => r.id === repositoryId)?.fullName ??
      collapsed.find((g) => g.repositoryId === repositoryId)?.repositoryName ??
      repositoryId;
    const prevDrawer = drawerItem;
    const targets = items.filter((i) => i.repositoryId === repositoryId);
    if (prevDrawer != null && prevDrawer.repositoryId === repositoryId) {
      setDrawerItem(null);
    }
    const intent: PendingIntent = {
      action: "done",
      ids: targets.map((t) => t.id),
      state: filters.state,
      repositoryId,
      viewKey,
    };
    pendingRef.current = [...pendingRef.current, intent];
    const hiddenPending =
      collapsed.find((g) => g.repositoryId === repositoryId)?.pendingCount ?? 0;
    setSelected((prev) => {
      if (prev.size === 0) return prev;
      const next = new Set(prev);
      for (const t of targets) next.delete(t.id);
      return next;
    });
    try {
      const body = await markRepoDoneMutation.mutateAsync({ repositoryId });
      const updated = typeof body?.updated === "number" ? body.updated : 0;
      const queued = typeof body?.queued === "number" ? body.queued : 0;
      if (updated === 0 && queued === 0) {
        setNotice(`No pending items for ${repoName}.`);
      } else {
        const hiddenNotice =
          hiddenPending > 0
            ? describeRepoDoneResult(repoName, {
                updated,
                queued,
                error: typeof body?.error === "string" ? body.error : null,
                hiddenPending,
              })
            : null;
        const queuedNotice = describeBulkResult("done", {
          updated,
          queued,
          error: typeof body?.error === "string" ? body.error : null,
        });
        if (hiddenNotice) setNotice(hiddenNotice);
        else if (queuedNotice) setNotice(queuedNotice);
        // The sidebar hides zero-item repos unless they are the active
        // filter. When the active repo was just emptied, move the filter to
        // the next visible repo (previous when last, "all" when none
        // remain) so the emptied row disappears immediately instead of
        // lingering until the next click. Only the unread view hides the
        // repo: the "all" view keeps its done rows, and the done view
        // disables this action.
        if (filters.state === "unread" && filters.repo === repositoryId) {
          const nextRepo = nextRepoAfterMarkDone(
            repoFacets,
            filters.repo,
            repositoryId
          );
          if (nextRepo !== null) {
            setFocusIdx(null);
            setFilters({ ...filters, repo: nextRepo });
          }
        }
      }
    } catch {
      if (prevDrawer != null && prevDrawer.repositoryId === repositoryId) {
        setDrawerItem(prevDrawer);
      }
      setNotice("Mark all as done failed. Restored previous state.");
    } finally {
      pendingRef.current = pendingRef.current.filter((i) => i !== intent);
    }
  }

  const markAllDoneBusy = busy || filters.state === "done";

  /** Marks every pending item of one repo read, with rollback on failure. */
  async function markRepoRead(repositoryId: string) {
    if (markRepoReadMutation.isPending) return;
    setNotice(null);
    const repoName =
      repoFacets.find((r) => r.id === repositoryId)?.fullName ??
      collapsed.find((g) => g.repositoryId === repositoryId)?.repositoryName ??
      repositoryId;
    const targets = items.filter((i) => i.repositoryId === repositoryId);
    const intent: PendingIntent = {
      action: "read",
      ids: targets.map((t) => t.id),
      state: filters.state,
      repositoryId,
      viewKey,
    };
    pendingRef.current = [...pendingRef.current, intent];
    try {
      const body = await markRepoReadMutation.mutateAsync({ repositoryId });
      const updated = typeof body?.updated === "number" ? body.updated : 0;
      const queued = typeof body?.queued === "number" ? body.queued : 0;
      if (updated === 0 && queued === 0) {
        setNotice(`No pending items for ${repoName}.`);
      } else {
        const queuedNotice = describeBulkResult("read", {
          updated,
          queued,
          error: typeof body?.error === "string" ? body.error : null,
        });
        if (queuedNotice) setNotice(queuedNotice);
      }
    } catch {
      setNotice("Mark all as read failed. Restored previous state.");
    } finally {
      pendingRef.current = pendingRef.current.filter((i) => i !== intent);
    }
  }

  function handleRepoCopied(_id: string, ok: boolean) {
    setNotice(ok ? "Repo link copied to clipboard." : "Copy failed in this browser.");
  }

  function moveFocus(delta: number) {
    const next = nextFocusIndex(items.length, focusIdx, delta);
    if (next === null) return;
    setFocusIdx(next);
    requestAnimationFrame(() => {
      const id = items[next]?.id;
      const el = id ? document.getElementById(`notification-${id}`) : null;
      el?.focus({ preventScroll: true });
      el?.scrollIntoView({ block: "nearest" });
    });
  }

  function stepDrawer(delta: number) {
    if (items.length === 0) return;
    const currentIdx = drawerItem
      ? items.findIndex((i) => i.id === drawerItem.id)
      : (focusIdx ?? -1);
    const baseIdx = currentIdx >= 0 ? currentIdx : delta > 0 ? -1 : items.length;
    const next = Math.min(items.length - 1, Math.max(0, baseIdx + delta));
    setFocusIdx(next);
    const nextItem = items[next];
    if (nextItem) {
      setDrawerItem(nextItem);
      saveLastOpened(nextItem.id);
    }
    requestAnimationFrame(() => {
      const id = items[next]?.id;
      const el = id ? document.getElementById(`notification-${id}`) : null;
      el?.scrollIntoView({ block: "nearest" });
    });
  }

  const drawerIdx = drawerItem ? items.findIndex((i) => i.id === drawerItem.id) : -1;
  const drawerPositionLabel =
    drawerItem && drawerIdx >= 0 ? `${drawerIdx + 1} of ${items.length}` : undefined;

  React.useEffect(() => {
    if (!drawerItem) return;
    const fresh = items.find((i) => i.id === drawerItem.id);
    if (fresh && (fresh.isRead !== drawerItem.isRead || fresh.subject !== drawerItem.subject)) {
      setDrawerItem(fresh);
    }
  }, [items, drawerItem]);

  const itemsRef = React.useRef(items);
  itemsRef.current = items;
  const refreshRef = React.useRef(sync.refresh);
  refreshRef.current = sync.refresh;

  // Typed global UI actions from the palette or keyboard shortcuts elsewhere.
  // Counters use seen-refs so a remount never replays an old request.
  const openThreadReq = useUIStore((s) => s.openThread);
  const refreshReq = useUIStore((s) => s.refreshRequest);
  const scrollTopReq = useUIStore((s) => s.scrollTopRequest);
  const seenRefresh = React.useRef(refreshReq);
  const seenScrollTop = React.useRef(scrollTopReq);

  React.useEffect(() => {
    if (!openThreadReq) return;
    useUIStore.getState().consumeOpenThread();
    const found = itemsRef.current.find((i) => i.id === openThreadReq.id);
    if (!found) return;
    // When absent (different filter or page), the palette already saved
    // last-opened and navigated to the repo filter, so the existing
    // scroll-restoration effect brings it into view after load.
    const idx = itemsRef.current.findIndex((i) => i.id === openThreadReq.id);
    if (idx >= 0) setFocusIdx(idx);
    setDrawerItem(found);
  }, [openThreadReq]);

  React.useEffect(() => {
    if (refreshReq === seenRefresh.current) return;
    seenRefresh.current = refreshReq;
    void refreshRef.current();
  }, [refreshReq]);

  React.useEffect(() => {
    if (scrollTopReq === seenScrollTop.current) return;
    seenScrollTop.current = scrollTopReq;
    setSelected(new Set());
    window.scrollTo({ top: 0, behavior: "auto" });
  }, [scrollTopReq]);

  React.useEffect(() => {
    function onAltDown(e: KeyboardEvent) {
      if (isAltHintKey(e)) {
        setShowHints(true);
        e.preventDefault();
      }
    }
    function onAltUp(e: KeyboardEvent) {
      if (isAltHintKey(e) || !e.altKey) setShowHints(false);
    }
    function onBlur() {
      setShowHints(false);
    }
    window.addEventListener("keydown", onAltDown);
    window.addEventListener("keyup", onAltUp);
    window.addEventListener("blur", onBlur);
    return () => {
      window.removeEventListener("keydown", onAltDown);
      window.removeEventListener("keyup", onAltUp);
      window.removeEventListener("blur", onBlur);
    };
  }, []);

  // The keyboard handler reads the current items and the current selection,
  // so it has to see the latest state on every keystroke. The ref keeps it
  // current without removing and re-adding the listener on every render.
  const keyHandlerRef = React.useRef<(e: KeyboardEvent) => void>(() => {});

  React.useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") {
        // The shortcuts dialog now lives in the global AppShell. When it is
        // open, leave selection and drawer alone so Escape only closes help.
        if (document.querySelector('div[role="dialog"][aria-label="Keyboard shortcuts"]')) return;
        // An open context menu owns its own Escape to close; leave selection
        // and drawer alone with it.
        if (document.querySelector('div[role="menu"]')) return;
        if (confirmUnsub) {
          setConfirmUnsub(null);
          return;
        }
        if (drawerItem) setDrawerItem(null);
        else setSelected(new Set());
        return;
      }
      if (isEditableTarget(e.target)) return;
      if (document.querySelector('div[role="dialog"][aria-label="Keyboard shortcuts"]')) return;
      // A visible context menu owns the keyboard: list shortcuts stay quiet
      // while it is open so j/k and triage keys never act behind it.
      if (document.querySelector('div[role="menu"]')) return;
      if (confirmUnsub) return;
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      const drawerOpen = drawerItem !== null;
      const activeId = drawerOpen ? drawerItem.id : focusIdx !== null ? items[focusIdx]?.id : undefined;
      if (e.key === "U" && e.shiftKey) {
        if (selected.size > 0) apply("unsubscribe");
        else if (activeId) apply("unsubscribe", [activeId]);
        return;
      }
      switch (e.key) {
        case "j":
        case "ArrowDown":
          e.preventDefault();
          if (drawerOpen) stepDrawer(1);
          else moveFocus(1);
          break;
        case "k":
        case "ArrowUp":
          e.preventDefault();
          if (drawerOpen) stepDrawer(-1);
          else moveFocus(-1);
          break;
        case "[":
          if (drawerOpen) {
            e.preventDefault();
            stepDrawer(-1);
          }
          break;
        case "]":
          if (drawerOpen) {
            e.preventDefault();
            stepDrawer(1);
          }
          break;
        case "x":
          if (activeId) toggle(activeId);
          break;
        case "d":
          if (selected.size > 0) apply("done");
          else if (activeId) apply("done", [activeId]);
          break;
        case "u":
          if (selected.size > 0) apply("unread");
          else if (activeId) apply("unread", [activeId]);
          break;
        case "r":
          if (selected.size > 0) apply("read");
          else if (activeId) apply("read", [activeId]);
          break;
        case "s": {
          const targets = selected.size > 0 ? [...selected] : activeId ? [activeId] : [];
          (async () => {
            for (const id of targets) await syncOne(id);
          })();
          break;
        }
        case "o": {
          const item = drawerOpen ? drawerItem : focusIdx !== null ? items[focusIdx] : undefined;
          if (item) {
            saveLastOpened(item.id);
            window.open(item.sourceUrl, "_blank", "noopener");
          }
          break;
        }
        case "D": {
          if (!e.shiftKey) break;
          if (drawerOpen) break;
          const item = focusIdx !== null ? items[focusIdx] : undefined;
          if (item) openDrawer(item);
          break;
        }
        case "c": {
          const item = drawerOpen ? drawerItem : focusIdx !== null ? items[focusIdx] : undefined;
          if (item) void menuAction(item, "copy");
          break;
        }
        case "m": {
          // Single-key context menu for the focused row. Skipped while the
          // drawer is open: it has its own triage actions, and the row menu
          // would float above it.
          if (drawerOpen) break;
          const id = focusIdx !== null ? items[focusIdx]?.id : undefined;
          if (id) useUIStore.getState().requestMenu(id);
          break;
        }
        case "a":
          toggleAll();
          break;
        case "?":
          useUIStore.getState().openHelp();
          break;
      }
    }
    keyHandlerRef.current = onKey;
  });

  React.useEffect(() => {
    function listener(e: KeyboardEvent) {
      keyHandlerRef.current(e);
    }
    window.addEventListener("keydown", listener);
    return () => window.removeEventListener("keydown", listener);
  }, []);

  return (
    <div className="flex w-full max-w-6xl flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h1 className="text-xl font-semibold">Notifications</h1>
          <p className="text-sm text-muted-foreground">
            {filters.state === "done"
              ? "Finished items. Mark anything unread to bring it back."
              : filters.state === "all"
                ? "Every notification in one place. Digests stay collapsed until due."
                : "Triage unread notifications. Digests stay collapsed until due."}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="ghost"
            size="sm"
            title="Refresh from GitHub"
            aria-label="Refresh inbox from GitHub"
            onClick={() => void refresh()}
            disabled={syncing || refreshing || inPollWindow}
          >
            <SyncSpinner spinning={syncing || refreshing} />
          </Button>
          {lastSyncAt !== null ? (
            <span
              className="inline-flex items-baseline gap-1 text-xs tabular-nums text-muted-foreground"
              title={`Poll interval ${pollSecs}s`}
            >
              {stale ? <span>Stale ·</span> : null}
              <span>Synced {formatSyncTime(lastSyncAt)}</span>
              <span
                aria-hidden="true"
                className="inline-block min-w-[5ch] text-left"
              >
                {inPollWindow ? `· ${countdownSecs}s` : ""}
              </span>
            </span>
          ) : null}
          {lastSyncAt === null ? (
            <Button
              variant="secondary"
              size="sm"
              onClick={async () => {
                await fetch("/api/notifications/seed", { method: "POST" });
                await notifQuery.refetch();
              }}
            >
              Reseed demo data
            </Button>
          ) : null}
        </div>
      </div>
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start">
        <aside
          ref={sidebarRef}
          aria-label="Inbox filters"
          className="filter-aside relative w-full shrink-0 lg:sticky lg:top-2 lg:max-h-[calc(100vh-1rem)] lg:w-[var(--filter-w)] lg:self-start lg:overflow-y-auto"
          style={
            {
              "--filter-w": `${sidebarWidth}px`,
              visibility: sidebarReady ? undefined : "hidden",
            } as React.CSSProperties
          }
        >
          <FilterSidebar
            types={typeFacets}
            activeType={filters.type}
            repos={repoFacets}
            activeRepo={filters.repo}
            onType={selectType}
            onRepo={selectRepo}
            onSnooze={snoozeRepo}
            snoozeDisabled={updateRepo.isPending}
            onMarkAllDone={markRepoDone}
            markAllDoneBusy={markAllDoneBusy}
            onMarkAllRead={markRepoRead}
            markAllReadBusy={markAllDoneBusy}
            onCopied={handleRepoCopied}
            quietGroups={collapsed}
            quietActive={quietView}
            onQuietView={showQuietDigests}
          />
          <div
            role="separator"
            aria-orientation="vertical"
            aria-label="Resize filters sidebar"
            aria-valuenow={Math.round(sidebarWidth)}
            aria-valuemin={FILTER_MIN_WIDTH}
            aria-valuemax={FILTER_MAX_WIDTH}
            tabIndex={0}
            className="absolute top-0 bottom-0 -right-2 hidden w-4 cursor-ew-resize touch-none focus-visible:outline-none lg:block"
            title="Drag to resize filters sidebar (double-click to reset)"
            onMouseEnter={() => setHandleVisible(true)}
            onMouseLeave={() => {
              if (!sidebarDraggingRef.current) setHandleVisible(false);
            }}
            onFocus={() => setHandleVisible(true)}
            onBlur={() => {
              if (!sidebarDraggingRef.current) setHandleVisible(false);
            }}
            onPointerDown={(e) => {
              sidebarDraggingRef.current = true;
              setResizingSidebar(true);
              e.currentTarget.setPointerCapture(e.pointerId);
              resizeSidebarTo(e.clientX);
            }}
            onPointerMove={(e) => {
              if (sidebarDraggingRef.current) resizeSidebarTo(e.clientX);
            }}
            onPointerUp={endSidebarResize}
            onPointerCancel={endSidebarResize}
            onDoubleClick={() => {
              setSidebarWidth(FILTER_DEFAULT_WIDTH);
              saveFilterWidth(FILTER_DEFAULT_WIDTH);
            }}
            onKeyDown={(e) => {
              if (e.key === "ArrowLeft" || e.key === "ArrowRight") {
                e.preventDefault();
                const next = clampFilterWidth(
                  sidebarWidth + (e.key === "ArrowRight" ? 16 : -16)
                );
                setSidebarWidth(next);
                saveFilterWidth(next);
              }
            }}
          >
            <span
              aria-hidden
              style={{
                opacity: resizingSidebar || handleVisible ? 1 : 0,
                transition: "opacity 150ms",
              }}
              className="absolute inset-y-0 left-1/2 w-0.5 -translate-x-1/2 bg-ring"
            />
          </div>
        </aside>
        <div className="flex min-w-0 flex-1 flex-col gap-4">
          <InboxFilters filters={filters} onChange={setFilters} />
          <div className="sticky top-2 z-10 flex flex-col gap-2 bg-background pb-2">
            <BulkBar
              selectedCount={selected.size}
              busy={busy}
              showHints={showHints}
              onAction={apply}
              onClear={() => setSelected(new Set())}
            />
            {status === "ready" && items.length > 0 ? (
              <div className="rounded-lg bg-card shadow-sm">
                <ListToolbar
                  items={items}
                  selected={selected}
                  showHints={showHints}
                  onToggleAll={toggleAll}
                  onQuickSelect={quickSelect}
                />
              </div>
            ) : null}
          </div>
          {notice ? (
            <p role="alert" className="text-xs text-destructive">
              {notice}
            </p>
          ) : null}
          {queuedBanner ? (
            <div
              role="status"
              className="flex flex-wrap items-center gap-2 rounded-lg border border-input bg-card px-4 py-3 shadow-sm"
            >
              <p className="flex-1 text-sm text-muted-foreground">{queuedBanner}</p>
              <Button
                variant="secondary"
                size="sm"
                onClick={() => void refresh()}
                disabled={syncing}
              >
                Retry now
              </Button>
            </div>
          ) : null}
          {conn && !conn.connected ? (
            <div
              role="alert"
              className="flex flex-wrap items-center gap-2 rounded-lg border border-destructive/50 bg-card px-4 py-3 shadow-sm"
            >
              <p className="flex-1 text-sm">
                <span className="font-medium">GitHub disconnected.</span>{" "}
                <span className="text-muted-foreground">
                  Cached inbox below
                  {lastSyncAt !== null ? ` · last synced ${formatSyncTime(lastSyncAt)}` : ""}.
                  Set GH_TOKEN or run `gh auth login` on the server, then retry.
                </span>
              </p>
              <Button
                variant="secondary"
                size="sm"
                onClick={() => void refresh()}
                disabled={syncing}
              >
                Retry
              </Button>
            </div>
          ) : null}
          {conn?.connected !== false && (stale || syncError) ? (
            <div
              role="alert"
              className="flex flex-wrap items-center gap-2 rounded-lg border border-input bg-card px-4 py-3 shadow-sm"
            >
              <p className="flex-1 text-sm text-muted-foreground">
                {syncError ?? "Data may be stale."}
                {lastSyncAt !== null ? ` Last synced ${formatSyncTime(lastSyncAt)}.` : ""}
              </p>
              <Button
                variant="secondary"
                size="sm"
                onClick={() => void refresh()}
                disabled={syncing || inPollWindow}
              >
                Retry
              </Button>
            </div>
          ) : null}
          {status === "loading" ? <LoadingInbox /> : null}
          {status === "error" ? <ErrorInbox onRetry={() => void notifQuery.refetch()} /> : null}
          {status === "ready" && items.length === 0 && !quietView ? (
            showQuietNotice ? (
              <QuietEmptyState
                total={quietTotal}
                repoName={activeQuietGroup?.repositoryName}
                pendingCount={activeQuietGroup?.pendingCount}
                isSnoozed={activeQuietGroup?.isSnoozed ?? false}
                snoozeLabel={activeQuietGroup?.snoozeLabel}
                rhythm={activeQuietGroup?.rhythm}
                nextDueLabel={activeQuietGroup?.nextDueLabel}
                onUnsnooze={
                  activeQuietGroup
                    ? () => void snoozeRepo(activeQuietGroup.repositoryId, null)
                    : undefined
                }
                onPromote={
                  activeQuietGroup
                    ? () => void promoteRepo(activeQuietGroup.repositoryId)
                    : undefined
                }
                busy={updateRepo.isPending}
              />
            ) : (
              <EmptyInbox state={filters.state} />
            )
          ) : null}
          {status === "ready" && !quietView && items.length > 0 ? (
        <NotificationList
          items={items}
          selected={selected}
          focusedId={focusIdx !== null ? items[focusIdx]?.id : undefined}
          showHints={showHints}
          syncingIds={syncingIds}
          activeRepo={filters.repo}
          onToggle={toggle}
          onToggleAll={toggleAll}
          onQuickSelect={quickSelect}
          onMenuAction={menuAction}
          onOpen={(item) => openDrawer(item)}
          hideToolbar
        />
          ) : null}
          {status === "ready" && quietView && collapsed.length > 0 ? (
            <DigestSection
              groups={collapsed}
              onSnooze={snoozeRepo}
              snoozeDisabled={updateRepo.isPending}
              onMarkAllDone={markRepoDone}
              markAllDoneBusy={markAllDoneBusy}
              onMarkAllRead={markRepoRead}
              markAllReadBusy={markAllDoneBusy}
              onCopied={handleRepoCopied}
            />
          ) : null}
          {status === "ready" && quietView && collapsed.length === 0 ? (
            <EmptyInbox state={filters.state} />
          ) : null}
        </div>
      </div>
      {confirmUnsub ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 p-4">
          <div
            ref={confirmDialogRef}
            role="alertdialog"
            aria-modal="true"
            aria-labelledby="confirm-unsub-title"
            aria-describedby="confirm-unsub-desc"
            className="w-full max-w-sm rounded-lg bg-card p-6 shadow-md"
          >
            <h2 id="confirm-unsub-title" className="font-semibold">
              Unsubscribe from {confirmUnsub.length} {confirmUnsub.length === 1 ? "thread" : "threads"}?
            </h2>
            <p id="confirm-unsub-desc" className="mt-2 text-sm text-muted-foreground">
              You will stop receiving notifications for{" "}
              {confirmUnsub.length === 1 ? "this thread" : "these threads"}. This cannot be
              undone from here.
            </p>
            <div className="mt-4 flex items-center justify-end gap-2">
              <Button variant="ghost" data-autofocus onClick={() => setConfirmUnsub(null)}>
                Cancel
              </Button>
              <Button
                onClick={() => {
                  const targets = confirmUnsub;
                  setConfirmUnsub(null);
                  void apply("unsubscribe", targets, { confirmed: true });
                }}
              >
                Unsubscribe
              </Button>
            </div>
          </div>
        </div>
      ) : null}
      {drawerItem ? (
        <ItemDrawer
          item={drawerItem}
          syncing={syncingIds.has(drawerItem.id)}
          onClose={() => setDrawerItem(null)}
          onAction={drawerAction}
          onPrev={() => stepDrawer(-1)}
          onNext={() => stepDrawer(1)}
          hasPrev={drawerIdx > 0}
          hasNext={drawerIdx >= 0 && drawerIdx < items.length - 1}
          positionLabel={drawerPositionLabel}
        />
      ) : null}
    </div>
  );
}

export default function InboxPage() {
  return (
    <React.Suspense fallback={<LoadingInbox />}>
      <InboxView />
    </React.Suspense>
  );
}
