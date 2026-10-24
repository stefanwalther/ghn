import type { AgeFilter } from "./filters";

export type StateFilter = "unread" | "all" | "done";

export interface InboxFilters {
  repo: string;
  state: StateFilter;
  type: string;
  age: AgeFilter;
}

const LAST_OPENED_KEY = "ghn:last-opened";
const AGES: AgeFilter[] = ["all", "24h", "48h", "7d", "14d", "30d", "year", "older"];

export function parseInboxFilters(params: URLSearchParams): InboxFilters {
  const repo = params.get("repo") || "all";
  const raw = params.get("state") || "unread";
  const state: StateFilter = raw === "all" || raw === "done" ? raw : "unread";
  const type = params.get("type") || "all";
  const rawAge = params.get("age") || "all";
  const age: AgeFilter = (AGES as string[]).includes(rawAge) ? (rawAge as AgeFilter) : "all";
  return { repo, state, type, age };
}

export function serializeInboxFilters(filters: InboxFilters): string {
  const params = new URLSearchParams();
  if (filters.repo !== "all") params.set("repo", filters.repo);
  if (filters.state !== "unread") params.set("state", filters.state);
  if (filters.type !== "all") params.set("type", filters.type);
  if (filters.age !== "all") params.set("age", filters.age);
  const s = params.toString();
  return s ? `?${s}` : "";
}

export function repoFilterHref(currentSearch: string, repositoryId: string): string {
  try {
    const current = parseInboxFilters(new URLSearchParams(currentSearch));
    return `/${serializeInboxFilters({ ...current, repo: repositoryId })}`;
  } catch {
    return `/?repo=${encodeURIComponent(repositoryId)}`;
  }
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
