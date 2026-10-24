import { QueryClient } from "@tanstack/react-query";
import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import * as React from "react";
import type {
  CheckSummary,
  DependabotAlertDetails,
  SubjectContent,
  ThreadComment,
  WorkflowRun,
} from "@/lib/github";
import { type BulkAction, applyOptimisticList } from "./inbox-state";
import { matchesTypeFilter } from "./filters";
import { pollWindow } from "./inbox-state";
import { syncErrorMessage } from "./sync-errors";
import type { InboxItem } from "@/components/inbox/notification-list";
import type { DigestGroup } from "@/components/inbox/digest-section";
import type { RepoRowData } from "@/components/repos/repo-row";
import type { RepoFacet, TypeFacet } from "@/components/inbox/filter-sidebar";
import type { RateLimitsResult } from "./rate-limits";
import { queryKeys } from "./query-keys";
import { serializeInboxFilters, type InboxFilters } from "./view-state";

/** Freshness window shared by inbox and palette (spec SC-001). */
export const QUERY_STALE_TIME_MS = 30_000;
export const QUERY_GC_TIME_MS = 5 * 60_000;

/** Client-side request bounds carried over from the hand-rolled fetch layer. */
export const REQUEST_TIMEOUT_MS = 30_000;
export const BULK_TIMEOUT_MS = 120_000;
export const SYNC_TIMEOUT_MS = 120_000;

/** Stable client factory: one instance per provider, never a module singleton. */
export function createQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: QUERY_STALE_TIME_MS,
        gcTime: QUERY_GC_TIME_MS,
        retry: 1,
        refetchOnWindowFocus: false,
        refetchOnReconnect: true,
      },
      mutations: {
        retry: 0,
      },
    },
  });
}

/**
 * fetch with an abort timeout. Mirrors the previous per-page helper so bulk
 * triage keeps its long leash while everything else settles fast enough that
 * busy state always drains.
 */
