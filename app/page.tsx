"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { RefreshCw } from "lucide-react";
import * as React from "react";
import { BulkBar, type BulkAction } from "@/components/inbox/bulk-bar";
import { DigestSection } from "@/components/inbox/digest-section";
import { EmptyInbox, ErrorInbox, LoadingInbox } from "@/components/inbox/empty-states";
import { FilterSidebar, type RepoFacet, type TypeFacet } from "@/components/inbox/filter-sidebar";
import { InboxFilters } from "@/components/inbox/inbox-filters";
import { NotificationList, type InboxItem } from "@/components/inbox/notification-list";
import { ShortcutsHelp } from "@/components/inbox/shortcuts-help";
import { Button } from "@/components/ui/button";
import { Kbd } from "@/components/ui/kbd";
import { isEditableTarget } from "@/lib/shortcuts";
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
  const [showHints, setShowHints] = React.useState(false);
  const [refreshing, setRefreshing] = React.useState(false);
  const [notice, setNotice] = React.useState<string | null>(null);
  const [status, setStatus] = React.useState<"loading" | "ready" | "error">("loading");
  const [busy, setBusy] = React.useState(false);
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
    setSelected(new Set(items.filter((i) => i.reason === reason).map((i) => i.id)));
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
      if (e.key === "Alt") setShowHints(true);
    }
    function onAltUp(e: KeyboardEvent) {
      if (e.key === "Alt") setShowHints(false);
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
      if (isEditableTarget(e.target)) return;
      if (e.key === "Escape") {
        if (helpOpen) setHelpOpen(false);
        else setSelected(new Set());
        return;
      }
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
            title="Refresh inbox"
            aria-label="Refresh inbox"
            onClick={() => load()}
          >
            <RefreshCw
              className={refreshing ? "h-4 w-4 animate-spin" : "h-4 w-4"}
              aria-hidden
            />
          </Button>
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
        />
          ) : null}
          {status === "ready" && collapsed.length > 0 ? (
            <DigestSection groups={collapsed} />
          ) : null}
        </div>
      </div>
      {helpOpen ? <ShortcutsHelp onClose={() => setHelpOpen(false)} /> : null}
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
