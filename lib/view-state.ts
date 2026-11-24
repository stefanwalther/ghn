import type { AgeFilter } from "./filters";

export type StateFilter = "unread" | "done";

/** Multi-select inbox filters. Empty repos/types/ages means all. */
export interface InboxFilters {
  repos: string[];
  states: StateFilter[];
  types: string[];
  ages: AgeFilter[];
}

const LAST_OPENED_KEY = "ghn:last-opened";
const AGES: AgeFilter[] = ["all", "24h", "48h", "7d", "14d", "30d", "year", "older"];
const AGE_SET = new Set<string>(AGES);
const STATES: StateFilter[] = ["unread", "done"];

export const DEFAULT_INBOX_FILTERS: InboxFilters = {
  repos: [],
  states: ["unread"],
  types: [],
  ages: [],
};

function dedupeSorted(values: string[]): string[] {
  return [...new Set(values.map((v) => v.trim()).filter((v) => v !== ""))].sort();
}

function dedupeStates(values: string[]): StateFilter[] {
  const out: StateFilter[] = [];
  for (const v of values) {
    if ((v === "unread" || v === "done") && !out.includes(v)) out.push(v);
  }
  // Canonical order: unread then done, so ["done","unread"] and
  // ["unread","done"] share one cache key and one URL shape.
  out.sort((a, b) => STATES.indexOf(a) - STATES.indexOf(b));
  return out;
}

function dedupeAges(values: string[]): AgeFilter[] {
  const seen = new Set<string>();
  const out: AgeFilter[] = [];
  for (const v of values) {
    if (AGE_SET.has(v) && v !== "all" && !seen.has(v)) {
      seen.add(v);
      out.push(v as AgeFilter);
    }
  }
  out.sort((a, b) => AGES.indexOf(a) - AGES.indexOf(b));
  return out;
}

/**
 * Collects repeated `?key=a&key=b` plus comma-separated `?key=a,b`
 * into one flat list. Legacy single `?key=all` survives as ["all"]
 * so callers can map it to the multi-select equivalent.
 */
function collectMulti(params: URLSearchParams, key: string): string[] {
  const out: string[] = [];
  for (const raw of params.getAll(key)) {
    for (const part of raw.split(",")) {
      const v = part.trim();
      if (v !== "") out.push(v);
    }
  }
  return out;
}

export function parseInboxFilters(params: URLSearchParams): InboxFilters {
  const repoRaw = collectMulti(params, "repo").filter((v) => v !== "all");
  const repos = dedupeSorted(repoRaw);

  const stateRaw = collectMulti(params, "state");
  let states: StateFilter[];
  if (stateRaw.length === 0) {
    states = ["unread"];
  } else if (stateRaw.includes("all")) {
    states = ["unread", "done"];
  } else {
    const parsed = dedupeStates(stateRaw);
    states = parsed.length > 0 ? parsed : ["unread"];
  }

  const typeRaw = collectMulti(params, "type").filter((v) => v !== "all");
  const types = dedupeSorted(typeRaw);

  const ageRaw = collectMulti(params, "age");
  const ages = ageRaw.includes("all") ? [] : dedupeAges(ageRaw);

  return { repos, states, types, ages };
}

export function serializeInboxFilters(filters: InboxFilters): string {
  const params = new URLSearchParams();
  for (const r of dedupeSorted(filters.repos)) params.append("repo", r);
  const states = dedupeStates(filters.states);
  const isDefaultStates = states.length === 1 && states[0] === "unread";
  if (!isDefaultStates) {
    if (states.length === 2) {
      params.set("state", "all");
    } else {
      for (const s of states) params.append("state", s);
    }
  }
  for (const t of dedupeSorted(filters.types)) params.append("type", t);
  for (const a of dedupeAges(filters.ages)) params.append("age", a);
  const s = params.toString();
  return s ? `?${s}` : "";
}

export function repoFilterHref(currentSearch: string, repositoryId: string): string {
  try {
    const current = parseInboxFilters(new URLSearchParams(currentSearch));
    if (repositoryId === "all") {
      return `/${serializeInboxFilters({ ...current, repos: [] })}`;
    }
    return `/${serializeInboxFilters({ ...current, repos: [repositoryId] })}`;
  } catch {
    return `/?repo=${encodeURIComponent(repositoryId)}`;
  }
}

/** Toggle helpers shared by the sidebar and the top filter bar. */
export function toggleInList(list: string[], value: string): string[] {
  const next = new Set(list);
  if (next.has(value)) next.delete(value);
  else next.add(value);
  return [...next].sort();
}

