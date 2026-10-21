export type AgeFilter =
  | "all"
  | "24h"
  | "48h"
  | "7d"
  | "14d"
  | "30d"
  | "year"
  | "older";

export const AGE_FILTERS: { value: AgeFilter; label: string }[] = [
  { value: "all", label: "All time" },
  { value: "24h", label: "Last 24 hours" },
  { value: "48h", label: "Last 48 hours" },
  { value: "7d", label: "Last 7 days" },
  { value: "14d", label: "Last 14 days" },
  { value: "30d", label: "Last 30 days" },
  { value: "year", label: "This year" },
  { value: "older", label: "Older than a year" },
];

export const TYPE_FILTERS: { value: string; label: string }[] = [
  { value: "all", label: "All types" },
  { value: "pull_request", label: "Pull requests" },
  { value: "mention", label: "Mention" },
  { value: "team_mention", label: "Team mention" },
  { value: "review_requested", label: "Review requested" },
  { value: "assign", label: "Assigned" },
  { value: "author", label: "Author" },
  { value: "comment", label: "Comment" },
  { value: "ci_activity", label: "CI activity" },
  { value: "action_failed", label: "Action failed" },
  { value: "ci_failed", label: "CI failed" },
  { value: "release", label: "Release" },
  { value: "merged", label: "Merged" },
  { value: "closed", label: "Closed" },
  { value: "subscribed", label: "Subscribed" },
  { value: "manual", label: "Manual" },
  { value: "invitation", label: "Invitation" },
  { value: "state_change", label: "State change" },
  { value: "security_advisory", label: "Security advisory" },
];

export const QUICK_SELECTS: { value: string; label: string }[] = [
  { value: "release", label: "All releases" },
  { value: "merged", label: "All merged" },
  { value: "closed", label: "All closed" },
];

export function isReleaseItem(input: {
  reason: string;
  subject: string;
  subjectType?: string | null;
}): boolean {
  if (input.reason === "release") return true;
  if (input.subjectType === "Release") return true;
  if (/^v\d+\.\d+/i.test(input.subject.trim())) return true;
  if (/chore\(main\): release/i.test(input.subject)) return true;
  return false;
}

export function isMergedItem(input: {
  reason: string;
  prMerged?: boolean | null;
}): boolean {
  if (input.reason === "merged") return true;
  return input.prMerged === true;
}

export function isClosedItem(input: {
  reason: string;
  prMerged?: boolean | null;
  subjectState?: string | null;
}): boolean {
  if (isMergedItem(input)) return false;
  return input.subjectState === "closed";
}

export function matchesTypeFilter(
  reason: string,
  subjectType: string | null | undefined,
  filter: string,
  extra?: { prMerged?: boolean | null; subjectState?: string | null }
): boolean {
  if (filter === "all") return true;
  if (filter === "pull_request") return subjectType === "PullRequest";
  if (filter === "merged") {
    if (reason === "merged") return true;
    return extra?.prMerged === true;
  }
  if (filter === "closed") {
    if (extra?.subjectState !== "closed") return false;
    if (reason === "merged" || extra?.prMerged === true) return false;
    return true;
  }
  return reason === filter;
}

export interface QuickSelectItem {
  id: string;
  reason: string;
  subject: string;
  subjectType?: string | null;
  subjectState?: string | null;
  prMerged?: boolean | null;
}

/**
 * The rows a quick select picks.
 *
 * The three special reasons read the item's own state rather than its
 * reason, and everything else matches on the reason.
 */
export function selectByQuickFilter(
  items: QuickSelectItem[],
  reason: string
): string[] {
  if (reason === "release") {
    return items
      .filter((item) =>
        isReleaseItem({
          reason: item.reason,
          subject: item.subject,
          subjectType: item.subjectType ?? null,
        })
      )
      .map((item) => item.id);
  }
  if (reason === "merged") {
    return items
      .filter((item) =>
        isMergedItem({ reason: item.reason, prMerged: item.prMerged ?? false })
      )
      .map((item) => item.id);
  }
  if (reason === "closed") {
    return items
      .filter((item) =>
        isClosedItem({
          reason: item.reason,
          prMerged: item.prMerged ?? false,
          subjectState: item.subjectState ?? null,
        })
      )
      .map((item) => item.id);
  }
  return items.filter((item) => item.reason === reason).map((item) => item.id);
}

const DAY = 24 * 60 * 60 * 1000;

export function startOfYear(now: number): number {
  const d = new Date(now);
  return new Date(d.getFullYear(), 0, 1).getTime();
}

export function matchAge(createdAt: number, now: number, age: AgeFilter): boolean {
  switch (age) {
    case "all":
      return true;
    case "older":
      return now - createdAt > 365 * DAY;
    case "year":
      return createdAt >= startOfYear(now);
    case "24h":
      return createdAt >= now - DAY;
    case "48h":
      return createdAt >= now - 2 * DAY;
    case "7d":
      return createdAt >= now - 7 * DAY;
    case "14d":
      return createdAt >= now - 14 * DAY;
    case "30d":
      return createdAt >= now - 30 * DAY;
  }
}
