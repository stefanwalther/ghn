"use client";

import { useRouter, useSearchParams } from "next/navigation";
import * as React from "react";
import { BulkBar } from "@/components/inbox/bulk-bar";
import { DigestSection } from "@/components/inbox/digest-section";
import { EmptyInbox, ErrorInbox, LoadingInbox } from "@/components/inbox/empty-states";
import { InboxFilters } from "@/components/inbox/inbox-filters";
import { NotificationList, type InboxItem } from "@/components/inbox/notification-list";
import { Button } from "@/components/ui/button";
import { parseInboxFilters, serializeInboxFilters, loadLastOpened, type InboxFilters as Filters } from "@/lib/view-state";

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
  const [selected, setSelected] = React.useState<Set<string>>(new Set());
  const [status, setStatus] = React.useState<"loading" | "ready" | "error">("loading");
  const [busy, setBusy] = React.useState(false);

  const query = serializeInboxFilters(filters);

  const load = React.useCallback(async () => {
    setStatus("loading");
    try {
      const res = await fetch(`/api/notifications${query}`, { cache: "no-store" });
      if (!res.ok) throw new Error("load failed");
      const data = await res.json();
      setItems(data.mainFlow ?? []);
      setCollapsed(data.collapsedSection ?? []);
      setStatus("ready");
    } catch {
      setStatus("error");
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

  async function apply(action: "done" | "unread") {
    if (selected.size === 0) return;
    setBusy(true);
    try {
      const res = await fetch("/api/notifications/bulk", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids: [...selected], action }),
      });
      if (!res.ok) throw new Error("bulk failed");
      setSelected(new Set());
      await load();
    } finally {
      setBusy(false);
    }
  }

  const repoOptions = React.useMemo(() => {
    const map = new Map<string, string>();
    for (const i of items) map.set(i.repositoryId, i.repositoryName);
    for (const c of collapsed) map.set(c.repositoryId, c.repositoryName);
    return [...map.entries()].map(([id, fullName]) => ({ id, fullName }));
  }, [items, collapsed]);

  return (
    <div className="mx-auto flex max-w-4xl flex-col gap-4">
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
            onClick={() => {
              setSelected(new Set());
              window.scrollTo({ top: 0, behavior: "smooth" });
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
      <InboxFilters filters={filters} repoOptions={repoOptions} onChange={setFilters} />
      <BulkBar
        selectedCount={selected.size}
        busy={busy}
        onDone={() => apply("done")}
        onUnread={() => apply("unread")}
        onClear={() => setSelected(new Set())}
      />
      {status === "loading" ? <LoadingInbox /> : null}
      {status === "error" ? <ErrorInbox onRetry={load} /> : null}
      {status === "ready" && items.length === 0 && collapsed.length === 0 ? <EmptyInbox /> : null}
      {status === "ready" && items.length > 0 ? (
        <NotificationList
          items={items}
          selected={selected}
          onToggle={toggle}
          onToggleAll={toggleAll}
        />
      ) : null}
      {status === "ready" && collapsed.length > 0 ? (
        <DigestSection groups={collapsed} />
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
