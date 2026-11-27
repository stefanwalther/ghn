import { and, eq, or } from "drizzle-orm";
import { notifications } from "@/db/schema";
import type { Db } from "@/db/client";
import {
  apiBases,
  fetchThread,
} from "@/lib/github";
import { mapWithLimit } from "@/lib/sync";
import { readSubjectRetries } from "@/lib/subject-retries";

const API_VERSION = "2022-11-28";
const GRAPHQL_TIMEOUT_MS = 10_000;
const DEFAULT_MAX_SUBJECTS = 100;
const DEFAULT_MAX_REPOS = 12;
const GRAPHQL_CONCURRENCY = 6;
const DEFAULT_MAX_THREAD_CHECKS = 12;

export interface SubjectRef {
  id: string;
  owner: string;
  repo: string;
  kind: "PullRequest" | "Issue";
  number: number;
}

export interface SubjectBatchRepo {
  alias: string;
  owner: string;
  repo: string;
  items: Array<SubjectRef & { alias: string }>;
}

export interface SubjectBatch {
  repos: SubjectBatchRepo[];
  query: string;
}

export interface GraphqlSubjectState {
  state: "open" | "closed";
  merged: boolean;
}

export interface RefreshActiveSubjectsResult {
  checked: number;
  updated: number;
  threadsSynced: number;
}

interface ActiveSubjectRow {
  id: string;
  subjectType: string | null;
  subjectState: string | null;
  prMerged: number;
  isRead: number;
  localUnread: number;
  sourceUrl: string;
}

export interface PrefetchedSubjectStates {
  rowsById: Map<string, ActiveSubjectRow>;
  states: Map<string, GraphqlSubjectState>;
  checked: number;
}

/**
 * Extracts GitHub repository coordinates and subject number from a stored
 * notification row's HTML URL. Returns null for non-PR/Issue rows or URLs
 * without a numeric PR/issue path.
 */
export function parseSubjectRef(row: {
  id: string;
  subjectType: string | null;
  sourceUrl: string;
}): SubjectRef | null {
  if (row.subjectType !== "PullRequest" && row.subjectType !== "Issue") {
    return null;
  }
  if (!row.sourceUrl) return null;
  let parsed: URL;
  try {
    parsed = new URL(row.sourceUrl);
  } catch {
    return null;
  }
  if (parsed.protocol !== "https:" && parsed.protocol !== "http:") {
    return null;
  }
  const match = parsed.pathname.match(/^\/([^/]+)\/([^/]+)\/(pull|issues)\/(\d+)(?:\/|$)/);
  if (!match?.[1] || !match?.[2] || !match?.[3] || !match?.[4]) {
    return null;
  }
  const urlKind = match[3] === "pull" ? "PullRequest" : "Issue";
  if (urlKind !== row.subjectType) return null;
  const number = Number.parseInt(match[4], 10);
  if (!Number.isSafeInteger(number) || number <= 0) return null;
  return {
    id: row.id,
    owner: match[1],
    repo: match[2],
    kind: row.subjectType,
    number,
  };
}

function buildBatchQuery(repos: SubjectBatchRepo[]): string {
  const blocks = repos.map((group) => {
    const fields = group.items.map((item) =>
      item.kind === "PullRequest"
        ? `    ${item.alias}: pullRequest(number: ${item.number}) { state merged }`
        : `    ${item.alias}: issue(number: ${item.number}) { state }`
    );
    return `  ${group.alias}: repository(owner: ${JSON.stringify(group.owner)}, name: ${JSON.stringify(group.repo)}) {\n${fields.join("\n")}\n  }`;
  });
  return `query {\n${blocks.join("\n")}\n}`;
}

/**
 * Groups subject references by repository and balances them across bounded
 * GraphQL queries so each batch carries a similar number of repository
 * lookups (which drives tail latency on GitHub's GraphQL edge) while staying
 * within `maxSubjects` and `maxRepos`.
 */
