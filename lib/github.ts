function apiBase(): string {
  return process.env.GHN_API_BASE ?? "https://api.github.com";
}
const API_VERSION = "2022-11-28";

export interface GhThread {
  id: string;
  unread: boolean;
  reason: string;
  updatedAt: number;
  subjectTitle: string;
  subjectType: string;
  subjectApiUrl: string;
  repoFullName: string;
  repoOwnerLogin: string;
  repoHtmlUrl: string;
  threadUrl: string;
}

export type SyncFailureReason = "auth" | "rate_limited" | "network" | "unknown";

export interface GhResult<T> {
  ok: boolean;
  data?: T;
  reason?: SyncFailureReason;
  status?: number;
}

function baseHeaders(token: string): Record<string, string> {
  return {
    Accept: "application/vnd.github+json",
    Authorization: `Bearer ${token}`,
    "X-GitHub-Api-Version": API_VERSION,
  };
}

export function classifyStatus(status: number, res?: Response): SyncFailureReason {
  if (status === 401) return "auth";
  if (status === 403) {
    const remaining = res?.headers.get("x-ratelimit-remaining");
    if (remaining === "0") return "rate_limited";
    return "auth";
  }
  if (status === 429) return "rate_limited";
  return "unknown";
}

async function readToken(): Promise<string | null> {
  try {
    const { $ } = await import("bun");
    const out = await $`gh auth token`.quiet().nothrow().text();
    const token = out.trim();
    return token || null;
  } catch {
    return null;
  }
}

export async function getStoredToken(): Promise<string | null> {
  return readToken();
}

export async function probeConnection(): Promise<{
  connected: boolean;
  viewerLogin: string | null;
  reason?: SyncFailureReason;
}> {
  const token = await readToken();
  if (!token) {
    return { connected: false, viewerLogin: null, reason: "auth" };
  }
  try {
    const res = await fetch(`${apiBase()}/user`, { headers: baseHeaders(token) });
    if (!res.ok) {
      return { connected: false, viewerLogin: null, reason: classifyStatus(res.status, res) };
    }
    const payload = (await res.json()) as { login?: string };
    return { connected: true, viewerLogin: payload.login ?? null };
  } catch {
    return { connected: false, viewerLogin: null, reason: "network" };
  }
}

function parseThread(raw: Record<string, unknown>): GhThread | null {
  const id = raw.id;
  const subject = raw.subject as Record<string, unknown> | undefined;
  const repository = raw.repository as Record<string, unknown> | undefined;
  const owner = repository?.owner as Record<string, unknown> | undefined;
  if (typeof id !== "string" && typeof id !== "number") return null;
  if (!subject || !repository) return null;
  const updatedAt = Date.parse(String(raw.updated_at ?? ""));
  if (Number.isNaN(updatedAt)) return null;
  return {
    id: String(id),
    unread: raw.unread === true,
    reason: String(raw.reason ?? "subscribed"),
    updatedAt,
    subjectTitle: String(subject.title ?? "Untitled"),
    subjectType: String(subject.type ?? "Issue"),
    subjectApiUrl: String(subject.url ?? ""),
    repoFullName: String(repository.full_name ?? ""),
    repoOwnerLogin: String(owner?.login ?? ""),
    repoHtmlUrl: String(repository.html_url ?? ""),
    threadUrl: String(raw.url ?? ""),
  };
}

function nextPageUrl(linkHeader: string | null): string | null {
  if (!linkHeader) return null;
  for (const part of linkHeader.split(",")) {
    const match = part.match(/<([^>]+)>\s*;\s*rel="next"/);
    if (match?.[1]) return match[1];
  }
  return null;
}

export interface ListNotificationsResult {
  threads: GhThread[];
  notModified: boolean;
  lastModified: string | null;
  pollIntervalSecs: number;
}

