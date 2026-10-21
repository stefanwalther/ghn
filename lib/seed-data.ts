import { repoIdForFullName } from "@/lib/sync";
import type { Rhythm } from "@/lib/digest";

/**
 * The one dataset, expressed once.
 *
 * The database seeder and the GitHub stand-in both read it, so the
 * application under test and the API it calls always agree. That agreement
 * is what lets a sync preserve the dataset instead of destroying it.
 *
 * Everything about it is fixed. The ages, the repositories, the types, the
 * reasons and the read flags are all derived from the item's index, so two
 * runs produce byte-identical data and every count in the application is
 * predictable.
 */

export const FROZEN_EPOCH = "2026-01-15T12:00:00Z";

export interface SeedRepo {
  id: string;
  fullName: string;
  ownership: "owned" | "watched";
  rhythm: Rhythm;
}

const REPO_LIST: Array<Omit<SeedRepo, "id">> = [
  { fullName: "acme/web", ownership: "owned", rhythm: "immediate" },
  { fullName: "acme/api", ownership: "owned", rhythm: "immediate" },
  { fullName: "acme/mobile", ownership: "owned", rhythm: "immediate" },
  { fullName: "vendor/slow-dep", ownership: "watched", rhythm: "weekly" },
  { fullName: "vendor/ui-kit", ownership: "watched", rhythm: "weekly" },
  { fullName: "oss/router", ownership: "watched", rhythm: "weekly" },
  { fullName: "oss/bundler", ownership: "watched", rhythm: "biweekly" },
  { fullName: "oss/linter", ownership: "watched", rhythm: "biweekly" },
  { fullName: "vendor/analytics", ownership: "watched", rhythm: "monthly" },
  { fullName: "oss/docs", ownership: "watched", rhythm: "monthly" },
];

/**
 * The repository identifiers are derived by the same function the sync path
 * uses. Hard-coding them here is what made a seeded database collide with a
 * synced one on the unique constraint.
 */
export const SEED_REPOS: SeedRepo[] = REPO_LIST.map((repo) => ({
  ...repo,
  id: repoIdForFullName(repo.fullName),
}));

/** The repositories whose rhythm is immediate, so their items are always due. */
export const IMMEDIATE_REPOS = SEED_REPOS.filter((repo) => repo.rhythm === "immediate");

/** The repositories whose items wait for their digest, so they stay collapsed. */
export const QUIET_REPOS = SEED_REPOS.filter((repo) => repo.rhythm !== "immediate");

const SUBJECTS = [
  "Fix flaky login redirect",
  "Bump dependency range",
  "Add empty state for inbox",
  "CI failed on main",
  "Review requested on auth refactor",
  "Docs update for digest settings",
  "Handle rate-limit retry",
  "Dark mode contrast fix",
  "Keyboard focus audit",
  "Weekly digest summary",
  "Release pipeline failed on main",
  "v2.4.0 released",
  "chore(deps): bump sonner from 2.0.7 to 2.0.8 (#818)",
  "chore(deps): bump postgres from 3.4.7 to 3.4.9 (#819)",
];

/**
 * The reasons used by the visible items.
 *
 * "merged" is deliberately absent. The merged signal comes from the
 * subject's own state, so the merged count stays a property of the dataset
 * rather than of an arbitrary reason.
 */
const VISIBLE_REASONS = [
  "mention",
  "review_requested",
  "action_failed",
  "ci_failed",
  "release",
  "assign",
  "subscribed",
] as const;

/** The reasons used by the collapsed items, which are never in the main flow. */
const QUIET_REASONS = [
  "mention",
  "review_requested",
  "action_failed",
  "ci_failed",
  "release",
  "merged",
  "assign",
  "subscribed",
] as const;

/**
 * The visible items' ages, in hours before the frozen instant.
 *
 * Each group is an explicit band, so every age filter has a known, non-zero
 * count in the visible set.
 *
 * The last two groups sit either side of the application's two calendar
 * filters. "This year" means since the local first of January, and "older
 * than a year" means more than 365 days old. Anything between the two
 * matches neither, which is the application's own behaviour rather than a
 * property of the fixture. The dataset keeps a handful of items in that
 * band on purpose, so the gap is pinned by a check instead of being an
 * accident.
 */
const LADDER_AGE_HOURS = [
  // Within a day.
  1, 2, 5, 9, 14, 20, 23,
  // One to two days.
  25, 30, 40, 47,
  // Two days to a week.
  72, 96, 120, 144, 160,
  // One to two weeks.
  192, 240, 312,
  // Two weeks to a month.
  360, 480, 696,
  // A month to a hundred and twenty days.
  720, 1440, 2160, 2880,
  // Beyond a year.
  9600, 12000, 14400, 16800,
] as const;

const HOUR = 60 * 60 * 1000;

export interface SeedNotification {
  id: string;
  repositoryId: string;
  repoFullName: string;
  number: number;
  subject: string;
  subjectType: "PullRequest" | "Issue";
  subjectState: "open" | "closed";
  prMerged: boolean;
  reason: string;
  createdAt: number;
  isRead: boolean;
  sourceUrl: string;
}

/**
 * The age of a collapsed item, in hours before the frozen instant.
 *
 * Half of them fall between the application's two calendar filters and half
 * sit beyond a year. None of them lands within a day, so the collapsed
 * items never disturb the fine-grained age counts.
 */
function quietAgeHours(index: number): number {
  if (index % 2 === 0) {
    // Between a month and about five months old.
    return 744 + (index % 60) * 53;
  }
  // Beyond a year.
  return 8880 + (index % 60) * 130;
}

