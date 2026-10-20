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

export async function fetchThread(
  token: string,
  threadId: string
): Promise<GhResult<GhThread>> {
  try {
    const res = await fetch(`${apiBase()}/notifications/threads/${threadId}`, {
      headers: baseHeaders(token),
    });
    if (!res.ok) {
      return { ok: false, reason: classifyStatus(res.status, res), status: res.status };
    }
    const payload = (await res.json()) as Record<string, unknown>;
    const thread = parseThread(payload);
    if (!thread) {
      return { ok: false, reason: "unknown", status: res.status };
    }
    return { ok: true, data: thread };
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
    const dependabot = thread.subjectApiUrl.match(
      /\/repos\/([^/]+\/[^/]+)\/dependabot\/alerts\/(\d+)/
    );
    if (dependabot?.[1] && dependabot?.[2]) {
      return `https://github.com/${dependabot[1]}/security/dependabot/${dependabot[2]}`;
    }
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
const subjectStateByApiUrl = new Map<string, string | null>();

export function readPrMerged(subjectApiUrl: string): boolean {
  return prMergedByApiUrl.get(subjectApiUrl) === true;
}

export function readSubjectState(subjectApiUrl: string): string | null {
  return subjectStateByApiUrl.get(subjectApiUrl) ?? null;
}

export function subjectApiUrlFromHtml(htmlUrl: string): string | null {
  const dependabot = htmlUrl.match(
    /^https:\/\/github\.com\/([^/]+\/[^/]+)\/security\/dependabot\/(\d+)/
  );
  if (dependabot?.[1] && dependabot?.[2]) {
    return `https://api.github.com/repos/${dependabot[1]}/dependabot/alerts/${dependabot[2]}`;
  }
  const match = htmlUrl.match(/^https:\/\/github\.com\/([^/]+\/[^/]+)\/(pull|issues)\/(\d+)/);
  if (!match?.[1] || !match?.[2] || !match?.[3]) return null;
  const kind = match[2] === "pull" ? "pulls" : "issues";
  return `https://api.github.com/repos/${match[1]}/${kind}/${match[3]}`;
}

export interface DependabotAlertCoords {
  owner: string;
  repo: string;
  number: number;
}

export function parseDependabotAlertCoordsFromApi(apiUrl: string): DependabotAlertCoords | null {
  const match = apiUrl.match(
    /^https:\/\/api\.github\.com\/repos\/([^/]+)\/([^/]+)\/dependabot\/alerts\/(\d+)/
  );
  if (!match?.[1] || !match?.[2] || !match?.[3]) return null;
  return { owner: match[1], repo: match[2], number: Number.parseInt(match[3], 10) };
}

export function parseDependabotAlertCoordsFromHtml(htmlUrl: string): DependabotAlertCoords | null {
  const match = htmlUrl.match(
    /^https:\/\/github\.com\/([^/]+)\/([^/]+)\/security\/dependabot\/(\d+)/
  );
  if (!match?.[1] || !match?.[2] || !match?.[3]) return null;
  return { owner: match[1], repo: match[2], number: Number.parseInt(match[3], 10) };
}

export function parseDependabotAlertCoords(input: string): DependabotAlertCoords | null {
  return parseDependabotAlertCoordsFromApi(input) ?? parseDependabotAlertCoordsFromHtml(input);
}

export interface DependabotAlertDetails {
  number: number;
  state: string | null;
  htmlUrl: string;
  packageName: string | null;
  ecosystem: string | null;
  manifestPath: string | null;
  scope: string | null;
  severity: string | null;
  summary: string | null;
  description: string | null;
  cveId: string | null;
  ghsaId: string | null;
  vulnerableRange: string | null;
  patchedVersion: string | null;
  createdAt: number | null;
  fixedAt: number | null;
  dismissedAt: number | null;
  dismissedReason: string | null;
}

export async function fetchDependabotAlert(
  token: string,
  apiUrl: string
): Promise<DependabotAlertDetails | null> {
  try {
    const res = await fetch(apiUrl, { headers: baseHeaders(token) });
    if (!res.ok) return null;
    const payload = (await res.json()) as {
      number?: unknown;
      state?: unknown;
      html_url?: unknown;
      dependency?: unknown;
      security_advisory?: unknown;
      security_vulnerability?: unknown;
      created_at?: unknown;
      fixed_at?: unknown;
      dismissed_at?: unknown;
      dismissed_reason?: unknown;
    };
    if (typeof payload.number !== "number" || typeof payload.html_url !== "string") {
      return null;
    }
    const dependency = payload.dependency as {
      package?: { ecosystem?: unknown; name?: unknown };
      manifest_path?: unknown;
      scope?: unknown;
    } | null | undefined;
    const advisory = payload.security_advisory as {
      summary?: unknown;
      description?: unknown;
      severity?: unknown;
      cve_id?: unknown;
      ghsa_id?: unknown;
    } | null | undefined;
    const vuln = payload.security_vulnerability as {
      vulnerable_version_range?: unknown;
      first_patched_version?: { identifier?: unknown } | null;
    } | null | undefined;
    const toMs = (v: unknown): number | null => {
      if (typeof v !== "string") return null;
      const ms = Date.parse(v);
      return Number.isNaN(ms) ? null : ms;
    };
    return {
      number: payload.number,
      state: typeof payload.state === "string" ? payload.state : null,
      htmlUrl: payload.html_url,
      packageName:
        typeof dependency?.package?.name === "string" ? dependency.package.name : null,
      ecosystem:
        typeof dependency?.package?.ecosystem === "string"
          ? dependency.package.ecosystem
          : null,
      manifestPath:
        typeof dependency?.manifest_path === "string" ? dependency.manifest_path : null,
      scope: typeof dependency?.scope === "string" ? dependency.scope : null,
      severity: typeof advisory?.severity === "string" ? advisory.severity : null,
      summary: typeof advisory?.summary === "string" ? advisory.summary : null,
      description: typeof advisory?.description === "string" ? advisory.description : null,
      cveId: typeof advisory?.cve_id === "string" ? advisory.cve_id : null,
      ghsaId: typeof advisory?.ghsa_id === "string" ? advisory.ghsa_id : null,
      vulnerableRange:
        typeof vuln?.vulnerable_version_range === "string"
          ? vuln.vulnerable_version_range
          : null,
      patchedVersion:
        typeof vuln?.first_patched_version?.identifier === "string"
          ? vuln.first_patched_version.identifier
          : null,
      createdAt: toMs(payload.created_at),
      fixedAt: toMs(payload.fixed_at),
      dismissedAt: toMs(payload.dismissed_at),
      dismissedReason:
        typeof payload.dismissed_reason === "string" ? payload.dismissed_reason : null,
    };
  } catch {
    return null;
  }
}

export interface SubjectContent {
  title: string;
  body: string | null;
  state: string | null;
  authorLogin: string | null;
  htmlUrl: string;
  draft: boolean | null;
  merged: boolean | null;
  headSha: string | null;
}

export async function fetchSubjectContent(
  token: string,
  apiUrl: string
): Promise<SubjectContent | null> {
  try {
    const res = await fetch(apiUrl, { headers: baseHeaders(token) });
    if (!res.ok) return null;
    const payload = (await res.json()) as {
      title?: unknown;
      body?: unknown;
      state?: unknown;
      user?: unknown;
      html_url?: unknown;
      draft?: unknown;
      merged?: unknown;
      head?: unknown;
    };
    if (typeof payload.title !== "string" || typeof payload.html_url !== "string") {
      return null;
    }
    const user = payload.user as { login?: unknown } | null | undefined;
    const head = payload.head as { sha?: unknown } | null | undefined;
    return {
      title: payload.title,
      body: typeof payload.body === "string" ? payload.body : null,
      state: typeof payload.state === "string" ? payload.state : null,
      authorLogin: typeof user?.login === "string" ? user.login : null,
      htmlUrl: payload.html_url,
      draft: typeof payload.draft === "boolean" ? payload.draft : null,
      merged: typeof payload.merged === "boolean" ? payload.merged : null,
      headSha: typeof head?.sha === "string" ? head.sha : null,
    };
  } catch {
    return null;
  }
}

export function subjectCommentsUrlFromHtml(htmlUrl: string): string | null {  const match = htmlUrl.match(/^https:\/\/github\.com\/([^/]+\/[^/]+)\/(pull|issues)\/(\d+)/);
  if (!match?.[1] || !match?.[3]) return null;
  return `https://api.github.com/repos/${match[1]}/issues/${match[3]}/comments`;
}

export interface ThreadComment {
  authorLogin: string;
  body: string;
  createdAt: number;
}

export async function fetchThreadComments(
  token: string,
  commentsUrl: string
): Promise<ThreadComment[]> {
  try {
    const res = await fetch(commentsUrl, { headers: baseHeaders(token) });
    if (!res.ok) return [];
    const payload = (await res.json()) as Array<{
      user?: unknown;
      body?: unknown;
      created_at?: unknown;
    }>;
    if (!Array.isArray(payload)) return [];
    const comments: ThreadComment[] = [];
    for (const raw of payload) {
      const user = raw.user as { login?: unknown } | null | undefined;
      const createdAt =
        typeof raw.created_at === "string" ? Date.parse(raw.created_at) : Number.NaN;
      if (typeof user?.login !== "string" || typeof raw.body !== "string") continue;
      if (Number.isNaN(createdAt)) continue;
      comments.push({ authorLogin: user.login, body: raw.body, createdAt });
    }
    return comments;
  } catch {
    return [];
  }
}

export interface PullCoords {
  owner: string;
  repo: string;
  number: number;
}

export interface RepoCoords {
  owner: string;
  repo: string;
}

export function parseRepoCoords(htmlUrl: string): RepoCoords | null {
  const match = htmlUrl.match(/^https:\/\/github\.com\/([^/]+)\/([^/]+)\/?$/);
  if (!match?.[1] || !match?.[2]) return null;
  return { owner: match[1], repo: match[2] };
}

export function parseBranchFromTitle(title: string): string | null {
  const match = title.match(/ for ([^\s]+) branch$/);
  return match?.[1] ?? null;
}

export function parseWorkflowNameFromTitle(title: string): string | null {
  const match = title.match(/^(.*) workflow run .* for .* branch$/);
  const name = match?.[1]?.trim();
  return name ? name : null;
}

export function findPinnedRun(
  runs: WorkflowRun[],
  workflowName: string | null,
  notificationTime: number
): WorkflowRun | null {
  if (!workflowName) return null;
  const wanted = workflowName.toLowerCase();
  const slackMs = 120_000;
  let best: WorkflowRun | null = null;
  for (const run of runs) {
    if (run.name.toLowerCase() !== wanted) continue;
    if (run.createdAt > notificationTime + slackMs) continue;
    if (!best || run.createdAt > best.createdAt) best = run;
  }
  return best;
}

export function formatRunAge(createdAt: number, now: number = Date.now()): string {
  const mins = Math.max(1, Math.round((now - createdAt) / 60000));
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.round(hours / 24)}d ago`;
}

export interface WorkflowRun {
  name: string;
  htmlUrl: string;
  status: string;
  conclusion: string | null;
  branch: string | null;
  createdAt: number;
}

export async function fetchWorkflowRuns(
  token: string,
  input: { owner: string; repo: string; branch: string | null; apiBase?: string }
): Promise<WorkflowRun[]> {
  try {
    const base = input.apiBase ?? "https://api.github.com";
    const params = new URLSearchParams({ per_page: "20" });
    if (input.branch) params.set("branch", input.branch);
    const res = await fetch(
      `${base}/repos/${input.owner}/${input.repo}/actions/runs?${params.toString()}`,
      { headers: baseHeaders(token) }
    );
    if (!res.ok) return [];
    const payload = (await res.json()) as { workflow_runs?: unknown };
    if (!Array.isArray(payload.workflow_runs)) return [];
    const runs: WorkflowRun[] = [];
    for (const raw of payload.workflow_runs) {
      const r = raw as {
        name?: unknown;
        html_url?: unknown;
        status?: unknown;
        conclusion?: unknown;
        head_branch?: unknown;
        created_at?: unknown;
      };
      const createdAt =
        typeof r.created_at === "string" ? Date.parse(r.created_at) : Number.NaN;
      if (
        typeof r.name !== "string" ||
        typeof r.html_url !== "string" ||
        typeof r.status !== "string" ||
        Number.isNaN(createdAt)
      ) {
        continue;
      }
      runs.push({
        name: r.name,
        htmlUrl: r.html_url,
        status: r.status,
        conclusion: typeof r.conclusion === "string" ? r.conclusion : null,
        branch: typeof r.head_branch === "string" ? r.head_branch : null,
        createdAt,
      });
    }
    return runs;
  } catch {
    return [];
  }
}

export function parsePullCoords(apiUrl: string): PullCoords | null {
  const match = apiUrl.match(/^https:\/\/api\.github\.com\/repos\/([^/]+)\/([^/]+)\/pulls\/(\d+)/);
  if (!match?.[1] || !match?.[2] || !match?.[3]) return null;
  return { owner: match[1], repo: match[2], number: Number.parseInt(match[3], 10) };
}

export interface CheckSummary {
  state: "success" | "failure" | "pending" | "error";
  passing: number;
  total: number;
}

export async function fetchCheckSummary(
  token: string,
  input: { owner: string; repo: string; sha: string; apiBase?: string }
): Promise<CheckSummary | null> {
  try {
    const base = input.apiBase ?? "https://api.github.com";
    const headers = baseHeaders(token);
    const [statusRes, runsRes] = await Promise.all([
      fetch(
        `${base}/repos/${input.owner}/${input.repo}/commits/${input.sha}/status`,
        { headers }
      ).catch(() => null),
      fetch(
        `${base}/repos/${input.owner}/${input.repo}/commits/${input.sha}/check-runs`,
        { headers }
      ).catch(() => null),
    ]);
    const states: string[] = [];
    if (statusRes && statusRes.ok) {
      const payload = (await statusRes.json()) as { statuses?: unknown };
      if (Array.isArray(payload.statuses)) {
        for (const s of payload.statuses) {
          const state = (s as { state?: unknown }).state;
          states.push(state === "success" || state === "failure" || state === "error" ? state : "pending");
        }
      }
    }
    if (runsRes && runsRes.ok) {
      const payload = (await runsRes.json()) as { check_runs?: unknown };
      if (Array.isArray(payload.check_runs)) {
        for (const run of payload.check_runs) {
          const r = run as { status?: unknown; conclusion?: unknown };
          if (r.status === "completed" && r.conclusion === "success") states.push("success");
          else if (
            r.status === "completed" &&
            (r.conclusion === "failure" ||
              r.conclusion === "timed_out" ||
              r.conclusion === "cancelled" ||
              r.conclusion === "action_required")
          )
            states.push("failure");
          else states.push("pending");
        }
      }
    } else if (!statusRes || !statusRes.ok) {
      return null;
    }
    const passing = states.filter((s) => s === "success").length;
    const state = states.includes("failure")
      ? "failure"
      : states.length > 0 && passing === states.length
        ? "success"
        : "pending";
    return { state, passing, total: states.length };
  } catch {
    return null;
  }
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
    const payload = (await res.json()) as {
      html_url?: unknown;
      merged?: unknown;
      state?: unknown;
    };
    const url = typeof payload.html_url === "string" ? payload.html_url : deriveFallbackUrl(thread);
    cache.set(thread.subjectApiUrl, url);
    if (thread.subjectType === "PullRequest") {
      prMergedByApiUrl.set(thread.subjectApiUrl, payload.merged === true);
    }
    subjectStateByApiUrl.set(
      thread.subjectApiUrl,
      typeof payload.state === "string" ? payload.state : null
    );
    return url;
  } catch {
    const fallback = deriveFallbackUrl(thread);
    cache.set(thread.subjectApiUrl, fallback);
    return fallback;
  }
}