export async function fetchWithTimeout(
  input: string,
  init: RequestInit | undefined,
  timeoutMs: number
): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(input, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

export async function fetchJson<T>(
  input: string,
  init?: RequestInit,
  timeoutMs: number = REQUEST_TIMEOUT_MS
): Promise<T> {
  const res = await fetchWithTimeout(input, init, timeoutMs);
  const data = (await res.json().catch(() => null)) as T | null;
  if (!res.ok) {
    const message =
      data !== null && typeof data === "object" && "error" in data &&
        typeof (data as { error?: unknown }).error === "string"
        ? (data as { error: string }).error
        : `request failed: ${input}`;
    throw new Error(message);
  }
  return (data ?? {}) as T;
}

export interface NotificationsResponse {
  mainFlow: InboxItem[];
  collapsedSection: DigestGroup[];
  facets: { types: TypeFacet[]; repos: RepoFacet[] };
  lastSyncAt: number | null;
  stale: boolean;
}

export interface RepositoriesResponse {
  repositories: RepoRowData[];
}

export interface ConnectionResponse {
  connected: boolean;
  reason?: string;
  lastSyncAt?: number | null;
  pollIntervalSecs?: number;
}

export interface ThreadDetails extends SubjectContent {
  comments: ThreadComment[];
  checks: CheckSummary | null;
}

export type ThreadDetailsResponse = ThreadDetails & {
  content?: SubjectContent | null;
  runs?: WorkflowRun[];
  alert?: DependabotAlertDetails | null;
};

/** Same URL shape as the hand-rolled loader, so routes and caches line up. */
export function notificationsUrl(
  filters: InboxFilters,
  limit?: number | null
): string {
  const query = serializeInboxFilters(filters);
  if (typeof limit === "number") {
    return `/api/notifications${query}${query ? "&" : "?"}limit=${limit}`;
  }
  return `/api/notifications${query}`;
}

export function useNotifications(
  filters: InboxFilters,
  options?: { limit?: number | null; enabled?: boolean }
) {
  const limit = options?.limit ?? null;
  return useQuery({
    queryKey: queryKeys.notifications(filters, limit),
    queryFn: () =>
      fetchJson<NotificationsResponse>(notificationsUrl(filters, limit), {
        cache: "no-store",
      }),
    placeholderData: keepPreviousData,
    enabled: options?.enabled,
  });
}

export function useRepositories(options?: { enabled?: boolean }) {
  return useQuery({
    queryKey: queryKeys.repositories(),
    queryFn: () =>
      fetchJson<RepositoriesResponse>("/api/repositories", { cache: "no-store" }),
    enabled: options?.enabled,
  });
}

export function useConnection(options?: { enabled?: boolean }) {
  return useQuery({
    queryKey: queryKeys.connection(),
    queryFn: () =>
      fetchJson<ConnectionResponse>("/api/connection", { cache: "no-store" }),
    enabled: options?.enabled,
  });
}

export function useThreadDetails(id: string, options?: { enabled?: boolean }) {
  return useQuery({
    queryKey: queryKeys.thread(id),
    queryFn: () =>
      fetchJson<ThreadDetailsResponse>(
        `/api/thread?id=${encodeURIComponent(id)}`,
        { cache: "no-store" }
      ),
    placeholderData: keepPreviousData,
    enabled: (options?.enabled ?? true) && id.length > 0,
  });
}

export interface BulkMutationBody {
  updated?: number;
  queued?: number;
  error?: string;
}

/**
 * Bulk triage mutation with instant sidebar counts and rollback.
 * The visible list stays a local working copy in the caller; the mutation
 * optimistically updates the notifications cache entry (list plus facets)
 * so the left menu reflects the triage before the 110 remote GitHub calls
 * settle. Snapshot restores on error, invalidation confirms on settle.
 */
export function useBulkAction(filters: InboxFilters) {
  const client = useQueryClient();
  const key = queryKeys.notifications(filters);
  return useMutation({
    mutationFn: (vars: { action: BulkAction; ids: string[] }) =>
      fetchJson<BulkMutationBody>(
        "/api/notifications/bulk",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ ids: vars.ids, action: vars.action }),
          cache: "no-store",
        },
        BULK_TIMEOUT_MS
      ),
    onMutate: async (vars) => {
      if (vars.ids.length === 0) return { previous: undefined };
      await client.cancelQueries({ queryKey: key });
      const previous = client.getQueryData<NotificationsResponse>(key);
      if (!previous) return { previous };
      const idsSet = new Set(vars.ids);
      const nextMainFlow = applyOptimisticList(
        previous.mainFlow,
        vars.ids,
        vars.action,
        filters.state
      );
      // Facet counts only change when rows leave the current state view:
      // done/unsubscribe out of unread, unread out of done. All other
      // combos keep counts until the refetch confirms.
      const removesFromView =
        (vars.action === "done" || vars.action === "unsubscribe") &&
        filters.state === "unread";
      const restoresFromDone =
        vars.action === "unread" && filters.state === "done";
      let next: NotificationsResponse = { ...previous, mainFlow: nextMainFlow };
      if (removesFromView || restoresFromDone) {
        const removed = previous.mainFlow.filter((item) => idsSet.has(item.id));
        if (removed.length > 0) {
          const nextTypes = previous.facets.types.map((facet) => {
            if (facet.value === "all") {
              return { ...facet, count: Math.max(0, facet.count - removed.length) };
            }
            const dec = removed.filter((item) =>
              matchesTypeFilter(item.reason, item.subjectType ?? null, facet.value, {
                prMerged: item.prMerged ?? false,
                subjectState: item.subjectState ?? null,
              })
            ).length;
            return { ...facet, count: Math.max(0, facet.count - dec) };
          });
          const nextRepos = previous.facets.repos.map((repo) => {
            const dec = removed.filter((item) => item.repositoryId === repo.id).length;
            if (dec === 0) return repo;
            return { ...repo, main: Math.max(0, repo.main - dec) };
          });
          next = { ...next, facets: { types: nextTypes, repos: nextRepos } };
        }
      }
      client.setQueryData<NotificationsResponse>(key, next);
      return { previous };
    },
    onError: (_error, _vars, context) => {
      if (context?.previous) client.setQueryData(key, context.previous);
    },
    onSettled: () => {
      client.invalidateQueries({ queryKey: key });
      client.invalidateQueries({ queryKey: queryKeys.repositories() });
    },
  });
}

export type ThreadSyncResult =
  | { gone: true }
  | { gone: false; item: Partial<InboxItem> & { id: string } };

export interface ThreadSyncBody {
  gone?: boolean;
  item?: Partial<InboxItem> & { id: string };
}

/**
 * Per-thread sync with its own pending-id set so overlapping syncs each keep
 * their row spinner. Merged items land in the cache; gone threads are
 * reported for the caller to drop locally.
 */
export function useThreadSync(filters: InboxFilters) {
  const client = useQueryClient();
  const key = queryKeys.notifications(filters);
  const [syncingIds, setSyncingIds] = React.useState<Set<string>>(new Set());
  const mutation = useMutation({
    mutationFn: (vars: { id: string }) =>
      fetchJson<ThreadSyncBody>(
        "/api/thread/sync",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ id: vars.id }),
          cache: "no-store",
        },
        REQUEST_TIMEOUT_MS
      ),
    onSettled: () => {
      client.invalidateQueries({ queryKey: key });
    },
  });

  const syncOne = async (id: string): Promise<ThreadSyncResult> => {
    setSyncingIds((prev) => new Set(prev).add(id));
    try {
      const data = await mutation.mutateAsync({ id });
      if (data?.gone === true) return { gone: true };
      if (data?.item) {
        client.setQueryData<NotificationsResponse>(key, (old) =>
          old
            ? {
                ...old,
                mainFlow: old.mainFlow.map((row) =>
                  row.id === id ? { ...row, ...data.item } : row
                ),
              }
            : old
        );
        return { gone: false, item: data.item };
      }
      return { gone: false, item: { id } };
    } finally {
      setSyncingIds((prev) => {
        const next = new Set(prev);
        next.delete(id);
        return next;
      });
    }
  };

  return { syncOne, syncingIds, isPending: mutation.isPending || syncingIds.size > 0 };
}

