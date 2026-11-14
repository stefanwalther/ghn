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
import { HintTooltip } from "@/components/ui/hint-tooltip";
import { SyncSpinner } from "@/components/ui/sync-spinner";
import { isAltHintKey, isEditableTarget } from "@/lib/shortcuts";
import { useDialogFocus } from "@/lib/dialog-focus";
import { copyText } from "@/lib/clipboard";
import {
  describeBulkResult,
  describeRepoDoneResult,
  queuedBannerText,
  BULK_CONFIRM_THRESHOLD,
} from "@/lib/bulk";
import {
  useBulkAction,
  useMarkRepoDone,
  useMarkRepoRead,
  useNotifications,
  useSyncFlow,
  useThreadSync,
  useUpdateRepository,
  type BulkMutationBody,
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
import { formatRelativeTime } from "@/lib/format-relative";

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
  // Notices are errors (red) by default; passing confirmations go muted.
  const [noticeKind, setNoticeKind] = React.useState<"error" | "info">("error");
  function say(msg: string | null, kind: "error" | "info" = "error") {
    setNotice(msg);
    if (msg !== null) setNoticeKind(kind);
  }
  const [confirmUnsub, setConfirmUnsub] = React.useState<string[] | null>(null);
  const [confirmDone, setConfirmDone] = React.useState<{
    repositoryIds: string[];
    total: number;
    main: number;
    quiet: number;
  } | null>(null);
  // Same destructive guard for id-list bulks: selecting 30 rows and hitting
  // Done must confirm just like a 30-item repo Done does.
  const [confirmBulk, setConfirmBulk] = React.useState<{
    action: BulkAction;
    ids: string[];
  } | null>(null);
  const confirmDialogRef = React.useRef<HTMLDivElement>(null);
  useDialogFocus(
    confirmDialogRef,
    confirmUnsub !== null || confirmDone !== null || confirmBulk !== null
  );
  // Per-repo pending set: only the syncing repo spins, every other repo stays
  // usable while a large background write-back drains. Replaces the old
  // global guard that blocked a second Done for seconds.
  const [pendingRepos, setPendingRepos] = React.useState<Set<string>>(new Set());
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
  const bulkMutation = useBulkAction(filters);
  const markRepoDoneMutation = useMarkRepoDone(filters);
  const markRepoReadMutation = useMarkRepoRead(filters);
  const {
    syncOne: syncThread,
    syncingIds,
  } = useThreadSync(filters);
  const updateRepo = useUpdateRepository();
  const bulkBusy = bulkMutation.isPending;
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
    nowMs,
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
  // The snapshot adopts server data it can trust: settled data, or cached
  // data that already belongs to this view. Refetching a revisited view
  // keeps that view's own cache visible while the fresh copy loads; only
  // placeholder data is excluded, because while a view loads it holds the
  // previous view's rows and those must never become the trusted base.
  // While intents for this view are pending the base stays frozen so
  // pre-commit refetches cannot restore triaged rows.
  const settled = !notifQuery.isFetching;
  if (
    !viewSnapshot ||
    (viewSnapshot.key !== viewKey &&
      !notifQuery.isPlaceholderData &&
      !notifQuery.isPending) ||
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
      say("Refresh failed. Showing last loaded data.");
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
      say(
        ok ? "Link copied to clipboard." : "Copy failed in this browser.",
        ok ? "info" : "error"
      );
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
        say("Thread is gone on GitHub; marked done.", "info");
      }
    } catch {
      say("Sync failed for this item.");
    }
  }

  async function apply(action: BulkAction, ids?: string[], opts?: { confirmed?: boolean }) {
    const targets = ids ?? [...selected];
    if (targets.length === 0) return;
    if (action === "unsubscribe" && !opts?.confirmed) {
      setConfirmUnsub(targets);
      return;
    }
    if (action === "done" && !opts?.confirmed && targets.length > BULK_CONFIRM_THRESHOLD) {
      setConfirmBulk({ action, ids: targets });
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
      const remote = typeof body?.remote === "string" ? body.remote : null;
      const queuedNotice = describeBulkResult(action, {
        updated,
        queued,
        error: typeof body?.error === "string" ? body.error : null,
        remote,
      });
      if (queuedNotice) say(queuedNotice, remote === "background" ? "info" : "error");
    } catch {
      say("Action failed. Restored previous state.");
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
      say("Snooze failed. Previous setting restored.");
    }
  }

  /**
   * Sets a repo rhythm from any repo menu. The server recomputes
   * nextDueAt/lastPromotedAt and the inbox placement, so the refetch
   * moves items between the main flow and Quiet until due immediately.
   */
  async function setRhythm(id: string, rhythm: string) {
    setNotice(null);
    try {
      await updateRepo.mutateAsync({ id, patch: { rhythm } });
      await notifQuery.refetch();
    } catch {
      setNotice("Rhythm update failed. Previous setting restored.");
    }
  }

  /** Promotes one repo to the immediate rhythm so its quiet items surface now. */
  async function promoteRepo(id: string) {
    setNotice(null);
    try {
      await updateRepo.mutateAsync({ id, patch: { rhythm: "immediate" } });
      await notifQuery.refetch();
    } catch {
      say("Promotion failed. Previous setting restored.");
    }
  }

  /**
   * Bulk fan-out for the sidebar multi-selection: one existing
   * per-repository mutation per id, in parallel.
   */
  async function bulkSnooze(ids: string[], snoozedUntil: number | null) {
    const fresh = ids.filter((id) => !pendingRepos.has(id));
    if (fresh.length === 0) return;
    const verb = snoozedUntil === null ? "unsnoozed" : "snoozed";
    setNotice(null);
    setPendingRepos((prev) => new Set([...prev, ...fresh]));
    // Sequential on purpose, like the done/read fan-out: each mutation
    // snapshots settled predecessors only.
    const succeeded: string[] = [];
    const failed: string[] = [];
    for (const id of fresh) {
      try {
        await updateRepo.mutateAsync({ id, patch: { snoozedUntil } });
        succeeded.push(id);
      } catch {
        failed.push(id);
      }
    }
    try {
      if (succeeded.length > 0) {
        // Confirm the settled state from the server. A failed refresh
        // leaves the settled optimistic values in place and surfaces
        // through the shared refresh-failed notice.
        await notifQuery.refetch().catch(() => null);
        const okNotice =
          succeeded.length === 1
            ? `Repository ${verb}.`
            : `${succeeded.length} repositories ${verb}.`;
        say(
          failed.length === 0
            ? okNotice
            : `${okNotice} Failed for ${failed
                .map((id) => repoFacets.find((r) => r.id === id)?.fullName ?? id)
                .join(", ")}; those repos were restored.`,
          failed.length === 0 ? "info" : "error"
        );
      } else {
        say("Snooze failed. Previous setting restored.");
      }
    } finally {
      setPendingRepos((prev) => {
        const next = new Set(prev);
        for (const id of fresh) next.delete(id);
        return next;
      });
    }
  }

  async function bulkRhythm(ids: string[], rhythm: string) {
    const fresh = ids.filter((id) => !pendingRepos.has(id));
    if (fresh.length === 0) return;
    setNotice(null);
    setPendingRepos((prev) => new Set([...prev, ...fresh]));
    // Sequential on purpose, like the done/read fan-out: each mutation
    // snapshots settled predecessors only.
    const succeeded: string[] = [];
    const failed: string[] = [];
    for (const id of fresh) {
      try {
        await updateRepo.mutateAsync({ id, patch: { rhythm } });
        succeeded.push(id);
      } catch {
        failed.push(id);
      }
    }
    try {
      if (succeeded.length > 0) {
        // Confirm the settled state from the server. A failed refresh
        // leaves the settled optimistic values in place and surfaces
        // through the shared refresh-failed notice.
        await notifQuery.refetch().catch(() => null);
        const okNotice =
          succeeded.length === 1
            ? "Digest rhythm updated."
            : `${succeeded.length} repositories switched to the same rhythm.`;
        say(
          failed.length === 0
            ? okNotice
            : `${okNotice} Failed for ${failed
                .map((id) => repoFacets.find((r) => r.id === id)?.fullName ?? id)
                .join(", ")}; those repos were restored.`,
          failed.length === 0 ? "info" : "error"
        );
      } else {
        say("Rhythm update failed. Previous setting restored.");
      }
    } finally {
      setPendingRepos((prev) => {
        const next = new Set(prev);
        for (const id of fresh) next.delete(id);
        return next;
      });
    }
  }

  async function bulkDone(ids: string[]) {
    await markRepoDone(ids);
  }

  async function bulkRead(ids: string[]) {
    await markRepoRead(ids);
  }

  function handleBulkCopied(ids: string[], ok: boolean) {
    say(
      ok
        ? ids.length === 1
          ? "Repo link copied to clipboard."
          : `${ids.length} repo links copied to clipboard.`
        : "Copy failed in this browser.",
      ok ? "info" : "error"
    );
  }

  /** Marks every pending item of one or more repos done, with rollback on failure. */
  async function markRepoDone(repositoryIds: string | string[], opts?: { confirmed?: boolean }) {
    const requested = Array.isArray(repositoryIds) ? repositoryIds : [repositoryIds];
    // Only repos with repo-wide pending items act. Zero-count members are
    // neither confirmed, busied, nor sent, so narrowing filters cannot
    // inflate the dialog or fire no-op mutations.
    const pendingOf = (id: string) => {
      const facet = repoFacets.find((r) => r.id === id);
      const quietGroup = collapsed.find((g) => g.repositoryId === id);
      return (
        facet?.pendingAll ?? facet?.pending ?? (((facet?.main ?? 0) + (facet?.quiet ?? 0)) ||
          quietGroup?.pendingCount ||
          0)
      );
    };
    const ids = requested.filter((id) => pendingOf(id) > 0);
    const first = requested[0] ?? "";
    const requestedName =
      requested.length === 1
        ? (repoFacets.find((r) => r.id === first)?.fullName ??
          collapsed.find((g) => g.repositoryId === first)?.repositoryName ??
          first)
        : `${requested.length} repositories`;
    if (ids.length === 0) {
      say(`No pending items for ${requestedName}.`, "info");
      return;
    }
    if (ids.some((id) => pendingRepos.has(id))) return;
    // Filters captured when the batch begins; completion navigation must
    // not clobber a filter change the user made while it ran.
    const startFilters = filters;
    // Totals use repo-wide counts so narrowing filters cannot undercount
    // what the action will mark done. The visible split only describes the
    // current view while type and age stay unfiltered (see splitExact).
    let total = 0;
    let main = 0;
    for (const id of ids) total += pendingOf(id);
    for (const id of ids) main += repoFacets.find((r) => r.id === id)?.main ?? 0;
    // The visible/quiet split is only exact when the view covers every
    // not-done row the same way the repo-wide total does. Facets ignore the
    // repo filter, but a narrowed type or age filter hides rows the action
    // still marks done, so the difference would mislabel them as quiet.
    // State matters too: the all view counts already-done rows into facet
    // main and the done view is done rows only, while the total is not-done
    // rows; only the unread view shares the total's scope. Omit the split
    // when the counts cannot be trusted.
    const splitExact =
      filters.type === "all" &&
      filters.age === "all" &&
      filters.state === "unread";
    const quiet = splitExact ? Math.max(0, total - main) : 0;
    if (!opts?.confirmed && total > BULK_CONFIRM_THRESHOLD) {
      setConfirmDone({ repositoryIds: ids, total, main, quiet });
      return;
    }
    setNotice(null);
    setPendingRepos((prev) => new Set([...prev, ...ids]));
    const repoName =
      ids.length === 1
        ? (repoFacets.find((r) => r.id === ids[0])?.fullName ??
          collapsed.find((g) => g.repositoryId === ids[0])?.repositoryName ??
          ids[0])
        : `${ids.length} repositories`;
    const prevDrawer = drawerItem;
    const startDrawerGen = drawerOpenGenRef.current;
    const targets = items.filter((i) => ids.includes(i.repositoryId));
    if (prevDrawer != null && ids.includes(prevDrawer.repositoryId)) {
      setDrawerItem(null);
    }
    const intents: PendingIntent[] = ids.map((repositoryId) => ({
      action: "done",
      ids: targets.filter((t) => t.repositoryId === repositoryId).map((t) => t.id),
      state: filters.state,
      repositoryId,
      viewKey,
    }));
    pendingRef.current = [...pendingRef.current, ...intents];
    setSelected((prev) => {
      if (prev.size === 0) return prev;
      const next = new Set(prev);
      for (const t of targets) next.delete(t.id);
      return next;
    });
    // Every mutation settles before busy state drains, so a failure cannot
    // release a still-pending sibling early. Only failed repos roll back;
    // successes stand and are reported alongside the failures.
    // Mutations run sequentially on purpose: each one snapshots the settled
    // outcome of its predecessors, so a rollback can only ever restore
    // settled state and never clobber a still-pending sibling, no matter
    // when confirming refetches land.
    const succeeded: string[] = [];
    const failed: string[] = [];
    const bodies: BulkMutationBody[] = [];
    for (const id of ids) {
      try {
        bodies.push(await markRepoDoneMutation.mutateAsync({ repositoryId: id }));
        succeeded.push(id);
      } catch {
        failed.push(id);
      }
    }
    const updated = bodies.reduce(
      (n, b) => n + (typeof b?.updated === "number" ? b.updated : 0),
      0
    );
    const queued = bodies.reduce(
      (n, b) => n + (typeof b?.queued === "number" ? b.queued : 0),
      0
    );
    const remote = bodies.some((b) => b?.remote === "background")
      ? "background"
      : typeof bodies[0]?.remote === "string"
        ? (bodies[0]?.remote as string)
        : null;
    // First error from non-partial bodies only: partial reasons get their
    // own per-repo line, so the generic notices must not repeat the first
    // partial error.
    const error =
      succeeded
        .map((_, i) => bodies[i])
        .filter((b) => b?.remote !== "partial")
        .map((b) => (typeof b?.error === "string" ? b.error : null)).find(Boolean) ?? null;
    // Partial remote results arrive with HTTP 200, so they never land in
    // `failed`. Track them separately or a background sibling would hide
    // their queued counts and reasons.
    // Responses stay paired with their repository through the succeeded
    // list, since failed requests contribute no body and plain indexes
    // would drift after a failure.
    const partialPairs = succeeded
      .map((id, i) => ({ id, body: bodies[i] }))
      .filter((p) => p.body?.remote === "partial");
    const partialUpdated = partialPairs.reduce(
      (n, p) => n + (typeof p.body?.updated === "number" ? p.body.updated : 0),
      0
    );
    const partialQueued = partialPairs.reduce(
      (n, p) => n + (typeof p.body?.queued === "number" ? p.body.queued : 0),
      0
    );
    const partialErrors = [
      ...new Set(
        partialPairs.flatMap((p) =>
          typeof p.body?.error === "string" ? [p.body.error] : []
        )
      ),
    ];
    const partialNames = partialPairs
      .map((p) => repoFacets.find((r) => r.id === p.id)?.fullName ?? p.id)
      .join(", ");
    const failedNames = failed
      .map((id) => repoFacets.find((r) => r.id === id)?.fullName ?? id)
      .join(", ");
    // Background counts stay scoped to background results so a mixed set
    // never reports partial rows as background-synced.
    const bgIds = new Set(
      succeeded.filter((_, i) => bodies[i]?.remote === "background")
    );
    const bgVisibleCount = targets.filter((t) => bgIds.has(t.repositoryId)).length;
    const bgUpdated = bodies.reduce(
      (n, b) => n + (b?.remote === "background" && typeof b?.updated === "number" ? b.updated : 0),
      0
    );
    // Hidden counts describe only repos that fully settled: failed repos
    // keep their quiet items, and a partial repo still has queued quiet
    // items, so neither may appear as marked done here. Partial state is
    // reported on the per-repo line instead.
    const partialIds = new Set(partialPairs.map((p) => p.id));
    const hiddenPending = collapsed
      .filter(
        (g) => succeeded.includes(g.repositoryId) && !partialIds.has(g.repositoryId)
      )
      .reduce((n, g) => n + g.pendingCount, 0);
    const hiddenRepoName =
      succeeded.length === 1
        ? (repoFacets.find((r) => r.id === succeeded[0])?.fullName ??
          collapsed.find((g) => g.repositoryId === succeeded[0])?.repositoryName ??
          succeeded[0])
        : `${succeeded.length} repositories`;
    try {
      if (failed.length === ids.length) {
        say("Mark all as done failed. Restored previous state.");
      } else {
        const parts: string[] = [];
        if (updated === 0 && queued === 0) {
          parts.push(`No pending items for ${repoName}.`);
        } else if (remote === "background") {
          // Updated counts visible plus quiet; only the visible rows just left
          // the screen, so spell out the split or the total looks wrong.
          const quietDone = Math.max(0, bgUpdated - bgVisibleCount);
          parts.push(
            quietDone > 0
              ? `${bgUpdated} marked done (${bgVisibleCount} visible + ${quietDone} quiet), syncing to GitHub in background.`
              : `${bgUpdated} marked done, syncing to GitHub in background.`
          );
          if (partialQueued > 0) {
            parts.push(
              `Partially applied for ${partialNames}: ${partialUpdated} marked done, ${partialQueued} queued for retry (${partialErrors.join("; ") || "unknown reason"}).`
            );
          }
        } else {
          // The hidden-item notice keeps its scope: partial counts and
          // errors belong to the per-repo partial line below, not to the
          // hidden summary.
          const hiddenNotice =
            hiddenPending > 0
              ? describeRepoDoneResult(hiddenRepoName, {
                  updated: updated - partialUpdated,
                  queued: queued - partialQueued,
                  error,
                  hiddenPending,
                })
              : null;
          // Partial results carry their own per-repo line (names plus every
          // distinct error); keep them out of the generic notice so a batch
          // without background results neither drops them nor truncates the
          // reasons to the first error.
          const restNotice = describeBulkResult("done", {
            updated: updated - partialUpdated,
            queued: queued - partialQueued,
            error,
            remote,
          });
          if (hiddenNotice) parts.push(hiddenNotice);
          else if (restNotice) parts.push(restNotice);
          if (partialQueued > 0) {
            parts.push(
              `Partially applied for ${partialNames}: ${partialUpdated} marked done, ${partialQueued} queued for retry (${partialErrors.join("; ") || "unknown reason"}).`
            );
          }
        }
        if (failed.length > 0) {
          parts.push(`Done failed for ${failedNames}; those repos were restored.`);
        }
        if (parts.length > 0) say(parts.join(" "), failed.length > 0 || partialQueued > 0 ? "error" : "info");
      }
      // The sidebar hides zero-item repos unless they are the active
      // filter. When the active repo was just emptied, move the filter to
      // the next visible repo (previous when last, "all" when none
      // remain) so the emptied row disappears immediately instead of
      // lingering until the next click. Only the unread view hides the
      // repo: the "all" view keeps its done rows, and the done view
      // disables this action. Runs on both the background and the
      // foreground path: large background dones empty the repo too.
      // Navigation follows only succeeded repos, and never a filter the
      // user changed while the batch ran. Every filter field counts: a
      // newer type or age choice must block navigation just like a newer
      // repository or state choice does.
      const liveFilters = filtersRef.current;
      const filtersUnchanged =
        liveFilters.repo === startFilters.repo &&
        liveFilters.state === startFilters.state &&
        liveFilters.type === startFilters.type &&
        liveFilters.age === startFilters.age;
      if (
        liveFilters.state === "unread" &&
        filtersUnchanged &&
        succeeded.includes(liveFilters.repo)
      ) {
        const nextRepo = nextRepoAfterMarkDone(
          repoFacets,
          liveFilters.repo,
          succeeded
        );
        if (nextRepo !== null) {
          setFocusIdx(null);
          setFilters({ ...liveFilters, repo: nextRepo });
        }
      }
    } finally {
      // Restore the saved drawer only when it belongs to a failed repo,
      // the user has not opened another drawer since, and no drawer choice
      // was made while the batch ran (an open-then-close still counts as a
      // choice: the user deliberately dismissed the drawer).
      const newerDrawer = drawerItemRef.current;
      if (
        prevDrawer != null &&
        failed.includes(prevDrawer.repositoryId) &&
        (newerDrawer == null || newerDrawer.id === prevDrawer.id) &&
        drawerOpenGenRef.current === startDrawerGen
      ) {
        setDrawerItem(prevDrawer);
      }
      setPendingRepos((prev) => {
        const next = new Set(prev);
        for (const id of ids) next.delete(id);
        return next;
      });
      pendingRef.current = pendingRef.current.filter((i) => !intents.includes(i));
    }
  }

  // Per-repo pending (busyRepoIds) replaced the global busy flag here, so
  // this flag now carries only the done-view disable. OR it with the
  // per-repo flag in the consumers: a plain ?? would let a present but
  // empty pending set swallow the done-view disable.
  const markAllDoneBusy = filters.state === "done";

  /** Marks every unread item of one or more repos read, with rollback on failure. */
  async function markRepoRead(repositoryIds: string | string[]) {
    const requested = Array.isArray(repositoryIds) ? repositoryIds : [repositoryIds];
    // Only repos with repo-wide unread items act; zero-count members are
    // neither busied nor sent.
    const readableOf = (id: string) => {
      const facet = repoFacets.find((r) => r.id === id);
      return facet?.readable ?? facet?.unread ?? ((facet?.main ?? 0) + (facet?.quiet ?? 0));
    };
    const ids = requested.filter((id) => readableOf(id) > 0);
    const first = requested[0] ?? "";
    const requestedName =
      requested.length === 1
        ? (repoFacets.find((r) => r.id === first)?.fullName ??
          collapsed.find((g) => g.repositoryId === first)?.repositoryName ??
          first)
        : `${requested.length} repositories`;
    if (ids.length === 0) {
      say(`All items for ${requestedName} are already read.`, "info");
      return;
    }
    if (ids.some((id) => pendingRepos.has(id))) return;
    setNotice(null);
    setPendingRepos((prev) => new Set([...prev, ...ids]));
    const repoName =
      ids.length === 1
        ? (repoFacets.find((r) => r.id === ids[0])?.fullName ??
          collapsed.find((g) => g.repositoryId === ids[0])?.repositoryName ??
          ids[0])
        : `${ids.length} repositories`;
    const targets = items.filter((i) => ids.includes(i.repositoryId));
    const intents: PendingIntent[] = ids.map((repositoryId) => ({
      action: "read",
      ids: targets.filter((t) => t.repositoryId === repositoryId).map((t) => t.id),
      state: filters.state,
      repositoryId,
      viewKey,
    }));
    pendingRef.current = [...pendingRef.current, ...intents];
    // Every mutation settles before busy state drains; only failed repos
    // roll back while successes stand.
    // Mutations run sequentially on purpose: each one snapshots the settled
    // outcome of its predecessors, so a rollback can only ever restore
    // settled state and never clobber a still-pending sibling.
    const succeeded: string[] = [];
    const failed: string[] = [];
    const bodies: BulkMutationBody[] = [];
    for (const id of ids) {
      try {
        bodies.push(await markRepoReadMutation.mutateAsync({ repositoryId: id }));
        succeeded.push(id);
      } catch {
        failed.push(id);
      }
    }
    const updated = bodies.reduce(
      (n, b) => n + (typeof b?.updated === "number" ? b.updated : 0),
      0
    );
    const queued = bodies.reduce(
      (n, b) => n + (typeof b?.queued === "number" ? b.queued : 0),
      0
    );
    const remote = bodies.some((b) => b?.remote === "background")
      ? "background"
      : typeof bodies[0]?.remote === "string"
        ? (bodies[0]?.remote as string)
        : null;
    // First error from non-partial bodies only: partial reasons get their
    // own per-repo line, so the generic notices must not repeat the first
    // partial error.
    const error =
      succeeded
        .map((_, i) => bodies[i])
        .filter((b) => b?.remote !== "partial")
        .map((b) => (typeof b?.error === "string" ? b.error : null)).find(Boolean) ?? null;
    // Partial remote results arrive with HTTP 200, so they never land in
    // `failed`. Track them separately or a background sibling would hide
    // their queued counts and reasons.
    // Responses stay paired with their repository through the succeeded
    // list, since failed requests contribute no body and plain indexes
    // would drift after a failure.
    const partialPairs = succeeded
      .map((id, i) => ({ id, body: bodies[i] }))
      .filter((p) => p.body?.remote === "partial");
    const partialUpdated = partialPairs.reduce(
      (n, p) => n + (typeof p.body?.updated === "number" ? p.body.updated : 0),
      0
    );
    const partialQueued = partialPairs.reduce(
      (n, p) => n + (typeof p.body?.queued === "number" ? p.body.queued : 0),
      0
    );
    const partialErrors = [
      ...new Set(
        partialPairs.flatMap((p) =>
          typeof p.body?.error === "string" ? [p.body.error] : []
        )
      ),
    ];
    const partialNames = partialPairs
      .map((p) => repoFacets.find((r) => r.id === p.id)?.fullName ?? p.id)
      .join(", ");
    const failedNames = failed
      .map((id) => repoFacets.find((r) => r.id === id)?.fullName ?? id)
      .join(", ");
    // Background counts stay scoped to background results so a mixed set
    // never reports partial rows as background-synced.
    const bgIds = new Set(
      succeeded.filter((_, i) => bodies[i]?.remote === "background")
    );
    const bgVisibleCount = targets.filter(
      (t) => t.isRead === 0 && bgIds.has(t.repositoryId)
    ).length;
    const bgUpdated = bodies.reduce(
      (n, b) => n + (b?.remote === "background" && typeof b?.updated === "number" ? b.updated : 0),
      0
    );
    try {
      if (failed.length === ids.length) {
        say("Mark all as read failed. Restored previous state.");
      } else {
        const parts: string[] = [];
        if (updated === 0 && queued === 0) {
          parts.push(`All items for ${repoName} are already read.`);
        } else if (remote === "background") {
          const quiet = Math.max(0, bgUpdated - bgVisibleCount);
          parts.push(
            quiet > 0
              ? `${bgUpdated} marked read (${bgVisibleCount} visible + ${quiet} quiet), syncing to GitHub in background.`
              : `${bgUpdated} marked read, syncing to GitHub in background.`
          );
          if (partialQueued > 0) {
            parts.push(
              `Partially applied for ${partialNames}: ${partialUpdated} marked read, ${partialQueued} queued for retry (${partialErrors.join("; ") || "unknown reason"}).`
            );
          }
        } else {
          // Partial results carry their own per-repo line (names plus every
          // distinct error); keep them out of the generic notice so a batch
          // without background results neither drops them nor truncates the
          // reasons to the first error.
          const restNotice = describeBulkResult("read", {
            updated: updated - partialUpdated,
            queued: queued - partialQueued,
            error,
            remote,
          });
          if (restNotice) parts.push(restNotice);
          if (partialQueued > 0) {
            parts.push(
              `Partially applied for ${partialNames}: ${partialUpdated} marked read, ${partialQueued} queued for retry (${partialErrors.join("; ") || "unknown reason"}).`
            );
          }
        }
        if (failed.length > 0) {
          parts.push(`Read failed for ${failedNames}; those repos were restored.`);
        }
        if (parts.length > 0) say(parts.join(" "), failed.length > 0 || partialQueued > 0 ? "error" : "info");
      }
    } finally {
      setPendingRepos((prev) => {
        const next = new Set(prev);
        for (const id of ids) next.delete(id);
        return next;
      });
      pendingRef.current = pendingRef.current.filter((i) => !intents.includes(i));
    }
  }

  function handleRepoCopied(_id: string, ok: boolean) {
    say(
      ok ? "Repo link copied to clipboard." : "Copy failed in this browser.",
      ok ? "info" : "error"
    );
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
  const drawerItemRef = React.useRef(drawerItem);
  drawerItemRef.current = drawerItem;
  const refreshRef = React.useRef(sync.refresh);
  refreshRef.current = sync.refresh;
  // Live filters for in-flight bulk actions to compare against: a filter
  // change mid-batch must not be clobbered by completion navigation.
  const filtersRef = React.useRef(filters);
  filtersRef.current = filters;
  // Counts drawer opens so a bulk batch can tell whether the user chose a
  // drawer while it ran. Closes do not count: the batch itself closes the
  // drawer at the start, and only a newer *choice* must block the restore.
  const drawerOpenGenRef = React.useRef(0);
  React.useEffect(() => {
    if (drawerItem != null) drawerOpenGenRef.current += 1;
  }, [drawerItem]);

  // Typed global UI actions from the palette or keyboard shortcuts elsewhere.
  // Counters use seen-refs so a remount never replays an old request.
  const openThreadReq = useUIStore((s) => s.openThread);
  const refreshReq = useUIStore((s) => s.refreshRequest);
  const scrollTopReq = useUIStore((s) => s.scrollTopRequest);
  // Palette-to-sidebar handoff: Cmd+K "Filter repository list to X" lands here.
  const repoListFilter = useUIStore((s) => s.repoListFilter);
  const setRepoListFilter = useUIStore((s) => s.setRepoListFilter);
  const seenRefresh = React.useRef(refreshReq);
  const seenScrollTop = React.useRef(scrollTopReq);

  React.useEffect(() => {
    if (!openThreadReq) return;
    useUIStore.getState().consumeOpenThread();
    const found = itemsRef.current.find((i) => i.id === openThreadReq.id);
    // Absent from the current filter view (different state, type, age, or
    // digest bucket): fall back to the palette's own snapshot so Enter
    // always opens what it promised instead of silently doing nothing.
    const item = found ?? (openThreadReq.item?.id === openThreadReq.id ? openThreadReq.item : undefined);
    if (!item) return;
    const idx = itemsRef.current.findIndex((i) => i.id === openThreadReq.id);
    if (idx >= 0) setFocusIdx(idx);
    setDrawerItem(item);
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
        if (confirmDone) {
          setConfirmDone(null);
          return;
        }
        if (confirmBulk) {
          setConfirmBulk(null);
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
      if (confirmDone) return;
      if (confirmBulk) return;
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
          <HintTooltip label="Refresh from GitHub">
            <Button
              variant="ghost"
              size="sm"
              aria-label="Refresh inbox from GitHub"
              onClick={() => void refresh()}
              disabled={syncing || refreshing || inPollWindow}
            >
              <SyncSpinner spinning={syncing || refreshing} />
            </Button>
          </HintTooltip>
          {lastSyncAt !== null ? (
            <HintTooltip label={`Last synced ${formatSyncTime(lastSyncAt)} · poll interval ${pollSecs}s`}>
              <span className="inline-flex cursor-help items-baseline gap-1 text-xs tabular-nums text-muted-foreground">
                {stale ? <span>Stale ·</span> : null}
                <span>Synced {formatRelativeTime(lastSyncAt, nowMs)}</span>
                <span
                  aria-hidden="true"
                  className="inline-block min-w-[5ch] text-left"
                >
                  {inPollWindow ? `· ${countdownSecs}s` : ""}
                </span>
              </span>
            </HintTooltip>
          ) : null}
        </div>
      </div>
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start">
        <aside
          ref={sidebarRef}
          aria-label="Inbox filters"
          className="filter-aside relative w-full shrink-0 overflow-x-hidden lg:sticky lg:top-2 lg:max-h-[calc(100vh-1rem)] lg:w-[var(--filter-w)] lg:self-start lg:overflow-y-auto"
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
            repoFilter={repoListFilter}
            onRepoFilterChange={setRepoListFilter}
            onSnooze={snoozeRepo}
            snoozeDisabled={updateRepo.isPending}
            onRhythm={setRhythm}
            rhythmDisabled={updateRepo.isPending}
            onMarkAllDone={markRepoDone}
            markAllDoneBusy={markAllDoneBusy}
            busyRepoIds={pendingRepos}
            onMarkAllRead={markRepoRead}
            onCopied={handleRepoCopied}
            onBulkSnooze={bulkSnooze}
            onBulkRhythm={bulkRhythm}
            onBulkDone={bulkDone}
            onBulkRead={bulkRead}
            onBulkCopied={handleBulkCopied}
            quietGroups={collapsed}
            quietActive={quietView}
            onQuietView={showQuietDigests}
          />
          <HintTooltip label="Drag to resize filters sidebar (double-click to reset)" side="right">
            <div
              role="separator"
              aria-orientation="vertical"
              aria-label="Resize filters sidebar"
              aria-valuenow={Math.round(sidebarWidth)}
              aria-valuemin={FILTER_MIN_WIDTH}
              aria-valuemax={FILTER_MAX_WIDTH}
              tabIndex={0}
              className="absolute top-0 bottom-0 -right-2 hidden w-4 cursor-ew-resize touch-none focus-visible:outline-none lg:block"
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
          </HintTooltip>
        </aside>
        <div className="flex min-w-0 flex-1 flex-col gap-4">
          <InboxFilters filters={filters} onChange={setFilters} />
          <div className="sticky top-2 z-10 flex flex-col gap-2 bg-background pb-2">
            <BulkBar
              selectedCount={selected.size}
              busy={bulkBusy}
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
            <p
              role={noticeKind === "error" ? "alert" : "status"}
              className={
                noticeKind === "error"
                  ? "text-xs text-destructive"
                  : "text-xs text-muted-foreground"
              }
            >
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
                  {lastSyncAt !== null ? ` · last synced ${formatRelativeTime(lastSyncAt, nowMs)}` : ""}.
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
                {lastSyncAt !== null ? ` Last synced ${formatRelativeTime(lastSyncAt, nowMs)}.` : ""}
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
              onRhythm={setRhythm}
              rhythmDisabled={updateRepo.isPending}
              onMarkAllDone={markRepoDone}
              markAllDoneBusy={markAllDoneBusy}
              busyRepoIds={pendingRepos}
              onMarkAllRead={markRepoRead}
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
      {confirmDone ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 p-4">
          <div
            ref={confirmDialogRef}
            role="alertdialog"
            aria-modal="true"
            aria-labelledby="confirm-done-title"
            aria-describedby="confirm-done-desc"
            className="w-full max-w-sm rounded-lg bg-card p-6 shadow-md"
          >
            <h2 id="confirm-done-title" className="font-semibold">
              Mark {confirmDone.total} as done?
            </h2>
            <p id="confirm-done-desc" className="mt-2 text-sm text-muted-foreground">
              Removes {confirmDone.total} items from the inbox
              {confirmDone.quiet > 0
                ? ` (${confirmDone.main} visible + ${confirmDone.quiet} quiet)`
                : ""}
              {confirmDone.repositoryIds.length > 1
                ? ` across ${confirmDone.repositoryIds.length} repositories`
                : ""}
              {" "}and syncs to GitHub in the background. Other repos stay
              usable while it syncs. Restore from the Done view if needed.
            </p>
            <div className="mt-4 flex items-center justify-end gap-2">
              <Button variant="ghost" data-autofocus onClick={() => setConfirmDone(null)}>
                Cancel
              </Button>
              <Button
                onClick={() => {
                  const target = confirmDone;
                  setConfirmDone(null);
                  void markRepoDone(target.repositoryIds, { confirmed: true });
                }}
              >
                Mark {confirmDone.total} done
              </Button>
            </div>
          </div>
        </div>
      ) : null}
      {confirmBulk ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 p-4">
          <div
            ref={confirmDialogRef}
            role="alertdialog"
            aria-modal="true"
            aria-labelledby="confirm-bulk-title"
            aria-describedby="confirm-bulk-desc"
            className="w-full max-w-sm rounded-lg bg-card p-6 shadow-md"
          >
            <h2 id="confirm-bulk-title" className="font-semibold">
              Mark {confirmBulk.ids.length} selected as done?
            </h2>
            <p id="confirm-bulk-desc" className="mt-2 text-sm text-muted-foreground">
              Removes {confirmBulk.ids.length} items from the inbox and syncs
              to GitHub in the background. Restore from the Done view if
              needed.
            </p>
            <div className="mt-4 flex items-center justify-end gap-2">
              <Button variant="ghost" data-autofocus onClick={() => setConfirmBulk(null)}>
                Cancel
              </Button>
              <Button
                onClick={() => {
                  const target = confirmBulk;
                  setConfirmBulk(null);
                  void apply(target.action, target.ids, { confirmed: true });
                }}
              >
                Mark {confirmBulk.ids.length} done
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
