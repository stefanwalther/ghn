export type PaletteAction =
  | { type: "navigate"; href: string }
  | { type: "external"; href: string }
  | { type: "event"; name: string; detail?: Record<string, unknown> }
  | { type: "theme" }
  | { type: "thread"; id: string; repositoryId: string }
  | { type: "repo-filter"; repositoryId: string };

export type PaletteSection = "commands" | "go" | "filters" | "threads" | "repos";

export interface PaletteEntry {
  id: string;
  section: PaletteSection;
  title: string;
  subtitle?: string;
  keywords: string;
  action: PaletteAction;
}

export const SECTION_LABELS: Record<PaletteSection, string> = {
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
      action: { type: "event", name: "ghn:refresh" },
    },
    {
      id: "cmd-theme",
      section: "commands",
      title: "Toggle theme",
      subtitle: "Switch light / dark",
      keywords: "theme dark light mode appearance",
      action: { type: "theme" },
    },
    {
      id: "cmd-sidebar",
      section: "commands",
      title: "Toggle sidebar",
      subtitle: "Show or hide the main menu",
      keywords: "sidebar menu collapse expand navigation",
      action: { type: "event", name: "ghn:toggle-sidebar" },
    },
    {
      id: "cmd-shortcuts",
      section: "commands",
      title: "Show keyboard shortcuts",
      subtitle: "Open the shortcut help",
      keywords: "shortcuts help keys bindings ?",
      action: { type: "event", name: "ghn:show-help" },
    },
    {
      id: "cmd-top",
      section: "commands",
      title: "Back to inbox top",
      subtitle: "Clear selection and scroll up",
      keywords: "top scroll clear inbox",
      action: { type: "event", name: "ghn:scroll-top" },
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
    subtitle: "Filter inbox by this repo",
    keywords: input.fullName,
    action: { type: "repo-filter", repositoryId: input.id },
  };
}