export interface SyncResponse {
  fresh?: boolean;
  pollIntervalSecs?: number;
  lastSyncAt?: number;
  reason?: unknown;
}

export interface ConnectionState {
  connected: boolean;
  reason?: string;
}

/**
 * Central sync flow: manual refresh, poll window, and the truthful header
 * state derived from the shared notifications and connection entries.
 */
export function useSyncFlow(filters: InboxFilters) {
  const client = useQueryClient();
  const notificationsKey = queryKeys.notifications(filters);
  const notifQuery = useNotifications(filters);
  const connectionQuery = useConnection();
  const [pollSecs, setPollSecs] = React.useState(60);
  const [syncError, setSyncError] = React.useState<string | null>(null);
  const [nowMs, setNowMs] = React.useState(() => Date.now());

  React.useEffect(() => {
    const id = setInterval(() => setNowMs(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  const syncMutation = useMutation({
    mutationFn: () =>
      fetchJson<SyncResponse>(
        "/api/sync",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: "{}",
          cache: "no-store",
        },
        SYNC_TIMEOUT_MS
      ),
    onSettled: () => {
      client.invalidateQueries({ queryKey: notificationsKey });
      client.invalidateQueries({ queryKey: queryKeys.repositories() });
      client.invalidateQueries({ queryKey: queryKeys.connection() });
    },
  });

  const refresh = async () => {
    try {
      const data = await syncMutation.mutateAsync();
      if (data && typeof data.pollIntervalSecs === "number") {
        setPollSecs(data.pollIntervalSecs);
      }
      if (data && data.fresh === false) {
        setSyncError(syncErrorMessage(data.reason));
      } else {
        setSyncError(null);
      }
    } catch {
      setSyncError("Sync failed. Showing last loaded data.");
    }
  };

  const lastSyncAt =
    typeof notifQuery.data?.lastSyncAt === "number" ? notifQuery.data.lastSyncAt : null;
  const stale = notifQuery.data?.stale === true;
  const poll = pollWindow(lastSyncAt, pollSecs, nowMs);
  const connData = connectionQuery.data;
  const conn: ConnectionState | null = connData
    ? { connected: connData.connected === true, reason: connData.reason }
    : null;

  return {
    refresh,
    syncing: syncMutation.isPending,
    pollSecs,
    countdownSecs: poll.countdownSecs,
    inPollWindow: poll.inWindow && !syncMutation.isPending,
    lastSyncAt,
    stale,
    syncError,
    conn,
  };
}

export interface RepositoryPatch {
  rhythm?: string;
  snoozedUntil?: number | null;
}

/**
 * Repository digest settings with optimistic row update and rollback.
 * Facet counts elsewhere refresh via invalidation on settle.
 */
export function useUpdateRepository() {
  const client = useQueryClient();
  const key = queryKeys.repositories();
  return useMutation({
    mutationFn: (vars: { id: string; patch: RepositoryPatch }) =>
      fetchJson<unknown>(
        `/api/repositories/${vars.id}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(vars.patch),
          cache: "no-store",
        },
        REQUEST_TIMEOUT_MS
      ),
    onMutate: async (vars) => {
      await client.cancelQueries({ queryKey: key });
      const previous = client.getQueryData<RepositoriesResponse>(key);
      if (previous) {
        client.setQueryData<RepositoriesResponse>(key, {
          ...previous,
          repositories: previous.repositories.map((repo) =>
            repo.id === vars.id ? { ...repo, ...vars.patch } : repo
          ),
        });
      }
      return { previous };
    },
    onError: (_error, _vars, context) => {
      if (context?.previous) client.setQueryData(key, context.previous);
    },
    onSettled: () => {
      client.invalidateQueries({ queryKey: key });
      client.invalidateQueries({ queryKey: ["notifications"] });
    },
  });
}

export interface SettingsResponse {
  database: { configPath: string; databasePath: string };
  github: {
    connected: boolean;
    viewerLogin: string | null;
    reason: string | null;
    tokenPresent: boolean;
    tokenSource: string;
    ghCliAuthenticated: boolean;
    ghCliDetail: string | null;
  };
}

export function useSettings() {
  return useQuery({
    queryKey: queryKeys.settings(),
    queryFn: () =>
      fetchJson<SettingsResponse>("/api/settings", { cache: "no-store" }),
  });
}

export function useRateLimits() {
  return useQuery({
    queryKey: queryKeys.rateLimits(),
    queryFn: async () => {
      const payload = await fetchJson<RateLimitsResult & { error?: string }>(
        "/api/rate-limits",
        { cache: "no-store" }
      );
      if (!payload?.usage) {
        throw new Error(
          typeof payload?.error === "string"
            ? payload.error
            : "Failed to load rate limits."
        );
      }
      return payload;
    },
  });
}