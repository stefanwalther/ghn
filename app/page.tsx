"use client";

import { useRouter, useSearchParams } from "next/navigation";
import * as React from "react";
import { BulkBar, type BulkAction } from "@/components/inbox/bulk-bar";
import { DigestSection } from "@/components/inbox/digest-section";
import { EmptyInbox, ErrorInbox, LoadingInbox } from "@/components/inbox/empty-states";
import { FilterSidebar, type RepoFacet, type TypeFacet } from "@/components/inbox/filter-sidebar";
import { InboxFilters } from "@/components/inbox/inbox-filters";
import { ItemDrawer } from "@/components/inbox/item-drawer";
import type { ItemMenuAction } from "@/components/inbox/item-menu";
import { NotificationList, type InboxItem } from "@/components/inbox/notification-list";
import { ShortcutsHelp } from "@/components/inbox/shortcuts-help";
import { Button } from "@/components/ui/button";
import { SyncSpinner } from "@/components/ui/sync-spinner";
import { Kbd } from "@/components/ui/kbd";
import { isAltHintKey, isEditableTarget } from "@/lib/shortcuts";
import { announceSync } from "@/lib/sync-events";
import { copyText } from "@/lib/clipboard";
import { describeBulkResult } from "@/lib/bulk";
import { selectByQuickFilter } from "@/lib/filters";
import {
  applyLocalAction,
  nextFocusIndex,
  nextSelection,
  pollWindow,
  toggleAllSelection,
} from "@/lib/inbox-state";
import { syncErrorMessage } from "@/lib/sync-errors";
import { parseInboxFilters, serializeInboxFilters, loadLastOpened, saveLastOpened, type InboxFilters as Filters } from "@/lib/view-state";

interface CollapsedGroup {
  repositoryId: string;
  repositoryName: string;
  rhythm: string;
  nextDueAt: number | null;
  nextDueLabel: string;
  pendingCount: number;
}

// Client-side request bounds. Bulk triage fans out over many threads
// server-side, so it gets the longest leash; everything else must settle
// fast so the busy state (which gates the triage buttons) can never stick.
const REQUEST_TIMEOUT_MS = 30_000;
const BULK_REQUEST_TIMEOUT_MS = 120_000;
const SYNC_REQUEST_TIMEOUT_MS = 120_000;

async function fetchWithTimeout(
  input: string,
  init: RequestInit | undefined,
  timeoutMs: number
): Promise<Response> {
  const controller = new AbortController();
  const timer = window.setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(input, { ...init, signal: controller.signal });
  } finally {
    window.clearTimeout(timer);
  }
}