export function buildSubjectStateBatches(
  refs: SubjectRef[],
  opts?: { maxSubjects?: number; maxRepos?: number }
): SubjectBatch[] {
  const maxSubjects = Math.max(1, opts?.maxSubjects ?? DEFAULT_MAX_SUBJECTS);
  const maxRepos = Math.max(1, opts?.maxRepos ?? DEFAULT_MAX_REPOS);
  if (refs.length === 0) return [];

  const byRepo = new Map<string, { owner: string; repo: string; items: SubjectRef[] }>();
  for (const ref of refs) {
    const key = `${ref.owner.toLowerCase()}/${ref.repo.toLowerCase()}`;
    const existing = byRepo.get(key);
    if (existing) {
      existing.items.push(ref);
    } else {
      byRepo.set(key, { owner: ref.owner, repo: ref.repo, items: [ref] });
    }
  }

  const slices: Array<{ owner: string; repo: string; items: SubjectRef[] }> = [];
  for (const group of byRepo.values()) {
    for (let i = 0; i < group.items.length; i += maxSubjects) {
      slices.push({
        owner: group.owner,
        repo: group.repo,
        items: group.items.slice(i, i + maxSubjects),
      });
    }
  }

  slices.sort((a, b) => b.items.length - a.items.length);
  const minBins = Math.max(
    Math.ceil(refs.length / maxSubjects),
    Math.ceil(slices.length / maxRepos)
  );
  const bins: Array<{
    groups: Array<{ owner: string; repo: string; items: SubjectRef[] }>;
    count: number;
  }> = Array.from({ length: minBins }, () => ({ groups: [], count: 0 }));

  for (const slice of slices) {
    let best = -1;
    for (let i = 0; i < bins.length; i += 1) {
      const bin = bins[i]!;
      if (bin.groups.length >= maxRepos || bin.count + slice.items.length > maxSubjects) {
        continue;
      }
      if (
        best === -1 ||
        bin.groups.length < bins[best]!.groups.length ||
        (bin.groups.length === bins[best]!.groups.length && bin.count < bins[best]!.count)
      ) {
        best = i;
      }
    }
    if (best === -1) {
      bins.push({ groups: [slice], count: slice.items.length });
    } else {
      bins[best]!.groups.push(slice);
      bins[best]!.count += slice.items.length;
    }
  }

  return bins
    .filter((bin) => bin.groups.length > 0)
    .map((bin) => {
      let itemIdx = 0;
      const repos: SubjectBatchRepo[] = bin.groups.map((group, rIdx) => ({
        alias: `r${rIdx}`,
        owner: group.owner,
        repo: group.repo,
        items: group.items.map((item) => ({ ...item, alias: `s${itemIdx++}` })),
      }));
      return { repos, query: buildBatchQuery(repos) };
    });
}

function normalizeGraphqlNode(
  kind: "PullRequest" | "Issue",
  node: unknown
): GraphqlSubjectState | null {
  if (!node || typeof node !== "object" || Array.isArray(node)) return null;
  const raw = node as { state?: unknown; merged?: unknown };
  const rawState = typeof raw.state === "string" ? raw.state.toUpperCase() : null;
  if (kind === "PullRequest") {
    if (rawState === "MERGED" || raw.merged === true) {
      return { state: "closed", merged: true };
    }
    if (rawState === "CLOSED") return { state: "closed", merged: false };
    if (rawState === "OPEN") return { state: "open", merged: false };
    return null;
  }
  if (rawState === "OPEN") return { state: "open", merged: false };
  if (rawState === "CLOSED") return { state: "closed", merged: false };
  return null;
}

/**
 * Executes one batched GraphQL subject-state query. Tolerates partial
 * repository or item errors in `payload.errors` by reading whatever `data`
 * resolved cleanly, and fails soft on HTTP or network errors so stored
 * values are never overwritten with unknown state.
 */
export async function fetchSubjectStatesBatch(
  token: string,
  batch: SubjectBatch,
  fetchFn: typeof fetch = fetch
): Promise<Map<string, GraphqlSubjectState>> {
  const results = new Map<string, GraphqlSubjectState>();
  try {
    const { graphqlUrl } = apiBases();
    const res = await fetchFn(graphqlUrl, {
      method: "POST",
      headers: {
        Accept: "application/vnd.github+json",
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
        "X-GitHub-Api-Version": API_VERSION,
      },
      body: JSON.stringify({ query: batch.query }),
      signal: AbortSignal.timeout(GRAPHQL_TIMEOUT_MS),
    });
    if (!res.ok) return results;
    const payload = (await res.json()) as { data?: unknown };
    if (!payload?.data || typeof payload.data !== "object" || Array.isArray(payload.data)) {
      return results;
    }
    const data = payload.data as Record<string, unknown>;
    for (const repoGroup of batch.repos) {
      const repoNode = data[repoGroup.alias];
      if (!repoNode || typeof repoNode !== "object" || Array.isArray(repoNode)) {
        continue;
      }
      const repoData = repoNode as Record<string, unknown>;
      for (const item of repoGroup.items) {
        const normalized = normalizeGraphqlNode(item.kind, repoData[item.alias]);
        if (normalized) {
          results.set(item.id, normalized);
        }
      }
    }
    return results;
  } catch {
    return results;
  }
}

/**
 * Read-only GraphQL batch fetch of live states for active non-merged PRs and
 * active Issues. Safe to run in parallel with `listNotifications` on
 * incremental syncs because it makes no database writes; call
 * `applyActiveSubjectUpdates` only after the notification listing succeeds.
 */