/**
 * Builds the whole dataset.
 *
 * The first thirty items are the visible ones, spread across the immediate
 * repositories. The remaining hundred and seventy sit in the collapsed
 * repositories, where they wait for their digest.
 */
export function buildSeedNotifications(now: number): SeedNotification[] {
  const items: SeedNotification[] = [];
  const numbers = new Map<string, number>();

  // The number is unique within its repository, so every item has its own
  // subject URL and the stand-in can serve the exact payload for it.
  const nextNumber = (repositoryId: string): number => {
    const current = (numbers.get(repositoryId) ?? 0) + 1;
    numbers.set(repositoryId, current);
    return current;
  };

  for (let index = 0; index < LADDER_AGE_HOURS.length; index += 1) {
    const repo = IMMEDIATE_REPOS[index % IMMEDIATE_REPOS.length]!;
    const subjectType = index % 3 === 0 ? "PullRequest" : "Issue";
    const prMerged = subjectType === "PullRequest" && index % 6 === 0;
    // Every pull request is closed. The merged ones count as merged, the
    // others count as closed, so both filters have a population.
    const subjectState = subjectType === "PullRequest" ? "closed" : "open";
    const number = nextNumber(repo.id);
    items.push({
      id: `n_${String(index + 1).padStart(3, "0")}`,
      repositoryId: repo.id,
      repoFullName: repo.fullName,
      number,
      subject: SUBJECTS[index % SUBJECTS.length]!,
      subjectType,
      subjectState,
      prMerged,
      reason: VISIBLE_REASONS[index % VISIBLE_REASONS.length]!,
      createdAt: now - LADDER_AGE_HOURS[index]! * HOUR,
      isRead: index % 3 === 0,
      sourceUrl: `https://github.com/${repo.fullName}/${
        subjectType === "PullRequest" ? "pull" : "issues"
      }/${number}`,
    });
  }

  for (let index = 0; index < 170; index += 1) {
    const repo = QUIET_REPOS[index % QUIET_REPOS.length]!;
    const subjectType = index % 3 === 0 ? "PullRequest" : "Issue";
    const number = nextNumber(repo.id);
    items.push({
      id: `n_${String(LADDER_AGE_HOURS.length + index + 1).padStart(3, "0")}`,
      repositoryId: repo.id,
      repoFullName: repo.fullName,
      number,
      subject: SUBJECTS[index % SUBJECTS.length]!,
      subjectType,
      subjectState: index % 4 === 0 ? "closed" : "open",
      prMerged: subjectType === "PullRequest" && index % 6 === 0,
      reason: QUIET_REASONS[index % QUIET_REASONS.length]!,
      createdAt: now - quietAgeHours(index) * HOUR,
      isRead: index % 3 === 0,
      sourceUrl: `https://github.com/${repo.fullName}/${
        subjectType === "PullRequest" ? "pull" : "issues"
      }/${number}`,
    });
  }

  return items;
}

export interface SeedThread {
  id: string;
  unread: boolean;
  reason: string;
  updated_at: string;
  subject: { title: string; type: string; url: string };
  repository: { full_name: string; html_url: string; owner: { login: string } };
  url: string;
}

/**
 * The subject URL of an item, relative to the API base.
 *
 * The number is unique within its repository, so every item has its own
 * subject URL and the stand-in can serve the exact payload for it.
 */
export function seedSubjectPath(item: SeedNotification): string {
  const [owner, repo] = item.repoFullName.split("/");
  const kind = item.subjectType === "PullRequest" ? "pulls" : "issues";
  return `/repos/${owner}/${repo}/${kind}/${item.number}`;
}

/**
 * The subject payloads, keyed by their path.
 *
 * The sync path reads the merged flag and the state out of these payloads
 * and writes them into the database. A stand-in that answers every subject
 * with the same default would silently reset both, which is why the payload
 * has to be per item.
 */
export function buildSeedSubjects(
  apiBase: string,
  now: number
): Map<string, unknown> {
  const subjects = new Map<string, unknown>();
  for (const item of buildSeedNotifications(now)) {
    const path = seedSubjectPath(item);
    subjects.set(path, {
      title: item.subject,
      body: "The redirect races the session load.",
      state: item.subjectState,
      draft: false,
      merged: item.prMerged,
      user: { login: "octo" },
      html_url: item.sourceUrl,
      head: { sha: "0123456789abcdef0123456789abcdef01234567" },
    });
  }
  void apiBase;
  return subjects;
}

/**
 * The same dataset in the shape the GitHub API returns it.
 *
 * The subject and thread URLs point at the API base that is given, so the
 * stand-in serves URLs the application can fetch verbatim.
 */
export function buildSeedThreads(apiBase: string, now: number): SeedThread[] {
  return buildSeedNotifications(now).map((item) => {
    const [owner, repo] = item.repoFullName.split("/");
    const kind = item.subjectType === "PullRequest" ? "pulls" : "issues";
    return {
      id: item.id,
      unread: !item.isRead,
      reason: item.reason,
      updated_at: new Date(item.createdAt).toISOString(),
      subject: {
        title: item.subject,
        type: item.subjectType,
        url: `${apiBase}/repos/${owner}/${repo}/${kind}/${item.number}`,
      },
      repository: {
        full_name: item.repoFullName,
        html_url: `https://github.com/${item.repoFullName}`,
        owner: { login: owner ?? "" },
      },
      url: `${apiBase}/notifications/threads/${item.id}`,
    };
  });
}

/** The counts the end-to-end layer asserts against. */
export const SEED_COUNTS = {
  repositories: SEED_REPOS.length,
  notifications: LADDER_AGE_HOURS.length + 170,
  visible: LADDER_AGE_HOURS.length,
  quiet: 170,
};
