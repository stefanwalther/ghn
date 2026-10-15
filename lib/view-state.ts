export type StateFilter = "unread" | "all" | "done";

export interface InboxFilters {
  repo: string;
  state: StateFilter;
}

const LAST_OPENED_KEY = "quiet-notifications:last-opened";

export function parseInboxFilters(params: URLSearchParams): InboxFilters {
  const repo = params.get("repo") || "all";
  const raw = params.get("state") || "unread";
  const state: StateFilter = raw === "all" || raw === "done" ? raw : "unread";
  return { repo, state };
}

export function serializeInboxFilters(filters: InboxFilters): string {
  const params = new URLSearchParams();
  if (filters.repo !== "all") params.set("repo", filters.repo);
  if (filters.state !== "unread") params.set("state", filters.state);
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