export async function prefetchActiveSubjects(
  db: Db,
  token: string,
  opts?: {
    skipIds?: Set<string>;
  }
): Promise<PrefetchedSubjectStates> {
  const candidates = await db
    .select({
      id: notifications.id,
      subjectType: notifications.subjectType,
      subjectState: notifications.subjectState,
      prMerged: notifications.prMerged,
      isRead: notifications.isRead,
      localUnread: notifications.localUnread,
      sourceUrl: notifications.sourceUrl,
    })
    .from(notifications)
    .where(
      and(
        eq(notifications.isDone, 0),
        or(
          and(eq(notifications.subjectType, "PullRequest"), eq(notifications.prMerged, 0)),
          eq(notifications.subjectType, "Issue")
        )
      )
    );

  const pendingRetries = await readSubjectRetries(db);
  const excluded = new Set<string>(opts?.skipIds ?? []);
  for (const id of pendingRetries.keys()) {
    excluded.add(id);
  }

  const rowsById = new Map<string, ActiveSubjectRow>();
  const refs: SubjectRef[] = [];
  for (const row of candidates) {
    if (excluded.has(row.id)) continue;
    const ref = parseSubjectRef(row);
    if (!ref) continue;
    rowsById.set(row.id, row);
    refs.push(ref);
  }
  const states = new Map<string, GraphqlSubjectState>();
  if (refs.length === 0) {
    return { rowsById, states, checked: 0 };
  }

  const batches = buildSubjectStateBatches(refs);
  const batchMaps = await mapWithLimit(batches, GRAPHQL_CONCURRENCY, (batch) =>
    fetchSubjectStatesBatch(token, batch)
  );
  for (const map of batchMaps) {
    for (const [id, state] of map) {
      states.set(id, state);
    }
  }
  return { rowsById, states, checked: refs.length };
}

/**
 * Persists state transitions discovered by `prefetchActiveSubjects`, skipping
 * any IDs resolved by REST or queued for retry while GraphQL was in flight.
 * For unread threads whose state actually changed (up to `maxThreadChecks`),
 * fetches the notification thread so `isRead` and `createdAt` stay in sync.
 */
export async function applyActiveSubjectUpdates(
  db: Db,
  token: string,
  prefetched: PrefetchedSubjectStates,
  opts?: {
    skipIds?: Set<string>;
    maxThreadChecks?: number;
  }
): Promise<RefreshActiveSubjectsResult> {
  if (prefetched.states.size === 0) {
    return { checked: prefetched.checked, updated: 0, threadsSynced: 0 };
  }

  const pendingRetries = await readSubjectRetries(db);
  const excluded = new Set<string>(opts?.skipIds ?? []);
  for (const id of pendingRetries.keys()) {
    excluded.add(id);
  }

  let updated = 0;
  const changedUnread: ActiveSubjectRow[] = [];

  for (const [id, next] of prefetched.states) {
    if (excluded.has(id)) continue;
    const row = prefetched.rowsById.get(id);
    if (!row) continue;
    const nextPrMerged = row.subjectType === "PullRequest" && next.merged ? 1 : 0;
    const changed =
      row.subjectState !== next.state || (row.prMerged ?? 0) !== nextPrMerged;
    if (!changed) continue;
    const saved = await db
      .update(notifications)
      .set({
        subjectState: next.state,
        prMerged: nextPrMerged,
      })
      .where(and(eq(notifications.id, id), eq(notifications.isDone, 0)))
      .returning({ id: notifications.id });
    if (saved.length > 0) {
      updated += 1;
      if (row.isRead === 0 && (row.localUnread ?? 0) === 0) {
        changedUnread.push(row);
      }
    }
  }

  const maxThreadChecks = opts?.maxThreadChecks ?? DEFAULT_MAX_THREAD_CHECKS;
  let threadsSynced = 0;

  if (changedUnread.length > 0 && maxThreadChecks > 0) {
    const toCheck = changedUnread.slice(0, maxThreadChecks);
    await mapWithLimit(toCheck, 6, async (row) => {
      const fetched = await fetchThread(token, row.id);
      if (!fetched.ok) {
        if (fetched.status === 404) {
          const marked = await db
            .update(notifications)
            .set({ isDone: 1 })
            .where(and(eq(notifications.id, row.id), eq(notifications.localUnread, 0)))
            .returning({ id: notifications.id });
          if (marked.length > 0) threadsSynced += 1;
        }
        return;
      }
      if (!fetched.data) return;
      const thread = fetched.data;
      const isRead = thread.unread ? 0 : 1;
      const saved = await db
        .update(notifications)
        .set({
          subject: thread.subjectTitle.slice(0, 200) || "Untitled",
          reason: thread.reason,
          createdAt: thread.updatedAt,
          githubUpdatedAt: thread.updatedAt,
          isRead,
        })
        .where(
          and(
            eq(notifications.id, row.id),
            eq(notifications.isDone, 0),
            eq(notifications.localUnread, 0)
          )
        )
        .returning({ id: notifications.id });
      if (saved.length > 0) threadsSynced += 1;
    });
  }

  return { checked: prefetched.checked, updated, threadsSynced };
}

/**
 * Refreshes live open/closed/merged state for active non-merged PRs and
 * active Issues via batched GraphQL queries. This closes the GitHub REST
 * `/notifications?since=` gap where self-merged or self-closed PRs never
 * appear in incremental notification listings.
 */
export async function refreshActiveSubjects(
  db: Db,
  token: string,
  opts?: {
    skipIds?: Set<string>;
    maxThreadChecks?: number;
  }
): Promise<RefreshActiveSubjectsResult> {
  const prefetched = await prefetchActiveSubjects(db, token, {
    skipIds: opts?.skipIds,
  });
  return applyActiveSubjectUpdates(db, token, prefetched, {
    skipIds: opts?.skipIds,
    maxThreadChecks: opts?.maxThreadChecks,
  });
}