export function toggleState(states: StateFilter[], value: StateFilter): StateFilter[] {
  const next = toggleInList(states, value) as StateFilter[];
  // At least one state stays selected so the list never goes blank from
  // unchecking the last box; unchecking the only box is a no-op.
  if (next.length === 0) return [...states].sort((a, b) => STATES.indexOf(a) - STATES.indexOf(b)) as StateFilter[];
  return dedupeStates(next);
}

export function toggleAge(ages: AgeFilter[], value: AgeFilter): AgeFilter[] {
  if (value === "all") return [];
  return dedupeAges(toggleInList(ages, value));
}

/** Display helpers: the old single-value labels derived from the sets. */
export function isAllRepos(filters: InboxFilters): boolean {
  return filters.repos.length === 0;
}

export function isAllTypes(filters: InboxFilters): boolean {
  return filters.types.length === 0;
}

export function isAllAges(filters: InboxFilters): boolean {
  return filters.ages.length === 0;
}

export function isUnreadOnly(filters: InboxFilters): boolean {
  return filters.states.length === 1 && filters.states[0] === "unread";
}

export function isDoneOnly(filters: InboxFilters): boolean {
  return filters.states.length === 1 && filters.states[0] === "done";
}

export function isAllStates(filters: InboxFilters): boolean {
  return filters.states.includes("unread") && filters.states.includes("done");
}

/** Old single-value state name for headings and empty states. */
export function displayState(filters: InboxFilters): "unread" | "all" | "done" {
  if (isAllStates(filters)) return "all";
  if (isDoneOnly(filters)) return "done";
  return "unread";
}

export function statesEqual(a: StateFilter[], b: StateFilter[]): boolean {
  const na = dedupeStates(a);
  const nb = dedupeStates(b);
  return na.length === nb.length && na.every((v, i) => v === nb[i]);
}

export function filtersEqual(a: InboxFilters, b: InboxFilters): boolean {
  return (
    dedupeSorted(a.repos).join("\0") === dedupeSorted(b.repos).join("\0") &&
    statesEqual(a.states, b.states) &&
    dedupeSorted(a.types).join("\0") === dedupeSorted(b.types).join("\0") &&
    dedupeAges(a.ages).join("\0") === dedupeAges(b.ages).join("\0")
  );
}

export const PALETTE_LIMIT_DEFAULT = 400;
export const PALETTE_LIMIT_MAX = 400;

export function parsePaletteLimit(raw: string | null): number | null {
  if (raw === null) return null;
  const parsed = Number.parseInt(raw, 10);
  if (!Number.isFinite(parsed)) return PALETTE_LIMIT_DEFAULT;
  return Math.min(PALETTE_LIMIT_MAX, Math.max(1, parsed));
}

export function saveLastOpened(id: string): void {
  try {
    sessionStorage.setItem(LAST_OPENED_KEY, id);
  } catch {
    // ignore private-mode failures
  }
}
export function loadLastOpened(): string | null {
  try {
    return sessionStorage.getItem(LAST_OPENED_KEY);
  } catch {
    return null;
  }
}

const DRAWER_WIDTH_KEY = "ghn:drawer-width";

export const DRAWER_MIN_WIDTH = 480;
export const DRAWER_MAX_WIDTH = 1120;
export const DRAWER_DEFAULT_WIDTH = 896;

export function clampDrawerWidth(px: number): number {
  if (!Number.isFinite(px)) return DRAWER_DEFAULT_WIDTH;
  return Math.min(DRAWER_MAX_WIDTH, Math.max(DRAWER_MIN_WIDTH, Math.round(px)));
}

export function loadDrawerWidth(): number {
  try {
    const raw = localStorage.getItem(DRAWER_WIDTH_KEY);
    if (raw === null) return DRAWER_DEFAULT_WIDTH;
    return clampDrawerWidth(Number.parseInt(raw, 10));
  } catch {
    return DRAWER_DEFAULT_WIDTH;
  }
}

export function saveDrawerWidth(px: number): void {
  try {
    localStorage.setItem(DRAWER_WIDTH_KEY, String(clampDrawerWidth(px)));
  } catch {
    // ignore private-mode failures
  }
}

const FILTER_WIDTH_KEY = "ghn:filter-width";

export const FILTER_MIN_WIDTH = 200;
export const FILTER_MAX_WIDTH = 480;
export const FILTER_DEFAULT_WIDTH = 256;

export const INBOX_FILTERS_KEY = "ghn:inbox-filters";
export const INBOX_FILTERS_VERSION = 2;