export async function listNotifications(
  token: string,
  opts: { since?: string | null; ifModifiedSince?: string | null; full?: boolean }
): Promise<GhResult<ListNotificationsResult>> {
  try {
    const params = new URLSearchParams({
      all: "true",
      per_page: "50",
    });
    if (!opts.full && opts.since) params.set("since", opts.since);
    let url: string | null = `${apiBase()}/notifications?${params.toString()}`;
    const threads: GhThread[] = [];
    let lastModified: string | null = null;
    let pollIntervalSecs = 60;
    let firstPage = true;
    while (url) {
      const headers: Record<string, string> = baseHeaders(token);
      if (firstPage && opts.ifModifiedSince) {
        headers["If-Modified-Since"] = opts.ifModifiedSince;
      }
      const res = await fetch(url, { headers });
      if (res.status === 304) {
        return {
          ok: true,
          data: {
            threads: [],
            notModified: true,
            lastModified: opts.ifModifiedSince ?? null,
            pollIntervalSecs,
          },
        };
      }
      if (!res.ok) {
        return { ok: false, reason: classifyStatus(res.status, res), status: res.status };
      }
      lastModified = res.headers.get("last-modified") ?? lastModified;
      const poll = res.headers.get("x-poll-interval");
      if (poll) {
        const n = Number.parseInt(poll, 10);
        if (!Number.isNaN(n) && n > 0) pollIntervalSecs = n;
      }
      const payload = (await res.json()) as Record<string, unknown>[];
      if (Array.isArray(payload)) {
        for (const raw of payload) {
          const thread = parseThread(raw);
          if (thread) threads.push(thread);
        }
      }
      firstPage = false;
      url = nextPageUrl(res.headers.get("link"));
    }
    return { ok: true, data: { threads, notModified: false, lastModified, pollIntervalSecs } };
  } catch {
    return { ok: false, reason: "network" };
  }
}

async function writeThread(
  token: string,
  threadId: string,
  method: "PATCH" | "DELETE"
): Promise<GhResult<void>> {
  try {
    const res = await fetch(`${apiBase()}/notifications/threads/${threadId}`, {
      method,
      headers: baseHeaders(token),
    });
    if (res.status === 205 || res.status === 204 || res.status === 200) {
      return { ok: true };
    }
    return { ok: false, reason: classifyStatus(res.status, res), status: res.status };
  } catch {
    return { ok: false, reason: "network" };
  }
}

export function markThreadRead(token: string, threadId: string): Promise<GhResult<void>> {
  return writeThread(token, threadId, "PATCH");
}

export function markThreadDone(token: string, threadId: string): Promise<GhResult<void>> {
  return writeThread(token, threadId, "DELETE");
}

export async function setSubscriptionIgnored(
  token: string,
  threadId: string,
  ignored: boolean
): Promise<GhResult<void>> {
  try {
    const res = await fetch(`${apiBase()}/notifications/threads/${threadId}/subscription`, {
      method: "PUT",
      headers: { ...baseHeaders(token), "Content-Type": "application/json" },
      body: JSON.stringify({ ignored }),
    });
    if (res.ok) return { ok: true };
    return { ok: false, reason: classifyStatus(res.status, res), status: res.status };
  } catch {
    return { ok: false, reason: "network" };
  }
}

function deriveFallbackUrl(thread: GhThread): string {
  if (thread.subjectApiUrl) {
    const match = thread.subjectApiUrl.match(
      /\/repos\/([^/]+\/[^/]+)\/(issues|pulls)\/(\d+)/
    );
    if (match?.[1] && match?.[2] && match?.[3]) {
      const kind = match[2] === "pulls" ? "pull" : "issues";
      return `https://github.com/${match[1]}/${kind}/${match[3]}`;
    }
  }
  return thread.repoHtmlUrl || `https://github.com/${thread.repoFullName}`;
}

export async function checkRepoExists(token: string, fullName: string): Promise<boolean | null> {
  try {
    const res = await fetch(`${apiBase()}/repos/${fullName}`, { headers: baseHeaders(token) });
    if (res.status === 404) return false;
    if (res.ok) return true;
    return null;
  } catch {
    return null;
  }
}

const prMergedByApiUrl = new Map<string, boolean>();

export function readPrMerged(subjectApiUrl: string): boolean {
  return prMergedByApiUrl.get(subjectApiUrl) === true;
}

export async function resolveSubjectHtmlUrl(
  token: string,
  thread: GhThread,
  cache: Map<string, string>
): Promise<string> {  if (!thread.subjectApiUrl) return deriveFallbackUrl(thread);
  const cached = cache.get(thread.subjectApiUrl);
  if (cached) return cached;
  try {
    const res = await fetch(thread.subjectApiUrl, { headers: baseHeaders(token) });
    if (!res.ok) {
      const fallback = deriveFallbackUrl(thread);
      cache.set(thread.subjectApiUrl, fallback);
      return fallback;
    }
    const payload = (await res.json()) as { html_url?: unknown; merged?: unknown };
    const url = typeof payload.html_url === "string" ? payload.html_url : deriveFallbackUrl(thread);
    cache.set(thread.subjectApiUrl, url);
    if (thread.subjectType === "PullRequest") {
      prMergedByApiUrl.set(thread.subjectApiUrl, payload.merged === true);
    }
    return url;
  } catch {
    const fallback = deriveFallbackUrl(thread);
    cache.set(thread.subjectApiUrl, fallback);
    return fallback;
  }
}
