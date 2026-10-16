import type { AgeFilter } from "./filters";

export type StateFilter = "unread" | "all" | "done";

export interface InboxFilters {
  repo: string;
  state: StateFilter;
  type: string;
  age: AgeFilter;
}

const LAST_OPENED_KEY = "quiet-notifications:last-opened";
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
