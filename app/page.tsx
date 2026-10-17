"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { RefreshCw } from "lucide-react";
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
import { Kbd } from "@/components/ui/kbd";
import { isAltHintKey, isEditableTarget } from "@/lib/shortcuts";
import { copyText } from "@/lib/clipboard";
import { isMergedItem, isReleaseItem } from "@/lib/filters";
import { parseInboxFilters, serializeInboxFilters, loadLastOpened, saveLastOpened, type InboxFilters as Filters } from "@/lib/view-state";

interface CollapsedGroup {
  repositoryId: string;
  repositoryName: string;
  rhythm: string;
  nextDueAt: number | null;
  nextDueLabel: string;
  pendingCount: number;
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
  const [busy, setBusy] = React.useState(false);
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
    if (!silent) setStatus("loading");
    else setRefreshing(true);
    const my = ++reqRef.current;
    try {
      const res = await fetch(`/api/notifications${query}`, { cache: "no-store" });
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
      if (reqRef.current === my) setRefreshing(false);
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

  function syncErrorMessage(reason: unknown): string {
    if (reason === "auth") return "GitHub access missing. Run `gh auth login` on the server and refresh.";
    if (reason === "rate_limited") return "GitHub rate limit reached. Retry shortly; cached inbox shown.";
    if (reason === "network") return "GitHub unreachable. Showing cached inbox.";
    return "Sync failed. Showing last loaded data.";
  }

  async function refresh() {
    setSyncing(true);
    try {
      const res = await fetch("/api/sync", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: "{}",
      });
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

  const nextAllowedAt = lastSyncAt !== null ? lastSyncAt + pollSecs * 1000 : 0;
  const inPollWindow = lastSyncAt !== null && nowMs < nextAllowedAt && !syncing;
  const countdownSecs = inPollWindow ? Math.ceil((nextAllowedAt - nowMs) / 1000) : 0;

  function setFilters(next: Filters) {
    router.replace(`/${serializeInboxFilters(next)}`, { scroll: false });
  }

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleAll() {
    setSelected((prev) => {
      if (items.every((i) => prev.has(i.id))) return new Set();
      return new Set(items.map((i) => i.id));
    });
  }

  function quickSelect(reason: string) {
    if (reason === "release") {
      setSelected(
        new Set(
          items
            .filter((i) =>
              isReleaseItem({ reason: i.reason, subject: i.subject, subjectType: i.subjectType ?? null })
            )
            .map((i) => i.id)
        )
      );
      return;
    }
    if (reason === "merged") {
      setSelected(
        new Set(
          items.filter((i) => isMergedItem({ reason: i.reason, prMerged: i.prMerged ?? false })).map((i) => i.id)
        )
      );
      return;
    }
    setSelected(new Set(items.filter((i) => i.reason === reason).map((i) => i.id)));
  }

  async function menuAction(item: InboxItem, action: ItemMenuAction) {
    if (action === "drawer") {
      setDrawerItem(item);
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
    void apply(action, [item.id]);
  }

  function drawerAction(item: InboxItem, action: ItemMenuAction) {
    if (action === "done" || action === "unsubscribe") setDrawerItem(null);
    menuAction(item, action);
  }

  async function apply(action: BulkAction, ids?: string[]) {
    const targets = ids ?? [...selected];
    if (targets.length === 0) return;
    setBusy(true);
    setNotice(null);
    const targetSet = new Set(targets);
    const prevItems = items;
    if (action === "done" || action === "unsubscribe") {
      setItems((prev) => prev.filter((i) => !targetSet.has(i.id)));
    } else if (action === "read") {
      setItems((prev) =>
        prev.map((i) => (targetSet.has(i.id) ? { ...i, isRead: 1 } : i))
      );
    } else {
      setItems((prev) =>
        prev.map((i) =>
          targetSet.has(i.id) ? { ...i, isDone: 0, isRead: 0 } : i
        )
      );
    }
    setSelected(new Set());
    try {
      const res = await fetch("/api/notifications/bulk", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids: targets, action }),
      });
      if (!res.ok) throw new Error("bulk failed");
      await load();
    } catch {
      setItems(prevItems);
      setNotice("Action failed. Restored previous state.");
    } finally {
      setBusy(false);
    }
  }

  function moveFocus(delta: number) {
    if (items.length === 0) return;
    const next =
      focusIdx === null
        ? delta > 0
          ? 0
          : items.length - 1
        : Math.min(items.length - 1, Math.max(0, focusIdx + delta));
    setFocusIdx(next);
    requestAnimationFrame(() => {
      const id = items[next]?.id;
      const el = id ? document.getElementById(`notification-${id}`) : null;
      el?.focus({ preventScroll: true });
      el?.scrollIntoView({ block: "nearest" });
    });
  }

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
      const focusedId = focusIdx !== null ? items[focusIdx]?.id : undefined;
      if (e.key === "U" && e.shiftKey) {
        if (selected.size > 0) apply("unsubscribe");
        else if (focusedId) apply("unsubscribe", [focusedId]);
        return;
      }
      switch (e.key) {
        case "j":
        case "ArrowDown":
          e.preventDefault();
          moveFocus(1);
          break;
        case "k":
        case "ArrowUp":
          e.preventDefault();
          moveFocus(-1);
          break;
        case "x":
          if (focusedId) toggle(focusedId);
          break;
        case "e":
          if (selected.size > 0) apply("done");
          else if (focusedId) apply("done", [focusedId]);
          break;
        case "u":
          if (selected.size > 0) apply("unread");
          else if (focusedId) apply("unread", [focusedId]);
          break;
        case "r":
          if (selected.size > 0) apply("read");
          else if (focusedId) apply("read", [focusedId]);
          break;
        case "o": {
          const item = focusIdx !== null ? items[focusIdx] : undefined;
          if (item) {
            saveLastOpened(item.id);
            window.open(item.sourceUrl, "_blank", "noopener");
          }
          break;
        }
        case "d": {
          const item = focusIdx !== null ? items[focusIdx] : undefined;
          if (item) setDrawerItem(item);
          break;
        }
        case "c": {
          const item = focusIdx !== null ? items[focusIdx] : undefined;
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
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

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
            <RefreshCw
              className={syncing || refreshing ? "h-4 w-4 animate-spin" : "h-4 w-4"}
              aria-hidden
            />
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
                  Run `gh auth login` on the server, then retry.
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
          onToggle={toggle}
          onToggleAll={toggleAll}
          onQuickSelect={quickSelect}
          onMenuAction={menuAction}
          onOpen={(item) => setDrawerItem(item)}
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
          onClose={() => setDrawerItem(null)}
          onAction={drawerAction}
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
