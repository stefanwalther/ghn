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
  { value: "subscribed", label: "Subscribed" },
  { value: "manual", label: "Manual" },
  { value: "invitation", label: "Invitation" },
  { value: "state_change", label: "State change" },
  { value: "security_advisory", label: "Security advisory" },
];

export const QUICK_SELECTS: { value: string; label: string }[] = [
  { value: "release", label: "All releases" },
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
