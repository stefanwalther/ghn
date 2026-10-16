export type Rhythm = "immediate" | "weekly" | "biweekly" | "monthly";

export interface DigestRepo {
  id: string;
  rhythm: Rhythm;
  lastPromotedAt: number | null;
  nextDueAt: number | null;
}

export function computeNextDueAt(rhythm: Rhythm, from: number): number | null {
  if (rhythm === "immediate") return null;
  const d = new Date(from);
  if (rhythm === "weekly") return from + 7 * 24 * 60 * 60 * 1000;
  if (rhythm === "biweekly") return from + 14 * 24 * 60 * 60 * 1000;
  const year = d.getFullYear();
  const month = d.getMonth();
  const day = d.getDate();
  const next = new Date(year, month + 1, day, d.getHours(), d.getMinutes(), d.getSeconds(), d.getMilliseconds());
  if (next.getDate() !== day) return new Date(year, month + 2, 0).getTime();
  return next.getTime();
}

export function isDue(repo: DigestRepo, now: number): boolean {
  if (repo.rhythm === "immediate") return true;
  if (repo.nextDueAt == null) return true;
  return now >= repo.nextDueAt;
}

export interface GroupableNotification {
  id: string;
  repositoryId: string;
  isDone: boolean;
}

export function splitInbox<T extends GroupableNotification>(
  items: T[],
  reposById: Map<string, DigestRepo>,
  now: number
): { mainFlow: T[]; collapsedRepoIds: Set<string> } {
  const mainFlow: T[] = [];
  const collapsedRepoIds = new Set<string>();
  for (const item of items) {
    if (item.isDone) continue;
    const repo = reposById.get(item.repositoryId);
    if (!repo || isDue(repo, now)) {
      mainFlow.push(item);
    } else {
      collapsedRepoIds.add(item.repositoryId);
    }
  }
  return { mainFlow, collapsedRepoIds };
}

export function formatDueDate(nextDueAt: number | null): string {
  if (nextDueAt == null) return "Immediate";
  return new Date(nextDueAt).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
  });
}
