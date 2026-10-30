import { AGE_FILTERS } from "./filters";
import { rankSearch } from "./search";
import type { InboxFilters } from "./view-state";

export type PaletteAction =
  | { type: "navigate"; href: string }
  | { type: "external"; href: string }
  | { type: "theme" }
  | { type: "refresh" }
  | { type: "toggle-sidebar" }
  | { type: "show-help" }
  | { type: "scroll-top" }
  | { type: "thread"; id: string; repositoryId: string }
  | { type: "repo-filter"; repositoryId: string }
  | { type: "filter-list"; query: string }
  | { type: "qualifier"; prefix: string }
  | { type: "filter"; field: "type" | "state" | "age"; value: string }
  | { type: "dimension"; dimension: "repo" | "type" | "state" | "age" };

export type PaletteSection = "syntax" | "commands" | "go" | "filters" | "threads" | "repos";

export interface PaletteEntry {
  id: string;
  section: PaletteSection;
  title: string;
  subtitle?: string;
  keywords: string;
  shortcut?: string;
  action: PaletteAction;
}

export const SECTION_LABELS: Record<PaletteSection, string> = {
  syntax: "Search syntax",
  commands: "Commands",
  go: "Go to",
  filters: "Filters",
  threads: "Threads",
  repos: "Repositories",
};

export function staticEntries(): PaletteEntry[] {
  return [
    {
      id: "cmd-refresh",
      section: "commands",
      title: "Refresh from GitHub",
      subtitle: "Sync now, then reload the inbox",
      keywords: "refresh sync reload fetch update",
      action: { type: "refresh" },
    },
    {
      id: "cmd-theme",
      section: "commands",
      title: "Toggle theme",
      subtitle: "Switch light / dark",
      keywords: "theme dark light mode appearance",
      shortcut: "⌘F12",
      action: { type: "theme" },
    },
    {
      id: "cmd-sidebar",
      section: "commands",
      title: "Toggle sidebar",
      subtitle: "Show or hide the main menu",
      keywords: "sidebar menu collapse expand navigation",
      shortcut: "⌘B",
      action: { type: "toggle-sidebar" },
    },
    {
      id: "cmd-shortcuts",
      section: "commands",
      title: "Show keyboard shortcuts",
      subtitle: "Open the shortcut help",
      keywords: "shortcuts help keys bindings ?",
      shortcut: "?",
      action: { type: "show-help" },
    },
    {
      id: "cmd-top",
      section: "commands",
      title: "Back to inbox top",
      subtitle: "Clear selection and scroll up",
      keywords: "top scroll clear inbox",
      action: { type: "scroll-top" },
    },
    {
      id: "go-inbox",
      section: "go",
      title: "Go to Inbox",
      subtitle: "/",
      keywords: "go inbox home notifications triage",
      action: { type: "navigate", href: "/" },
    },
    {
      id: "go-repos",
      section: "go",
      title: "Go to Repositories",
      subtitle: "/repos",
      keywords: "go repos repositories digest rhythm snooze settings",
      action: { type: "navigate", href: "/repos" },
    },
    {
      id: "go-limits",
      section: "go",
      title: "Go to Rate limits",
      subtitle: "/rate-limits",
      keywords: "go rate limits quota api buckets",
      action: { type: "navigate", href: "/rate-limits" },
    },
    {
      id: "go-settings",
      section: "go",
      title: "Go to Settings",
      subtitle: "/settings",
      keywords: "go settings database config github auth gh cli",
      action: { type: "navigate", href: "/settings" },
    },
    {
      id: "go-gh-notifs",
      section: "go",
      title: "Open GitHub Notifications",
      subtitle: "github.com",
      keywords: "github notifications external",
      action: { type: "external", href: "https://github.com/notifications" },
    },
    {
      id: "go-gh-watching",
      section: "go",
      title: "Open Watched repositories",
      subtitle: "github.com",
      keywords: "github watched watching repos",
      action: { type: "external", href: "https://github.com/watching" },
    },
    {
      id: "filter-unread",
      section: "filters",
      title: "Show unread",
      subtitle: "Inbox filter",
      keywords: "filter unread",
      action: { type: "navigate", href: "/" },
    },
    {
      id: "filter-all",
      section: "filters",
      title: "Show all open",
      subtitle: "Inbox filter",
      keywords: "filter all open",
      action: { type: "navigate", href: "/?state=all" },
    },
    {
      id: "filter-done",
      section: "filters",
      title: "Show done",
      subtitle: "Inbox filter",
      keywords: "filter done cleared finished",
      action: { type: "navigate", href: "/?state=done" },
    },
    {
      id: "filter-releases",
      section: "filters",
      title: "Show releases",
      subtitle: "Inbox filter",
      keywords: "filter release releases",
      action: { type: "navigate", href: "/?type=release" },
    },
    {
      id: "filter-merged",
      section: "filters",
      title: "Show merged",
      subtitle: "Inbox filter",
      keywords: "filter merged pr",
      action: { type: "navigate", href: "/?type=merged" },
    },
    {
      id: "filter-failed",
      section: "filters",
      title: "Show CI failures",
      subtitle: "Inbox filter",
      keywords: "filter ci failed action failure checks",
      action: { type: "navigate", href: "/?type=ci_failed" },
    },
  ];
}