function InboxView() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const filters = parseInboxFilters(searchParams);
  const [items, setItems] = React.useState<InboxItem[]>([]);
  const [collapsed, setCollapsed] = React.useState<CollapsedGroup[]>([]);
  const [typeFacets, setTypeFacets] = React.useState<TypeFacet[]>([]);
  const [repoFacets, setRepoFacets] = React.useState<RepoFacet[]>([]);
  const [selected, setSelected] = React.useState<Set<string>>(new Set());
  const [focusIdx, setFocusIdx] = React.useState<number | null>(null);
  const [helpOpen, setHelpOpen] = React.useState(false);
  const [drawerItem, setDrawerItem] = React.useState<InboxItem | null>(null);
  const [showHints, setShowHints] = React.useState(false);
  const [refreshing, setRefreshing] = React.useState(false);
  const [notice, setNotice] = React.useState<string | null>(null);
  const [status, setStatus] = React.useState<"loading" | "ready" | "error">("loading");
  // In-flight triage/sync operations. A counter (not a boolean) so
  // overlapping requests cannot re-enable the buttons while work remains,
  // and timeouts below guarantee it always drains back to zero.
  const [busyCount, setBusyCount] = React.useState(0);
  const busy = busyCount > 0;
  function startBusy() {
    setBusyCount((n) => n + 1);
  }
  function endBusy() {
    setBusyCount((n) => Math.max(0, n - 1));
  }
  // Row-level sync feedback: ids currently syncing show a spinner.
  const [syncingIds, setSyncingIds] = React.useState<Set<string>>(new Set());
  const [lastSyncAt, setLastSyncAt] = React.useState<number | null>(null);
  const [stale, setStale] = React.useState(false);
  const [syncing, setSyncing] = React.useState(false);
  const [pollSecs, setPollSecs] = React.useState(60);
  const [nowMs, setNowMs] = React.useState(() => Date.now());
  const [conn, setConn] = React.useState<{ connected: boolean; reason?: string } | null>(null);
  const [syncError, setSyncError] = React.useState<string | null>(null);
  const loadedRef = React.useRef(false);
  const reqRef = React.useRef(0);

  const query = serializeInboxFilters(filters);

  const load = React.useCallback(async () => {
    const silent = loadedRef.current;
    if (!silent) {
      setStatus("loading");
      announceSync(true);
    } else setRefreshing(true);
    const my = ++reqRef.current;
    try {
      const res = await fetchWithTimeout(`/api/notifications${query}`, { cache: "no-store" }, REQUEST_TIMEOUT_MS);
      if (!res.ok) throw new Error("load failed");
      const data = await res.json();
      if (reqRef.current !== my) return;
      setItems(data.mainFlow ?? []);
      setCollapsed(data.collapsedSection ?? []);
      setTypeFacets(data.facets?.types ?? []);
      setRepoFacets(data.facets?.repos ?? []);
      setLastSyncAt(typeof data.lastSyncAt === "number" ? data.lastSyncAt : null);
      setStale(data.stale === true);
      loadedRef.current = true;
      setStatus("ready");
      setNotice(null);
    } catch {
      if (reqRef.current !== my) return;
      if (!loadedRef.current) setStatus("error");
      else setNotice("Refresh failed. Showing last loaded data.");
    } finally {
      if (reqRef.current === my) {
        setRefreshing(false);
        if (!silent) announceSync(false);
      }
    }
  }, [query]);

  React.useEffect(() => {
    load();
  }, [load]);

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

  React.useEffect(() => {
    const id = window.setInterval(() => setNowMs(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, []);

  React.useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/connection", { cache: "no-store" });
        const data = await res.json().catch(() => null);
        if (!cancelled && data) {
          setConn({ connected: data.connected === true, reason: data.reason });
        }
      } catch {
        // Connection probe is best-effort; the inbox still loads from cache.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  function formatSyncTime(ts: number): string {
    return new Date(ts).toLocaleTimeString(undefined, {
      hour: "2-digit",
      minute: "2-digit",
    });
  }

  async function refresh() {
    setSyncing(true);
    announceSync(true);
    try {
      const res = await fetchWithTimeout(
        "/api/sync",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: "{}",
        },
        SYNC_REQUEST_TIMEOUT_MS
      );
      const data = await res.json().catch(() => null);
      if (data && typeof data.pollIntervalSecs === "number") setPollSecs(data.pollIntervalSecs);
      if (data && typeof data.lastSyncAt === "number") setLastSyncAt(data.lastSyncAt);
      if (data && data.fresh === false) {
        setStale(true);
        setSyncError(syncErrorMessage(data.reason));
      } else {
        setStale(false);
        setSyncError(null);
      }
    } catch {
      setSyncError("Sync failed. Showing last loaded data.");
    } finally {
      setSyncing(false);
      announceSync(false);
      try {
        const connRes = await fetch("/api/connection", { cache: "no-store" });
        const connData = await connRes.json().catch(() => null);
        if (connData) {
          setConn({ connected: connData.connected === true, reason: connData.reason });
        }
      } catch {
        // Best-effort; banner state keeps its previous value.
      }
    }
    await load();
  }

  const poll = pollWindow(lastSyncAt, pollSecs, nowMs);
  const inPollWindow = poll.inWindow && !syncing;
  const countdownSecs = poll.countdownSecs;

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
    startBusy();
    setSyncingIds((prev) => new Set(prev).add(id));
    setNotice(null);
    try {
      const res = await fetchWithTimeout(
        "/api/thread/sync",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ id }),
        },
        REQUEST_TIMEOUT_MS
      );
      const data = await res.json().catch(() => null);
      if (!res.ok) throw new Error(data?.error ?? "sync failed");
      if (data?.gone === true) {
        setItems((prev) => prev.filter((i) => i.id !== id));
        setDrawerItem((prev) => (prev?.id === id ? null : prev));
        setNotice("Thread is gone on GitHub; marked done.");
        return;
      }
      if (data?.item) {
        setItems((prev) => prev.map((i) => (i.id === id ? { ...i, ...data.item } : i)));
        setDrawerItem((prev) => (prev?.id === id ? { ...prev, ...data.item } : prev));
      }
    } catch {
      setNotice("Sync failed for this item.");
    } finally {
      endBusy();
      setSyncingIds((prev) => {
        const next = new Set(prev);
        next.delete(id);
        return next;
      });
    }
  }

  async function apply(action: BulkAction, ids?: string[]) {
    const targets = ids ?? [...selected];
    if (targets.length === 0) return;
    startBusy();
    setNotice(null);
    const targetSet = new Set(targets);
    const prevItems = items;
    if (drawerItem && targetSet.has(drawerItem.id) && (action === "done" || action === "unsubscribe")) {
      setDrawerItem(null);
    }
    setItems((prev) => applyLocalAction(prev, targets, action));
    setSelected(new Set());
    try {
      const res = await fetchWithTimeout(
        "/api/notifications/bulk",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ ids: targets, action }),
        },
        BULK_REQUEST_TIMEOUT_MS
      );
      if (!res.ok) throw new Error("bulk failed");
      const body = await res.json().catch(() => null);
      await load();
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
    } finally {
      endBusy();
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
  const refreshRef = React.useRef(refresh);
  refreshRef.current = refresh;

  React.useEffect(() => {
    function onOpenThread(e: Event) {
      const id = (e as CustomEvent<{ id?: string }>).detail?.id;
      if (!id) return;
      const found = itemsRef.current.find((i) => i.id === id);
      if (found) {
        const idx = itemsRef.current.findIndex((i) => i.id === id);
        if (idx >= 0) setFocusIdx(idx);
        setDrawerItem(found);
      }
      // When absent (different filter or page), the palette already saved
      // last-opened and navigated to the repo filter, so the existing
      // scroll-restoration effect brings it into view after load.
    }
    function onShowHelp() {
      setHelpOpen(true);
    }
    function onRefresh() {
      void refreshRef.current();
    }
    function onScrollTop() {
      setSelected(new Set());
      window.scrollTo({ top: 0, behavior: "auto" });
    }
    window.addEventListener("ghn:open-thread", onOpenThread);
    window.addEventListener("ghn:show-help", onShowHelp);
    window.addEventListener("ghn:refresh", onRefresh);
    window.addEventListener("ghn:scroll-top", onScrollTop);
    return () => {
      window.removeEventListener("ghn:open-thread", onOpenThread);
      window.removeEventListener("ghn:show-help", onShowHelp);
      window.removeEventListener("ghn:refresh", onRefresh);
      window.removeEventListener("ghn:scroll-top", onScrollTop);
    };
  }, []);

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
        if (drawerItem) setDrawerItem(null);
        else if (helpOpen) setHelpOpen(false);
        else setSelected(new Set());
        return;
      }
      if (isEditableTarget(e.target)) return;
      if (helpOpen) return;
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
          setHelpOpen(true);
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
    <div className="mx-auto flex max-w-6xl flex-col gap-4">
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
            title="Keyboard shortcuts (?)"
            aria-label="Show keyboard shortcuts"
            onClick={() => setHelpOpen(true)}
          >
            {showHints ? <Kbd>?</Kbd> : null} ?
          </Button>
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
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              setSelected(new Set());
              window.scrollTo({ top: 0, behavior: prefersReducedMotion() ? "auto" : "smooth" });
            }}
          >
            Back to inbox top
          </Button>
          {lastSyncAt === null ? (
            <Button
              variant="secondary"
              size="sm"
              onClick={async () => {
                await fetch("/api/notifications/seed", { method: "POST" });
                await load();
              }}
            >
              Reseed demo data
            </Button>
          ) : null}
        </div>
      </div>
      <div className="flex flex-col gap-4 lg:flex-row">
        <aside className="w-full shrink-0 lg:w-64">
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
          <BulkBar
            selectedCount={selected.size}
            busy={busy}
            showHints={showHints}
            onAction={apply}
            onClear={() => setSelected(new Set())}
          />
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
          {status === "error" ? <ErrorInbox onRetry={load} /> : null}
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
        />
          ) : null}
          {status === "ready" && collapsed.length > 0 ? (
            <DigestSection groups={collapsed} />
          ) : null}
        </div>
      </div>
      {helpOpen ? <ShortcutsHelp onClose={() => setHelpOpen(false)} /> : null}
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
