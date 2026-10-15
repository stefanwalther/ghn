"use client";

import { Badge } from "@/components/ui/badge";
import { Select } from "@/components/ui/select";

export interface RepoRowData {
  id: string;
  fullName: string;
  ownership: string;
  rhythm: string;
  nextDueLabel: string;
  pendingCount: number;
}

export function RepoRow({
  repo,
  onRhythm,
  busy,
}: {
  repo: RepoRowData;
  onRhythm: (id: string, rhythm: string) => void;
  busy: boolean;
}) {
  return (
    <div className="flex flex-wrap items-center gap-3 rounded-lg bg-card px-4 py-3 shadow-sm">
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-sm font-medium">{repo.fullName}</span>
          <Badge variant="muted">{repo.ownership}</Badge>
          <Badge variant="muted">{repo.pendingCount} pending</Badge>
        </div>
        <p className="mt-1 text-xs text-muted-foreground">
          Next digest {repo.nextDueLabel}. Monthly and biweekly items stay
          collapsed in the inbox until due.
        </p>
      </div>
      <label className="flex items-center gap-2 text-xs text-muted-foreground">
        Rhythm
        <Select
          value={repo.rhythm}
          disabled={busy}
          onChange={(e) => onRhythm(repo.id, e.target.value)}
          aria-label={`Digest rhythm for ${repo.fullName}`}
        >
          <option value="immediate">Immediate</option>
          <option value="weekly">Weekly</option>
          <option value="biweekly">Every 2 weeks</option>
          <option value="monthly">Monthly</option>
        </Select>
      </label>
    </div>
  );
}