export function threadEntry(input: {
  id: string;
  repositoryId: string;
  repositoryName: string;
  subject: string;
  reason: string;
}): PaletteEntry {
  return {
    id: `thread-${input.id}`,
    section: "threads",
    title: input.subject,
    subtitle: `${input.repositoryName} · ${input.reason.replace(/_/g, " ")}`,
    keywords: `${input.subject} ${input.repositoryName} ${input.reason}`,
    action: { type: "thread", id: input.id, repositoryId: input.repositoryId },
  };
}

export function repoEntry(input: { id: string; fullName: string }): PaletteEntry {
  return {
    id: `repo-${input.id}`,
    section: "repos",
    title: input.fullName,
    subtitle: "Select this repo",
    keywords: input.fullName,
    action: { type: "repo-filter", repositoryId: input.id },
  };
}

/**
 * Scope prefix for the palette input. `repo:web` and `r:web` narrow the
 * palette to repository results, `type:`, `state:`, and `age:` list that
 * dimension's values. `#` is deliberately not a scope: it belongs to
 * thread titles as the PR/issue number (`bg#862` must stay searchable).
 */
export type PaletteScope = "all" | "repos" | "types" | "states" | "ages";

export function parsePaletteScope(query: string): {
  scope: PaletteScope;
  term: string;
} {
  const trimmed = query.trimStart();
  const lower = trimmed.toLowerCase();
  for (const prefix of ["repo:", "r:"]) {
    if (lower.startsWith(prefix)) {
      return { scope: "repos", term: trimmed.slice(prefix.length).trimStart() };
    }
  }
  if (lower.startsWith("type:")) {
    return { scope: "types", term: trimmed.slice("type:".length).trimStart() };
  }
  if (lower.startsWith("state:")) {
    return { scope: "states", term: trimmed.slice("state:".length).trimStart() };
  }
  if (lower.startsWith("age:")) {
    return { scope: "ages", term: trimmed.slice("age:".length).trimStart() };
  }
  return { scope: "all", term: query };
}

export const SCOPE_PREFIX: Record<Exclude<PaletteScope, "all">, string> = {
  repos: "repo:",
  types: "type:",
  states: "state:",
  ages: "age:",
};

export function stripScopePrefix(query: string): string {
  return query.replace(/^\s*(?:repo:|r:|type:|state:|age:)\s*/i, "");
}

/**
 * GitHub-style qualifier completion. While the query looks like a scope
 * qualifier being typed (`r`, `type:`, `age:`), suggest the qualifier
 * itself above the hits so the trick discovers itself.
 */
const QUALIFIERS = [
  { prefix: "repo:", subtitle: "Search only repositories, e.g. repo:bg" },
  { prefix: "type:", subtitle: "Filter by type, e.g. type:release" },
  { prefix: "state:", subtitle: "Filter by state: unread, all, done" },
  { prefix: "age:", subtitle: "Filter by age, e.g. age:7d" },
];

export function qualifierEntries(query: string): PaletteEntry[] {
  const t = query.trim().toLowerCase();
  if (!t) return [];
  return QUALIFIERS.filter((q) => q.prefix.startsWith(t)).map((q) => ({
    id: `qual-${q.prefix}`,
    section: "syntax",
    title: q.prefix,
    subtitle: q.subtitle,
    keywords: `${q.prefix} qualifier scope syntax filter`,
    action: { type: "qualifier", prefix: q.prefix },
  }));
}

/**
 * Guarantees matching repositories stay visible in mixed results. Threads
 * sharing the repo name can outnumber the rank cap on large accounts
 * (every thread subtitle names its repo), pushing the repo rows
 * themselves off the list. The top missing matches are spliced in next
 * to the other repo hits so keyboard order still follows the groups.
 */