export function isDefaultInboxFilters(filters: InboxFilters): boolean {
  return (
    filters.repos.length === 0 &&
    isUnreadOnly(filters as InboxFilters) &&
    filters.types.length === 0 &&
    filters.ages.length === 0
  );
}

function normalizeRepos(raw: unknown): string[] {
  if (typeof raw === "string") {
    const v = raw.trim();
    return v === "" || v === "all" ? [] : [v];
  }
  if (Array.isArray(raw)) {
    return dedupeSorted(
      raw.filter((v): v is string => typeof v === "string").filter((v) => v !== "all")
    );
  }
  return [];
}

function normalizeStates(raw: unknown): StateFilter[] {
  const list = Array.isArray(raw) ? raw : typeof raw === "string" ? [raw] : [];
  if (list.includes("all")) return ["unread", "done"];
  const parsed = dedupeStates(
    list.filter((v): v is string => typeof v === "string")
  );
  return parsed.length > 0 ? parsed : ["unread"];
}

function normalizeTypes(raw: unknown): string[] {
  if (typeof raw === "string") {
    const v = raw.trim();
    return v === "" || v === "all" ? [] : [v];
  }
  if (Array.isArray(raw)) {
    return dedupeSorted(
      raw.filter((v): v is string => typeof v === "string").filter((v) => v !== "all")
    );
  }
  return [];
}

function normalizeAges(raw: unknown): AgeFilter[] {
  const list = Array.isArray(raw) ? raw : typeof raw === "string" ? [raw] : [];
  if (list.includes("all")) return [];
  return dedupeAges(list.filter((v): v is string => typeof v === "string"));
}

export function normalizeInboxFilters(raw: unknown): InboxFilters {
  if (typeof raw !== "object" || raw === null) {
    return { ...DEFAULT_INBOX_FILTERS, repos: [], states: ["unread"], types: [], ages: [] };
  }
  const rec = raw as Record<string, unknown>;
  // Accept both the v2 plural keys and the v1 singular keys so stored v1
  // payloads migrate without a second code path.
  const repos = normalizeRepos(rec.repos ?? rec.repo);
  const states = normalizeStates(rec.states ?? rec.state);
  const types = normalizeTypes(rec.types ?? rec.type);
  const ages = normalizeAges(rec.ages ?? rec.age);
  return { repos, states, types, ages };
}

export function loadInboxFilters(): InboxFilters | null {
  try {
    const raw = localStorage.getItem(INBOX_FILTERS_KEY);
    if (raw === null) return null;
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== "object" || parsed === null) return null;
    const version = (parsed as { version?: unknown }).version;
    if (version !== INBOX_FILTERS_VERSION && version !== 1) return null;
    const f = (parsed as { filters?: unknown }).filters;
    if (typeof f !== "object" || f === null) return null;
    return normalizeInboxFilters(f);
  } catch {
    return null;
  }
}

export function saveInboxFilters(filters: InboxFilters): void {
  try {
    localStorage.setItem(
      INBOX_FILTERS_KEY,
      JSON.stringify({
        version: INBOX_FILTERS_VERSION,
        filters: {
          repos: dedupeSorted(filters.repos),
          states: dedupeStates(filters.states),
          types: dedupeSorted(filters.types),
          ages: dedupeAges(filters.ages),
        },
      })
    );
  } catch {
    // ignore private-mode failures
  }
}

export function clampFilterWidth(px: number): number {
  if (!Number.isFinite(px)) return FILTER_DEFAULT_WIDTH;
  return Math.min(FILTER_MAX_WIDTH, Math.max(FILTER_MIN_WIDTH, Math.round(px)));
}

export function loadFilterWidth(): number {
  try {
    const raw = localStorage.getItem(FILTER_WIDTH_KEY);
    if (raw === null) return FILTER_DEFAULT_WIDTH;
    return clampFilterWidth(Number.parseInt(raw, 10));
  } catch {
    return FILTER_DEFAULT_WIDTH;
  }
}

export function saveFilterWidth(px: number): void {
  try {
    localStorage.setItem(FILTER_WIDTH_KEY, String(clampFilterWidth(px)));
  } catch {
    // ignore private-mode failures
  }
}

export function previewFallbackKind(subjectType?: string | null): string {
  switch (subjectType) {
    case "Release":
      return "releases";
    case "Commit":
      return "commits";
    case "Discussion":
      return "discussions";
    case "CheckSuite":
      return "check runs";
    case "RepositoryDependabotAlertsThread":
      return "security alerts";
    default:
      return "this item type";
  }
}
