"use client";

import { useRouter, useSearchParams } from "next/navigation";
import * as React from "react";
import { BulkBar, type BulkAction } from "@/components/inbox/bulk-bar";
import { DigestSection } from "@/components/inbox/digest-section";
import { EmptyInbox, ErrorInbox, LoadingInbox } from "@/components/inbox/empty-states";
import { FilterSidebar } from "@/components/inbox/filter-sidebar";
import { InboxFilters } from "@/components/inbox/inbox-filters";
import { ItemDrawer } from "@/components/inbox/item-drawer";
import type { ItemMenuAction } from "@/components/inbox/item-menu";
import { ListToolbar, NotificationList, type InboxItem } from "@/components/inbox/notification-list";
import { Button } from "@/components/ui/button";
import { SyncSpinner } from "@/components/ui/sync-spinner";
import { isAltHintKey, isEditableTarget } from "@/lib/shortcuts";
import { copyText } from "@/lib/clipboard";
import { describeBulkResult } from "@/lib/bulk";
import {
  useBulkAction,
  useNotifications,
  useSyncFlow,
  useThreadSync,
} from "@/lib/queries";
import { useUIStore } from "@/lib/ui-store";
import { selectByQuickFilter } from "@/lib/filters";
import {
  applyOptimisticList,
  nextFocusIndex,
  nextSelection,
  toggleAllSelection,
} from "@/lib/inbox-state";
import { parseInboxFilters, serializeInboxFilters, loadLastOpened, saveLastOpened, type InboxFilters as Filters } from "@/lib/view-state";

function InboxView() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const filters = parseInboxFilters(searchParams);
  const [items, setItems] = React.useState<InboxItem[]>([]);
  const [selected, setSelected] = React.useState<Set<string>>(new Set());
  const [focusIdx, setFocusIdx] = React.useState<number | null>(null);
  const [drawerItem, setDrawerItem] = React.useState<InboxItem | null>(null);
  const [showHints, setShowHints] = React.useState(false);
  const [notice, setNotice] = React.useState<string | null>(null);
  // Busy state derives from the in-flight mutations, so overlapping triage
  // and sync operations keep the controls disabled until all settle.
  const bulkMutation = useBulkAction(filters);
  const {
    syncOne: syncThread,
    syncingIds,
    isPending: threadBusy,
  } = useThreadSync(filters);
  const busy = bulkMutation.isPending || threadBusy;
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
  const typeFacets = notifQuery.data?.facets?.types ?? [];
  const repoFacets = notifQuery.data?.facets?.repos ?? [];
  const refreshing = notifQuery.isFetching && !notifQuery.isPending;
  const status =
    notifQuery.isPending
      ? "loading"
      : notifQuery.isError && !notifQuery.data
        ? "error"
        : "ready";

  // The list is a local working copy of the cached server snapshot so the
  // existing optimistic triage below keeps working. Background refetches
  // replace it with the confirmed server state.
  React.useEffect(() => {
    if (serverList.length > 0 || notifQuery.data) setItems(serverList);
  }, [serverList, notifQuery.data]);

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

  function prefersReducedMotion(): boolean {
    return (
      typeof window !== "undefined" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches
    );
  }

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
    void apply(action, [item.id]);
  }

  function drawerAction(item: InboxItem, action: ItemMenuAction) {
    if (action === "done" || action === "unsubscribe") setDrawerItem(null);
    menuAction(item, action);
  }

  async function syncOne(id: string) {
    setNotice(null);
    try {
      const result = await syncThread(id);
      if (result.gone === true) {
        setItems((prev) => prev.filter((i) => i.id !== id));
        setDrawerItem((prev) => (prev?.id === id ? null : prev));
        setNotice("Thread is gone on GitHub; marked done.");
      }
    } catch {
      setNotice("Sync failed for this item.");
    }
  }

  async function apply(action: BulkAction, ids?: string[]) {
    const targets = ids ?? [...selected];
    if (targets.length === 0) return;
    setNotice(null);
    const targetSet = new Set(targets);
    const prevItems = items;
    if (drawerItem && targetSet.has(drawerItem.id) && (action === "done" || action === "unsubscribe")) {
      setDrawerItem(null);
    }
    setItems((prev) => applyOptimisticList(prev, targets, action, filters.state));
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
      setItems(prevItems);
      setNotice("Action failed. Restored previous state.");
    }
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
        if (drawerItem) setDrawerItem(null);
        else setSelected(new Set());
        return;
      }
      if (isEditableTarget(e.target)) return;
      if (document.querySelector('div[role="dialog"][aria-label="Keyboard shortcuts"]')) return;
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
            Triage from the list. Open source only for hard calls.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="ghost"
            size="sm"
            title={inPollWindow ? `Next refresh in ${countdownSecs}s` : "Refresh from GitHub"}
            aria-label={inPollWindow ? `Next refresh in ${countdownSecs} seconds` : "Refresh inbox from GitHub"}
            onClick={() => void refresh()}
            disabled={syncing || refreshing || inPollWindow}
          >
            <SyncSpinner spinning={syncing || refreshing} />
          </Button>
          {lastSyncAt !== null ? (
            <span className="text-xs text-muted-foreground" title={`Poll interval ${pollSecs}s`}>
              {stale ? "Stale · " : ""}Synced {formatSyncTime(lastSyncAt)}
              {inPollWindow ? ` · ${countdownSecs}s` : ""}
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
        <aside className="w-full shrink-0 lg:sticky lg:top-2 lg:max-h-[calc(100vh-1rem)] lg:w-64 lg:self-start lg:overflow-y-auto">
          <FilterSidebar
            types={typeFacets}
            activeType={filters.type}
            repos={repoFacets}
            activeRepo={filters.repo}
            onType={(type) => setFilters({ ...filters, type })}
            onRepo={(repo) => setFilters({ ...filters, repo })}
          />
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
          {status === "ready" && items.length === 0 && collapsed.length === 0 ? <EmptyInbox /> : null}
          {status === "ready" && items.length > 0 ? (
        <NotificationList
          items={items}
          selected={selected}
          focusedId={focusIdx !== null ? items[focusIdx]?.id : undefined}
          showHints={showHints}
          syncingIds={syncingIds}
          onToggle={toggle}
          onToggleAll={toggleAll}
          onQuickSelect={quickSelect}
          onMenuAction={menuAction}
          onOpen={(item) => openDrawer(item)}
          hideToolbar
        />
          ) : null}
          {status === "ready" && collapsed.length > 0 ? (
            <DigestSection groups={collapsed} />
          ) : null}
        </div>
      </div>
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