export function ensureRepoEntries(
  ranked: PaletteEntry[],
  term: string,
  repos: { id: string; fullName: string }[]
): PaletteEntry[] {
  if (!term) return ranked;
  const have = new Set(
    ranked.filter((e) => e.action.type === "repo-filter").map((e) => e.id)
  );
  const missing = rankSearch(term, repos, (r) => [r.fullName], 5)
    .map((r) => r.item)
    .filter((r) => !have.has(`repo-${r.id}`));
  if (missing.length === 0) return ranked;
  const entries = missing.map(repoEntry);
  let lastRepoIdx = -1;
  for (let i = ranked.length - 1; i >= 0; i--) {
    if (ranked[i]?.action.type === "repo-filter") {
      lastRepoIdx = i;
      break;
    }
  }
  const at = lastRepoIdx === -1 ? ranked.length : lastRepoIdx + 1;
  return [...ranked.slice(0, at), ...entries, ...ranked.slice(at)];
}

/**
 * Filter values for the state and age dimensions. Types come from the
 * server facets so counts stay truthful; states and ages are fixed sets.
 */
const STATE_FILTERS = [
  { value: "unread", label: "Unread" },
  { value: "all", label: "All open" },
  { value: "done", label: "Done" },
];

export function stateEntries(): PaletteEntry[] {
  return STATE_FILTERS.map((f) => ({
    id: `state-${f.value}`,
    section: "filters",
    title: f.label,
    subtitle: "Filter inbox by state",
    keywords: `state ${f.value} ${f.label} filter`,
    action: { type: "filter", field: "state", value: f.value },
  }));
}

export function ageEntries(): PaletteEntry[] {
  return AGE_FILTERS.map((f) => ({
    id: `age-${f.value}`,
    section: "filters",
    title: f.label,
    subtitle: "Filter inbox by age",
    keywords: `age ${f.value} ${f.label} filter`,
    action: { type: "filter", field: "age", value: f.value },
  }));
}

export function typeEntries(
  facets: { value: string; label: string; count?: number }[]
): PaletteEntry[] {
  return facets.map((f) => ({
    id: `type-${f.value}`,
    section: "filters",
    title: f.label,
    subtitle:
      typeof f.count === "number" ? `${f.count} items` : "Filter inbox by type",
    keywords: `type ${f.value} ${f.label} filter`,
    action: { type: "filter", field: "type", value: f.value },
  }));
}

/**
 * CodeRabbit-style dimension browser: one row per inbox filter
 * dimension showing its current value. Selecting a row drills into that
 * dimension's values by rewriting the query to its scope prefix.
 */
export function dimensionEntries(
  filters: InboxFilters,
  repos: { id: string; fullName: string }[],
  types: { value: string; label: string }[]
): PaletteEntry[] {
  const repoName =
    filters.repo === "all"
      ? "All repositories"
      : (repos.find((r) => r.id === filters.repo)?.fullName ?? filters.repo);
  const typeLabel =
    filters.type === "all"
      ? "All types"
      : (types.find((t) => t.value === filters.type)?.label ?? filters.type);
  const stateLabel =
    filters.state === "unread"
      ? "Unread"
      : filters.state === "done"
        ? "Done"
        : "All open";
  const ageLabel =
    AGE_FILTERS.find((f) => f.value === filters.age)?.label ?? filters.age;
  return [
    {
      id: "dim-repo",
      section: "filters",
      title: "Repository",
      subtitle: `Currently: ${repoName}`,
      keywords: "filter repository repo dimension scope repos",
      action: { type: "dimension", dimension: "repo" },
    },
    {
      id: "dim-type",
      section: "filters",
      title: "Type",
      subtitle: `Currently: ${typeLabel}`,
      keywords: "filter type kind dimension scope",
      action: { type: "dimension", dimension: "type" },
    },
    {
      id: "dim-state",
      section: "filters",
      title: "State",
      subtitle: `Currently: ${stateLabel}`,
      keywords: "filter state unread done open dimension scope",
      action: { type: "dimension", dimension: "state" },
    },
    {
      id: "dim-age",
      section: "filters",
      title: "Age",
      subtitle: `Currently: ${ageLabel}`,
      keywords: "filter age time dimension scope",
      action: { type: "dimension", dimension: "age" },
    },
  ];
}

/**
 * Hands the palette query to the inbox sidebar: selecting this entry
 * closes the palette and narrows the repository list instead of
 * filtering the inbox itself.
 */
export function filterListEntry(query: string, matchCount: number): PaletteEntry {
  const label =
    matchCount === 1 ? "1 matching repository" : `${matchCount} matching repositories`;
  return {
    id: `filter-list-${query}`,
    section: "repos",
    title: `Filter repository list to “${query.trim()}”`,
    subtitle: `${label} in the inbox sidebar`,
    keywords: `filter list sidebar repos ${query}`,
    action: { type: "filter-list", query: query.trim() },
  };
}
