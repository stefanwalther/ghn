"use client";

import { Badge } from "@/components/ui/badge";
import { Collapsible } from "@/components/ui/collapsible";

export interface DigestGroup {
  repositoryId: string;
  repositoryName: string;
  rhythm: string;
  nextDueAt: number | null;
  nextDueLabel: string;
  pendingCount: number;
  isSnoozed?: boolean;
  snoozeLabel?: string;
}

export function DigestSection({ groups }: { groups: DigestGroup[] }) {
  if (groups.length === 0) return null;
  const total = groups.reduce((n, g) => n + g.pendingCount, 0);
  return (
    <section aria-label="Quiet digests" className="flex flex-col gap-2 opacity-70">
      <h2 className="text-xs font-medium text-muted-foreground">
        Quiet until due ({total} pending)
      </h2>
      {groups.map((g) => (
        <Collapsible
          key={g.repositoryId}
          title={<span>{g.repositoryName}</span>}
          meta={
            <span className="flex items-center gap-2">
              <Badge variant="muted">{g.pendingCount} pending</Badge>
              <span className="text-xs text-muted-foreground">
                {g.isSnoozed ? `snoozed until ${g.snoozeLabel}` : `due ${g.nextDueLabel}`}
              </span>
            </span>
          }
        >
          <p className="text-sm text-muted-foreground">
            {g.isSnoozed
              ? `Snoozed until ${g.snoozeLabel}. Unsnooze it from Repositories to bring items back early.`
              : `New items stay here until the ${g.rhythm} digest is due. Switch this repo to immediate to promote them now.`}
          </p>
        </Collapsible>
      ))}
    </section>
  );
}
