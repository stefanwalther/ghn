"use client";

import * as React from "react";
import { Badge } from "@/components/ui/badge";
import { Collapsible } from "@/components/ui/collapsible";
import { RepoSnoozeMenu, useRowVisibility } from "@/components/inbox/repo-snooze-menu";

export interface DigestGroup {
  repositoryId: string;
  repositoryName: string;
  rhythm: string;
  nextDueAt: number | null;
  nextDueLabel: string;
  pendingCount: number;
  /** Unread rows among the collapsed items; drives the read button. */
  unreadCount?: number;
  isSnoozed?: boolean;
  snoozeLabel?: string;
}

/** Collapsed quiet-digest repositories waiting for their due date. */
export function DigestSection({
  groups,
  onSnooze,
  snoozeDisabled,
  onMarkAllDone,
  markAllDoneBusy,
  busyRepoIds,
  onMarkAllRead,
  markAllReadBusy,
  onCopied,
}: {
  groups: DigestGroup[];
  onSnooze?: (id: string, snoozedUntil: number | null) => void;
  snoozeDisabled?: boolean;
  onMarkAllDone?: (id: string) => void;
  markAllDoneBusy?: boolean;
  /** Per-repo pending set; when provided it replaces the global busy flag. */
  busyRepoIds?: Set<string>;
  onMarkAllRead?: (id: string) => void;
  markAllReadBusy?: boolean;
  onCopied?: (id: string, ok: boolean) => void;
}) {
  if (groups.length === 0) return null;
  const total = groups.reduce((n, g) => n + g.pendingCount, 0);
  return (
    <section aria-label="Quiet digests" className="flex flex-col gap-2 opacity-70">
      <h2 className="text-xs font-medium text-muted-foreground">
        Quiet until due ({total} pending)
      </h2>
      {groups.map((g) => (
        <DigestRow
          key={g.repositoryId}
          group={g}
          onSnooze={onSnooze}
          snoozeDisabled={snoozeDisabled}
          onMarkAllDone={onMarkAllDone}
          markAllDoneBusy={markAllDoneBusy}
          busyRepoIds={busyRepoIds}
          onMarkAllRead={onMarkAllRead}
          markAllReadBusy={markAllReadBusy}
          onCopied={onCopied}
        />
      ))}
    </section>
  );
}

/** One quiet repository row with hover actions and a right-click menu. */
function DigestRow({
  group: g,
  onSnooze,
  snoozeDisabled,
  onMarkAllDone,
  markAllDoneBusy,
  busyRepoIds,
  onMarkAllRead,
  markAllReadBusy,
  onCopied,
}: {
  group: DigestGroup;
  onSnooze?: (id: string, snoozedUntil: number | null) => void;
  snoozeDisabled?: boolean;
  onMarkAllDone?: (id: string) => void;
  markAllDoneBusy?: boolean;
  busyRepoIds?: Set<string>;
  onMarkAllRead?: (id: string) => void;
  markAllReadBusy?: boolean;
  onCopied?: (id: string, ok: boolean) => void;
}) {
  const { visible, reset, rowHandlers } = useRowVisibility();
  const [contextAnchor, setContextAnchor] = React.useState<{ x: number; y: number } | null>(null);
  // Quiet rows are all not-done, so done targets the full pending count.
  // Read targets only the unread subset once the server reports it.
  const readable = g.unreadCount ?? g.pendingCount;
  return (
    <div
      className="flex items-start gap-0.5"
      {...rowHandlers}
      onContextMenu={(e) => {
        e.preventDefault();
        e.stopPropagation();
        setContextAnchor({ x: e.clientX, y: e.clientY });
      }}
    >
      <div className="min-w-0 flex-1">
        <Collapsible
          title={<span>{g.repositoryName}</span>}
          meta={
            <span className="flex items-center gap-2">
              <Badge variant="muted">{g.pendingCount} pending</Badge>
              <Badge variant="muted">{g.rhythm}</Badge>
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
      </div>
      {onSnooze ? (
        <span className="pt-2">
          <RepoSnoozeMenu
            repoId={g.repositoryId}
            fullName={g.repositoryName}
            isSnoozed={g.isSnoozed ?? false}
            disabled={snoozeDisabled}
            onSnooze={onSnooze}
            onMarkAllDone={onMarkAllDone}
            markAllDoneDisabled={((busyRepoIds?.has(g.repositoryId) ?? false) || (markAllDoneBusy ?? false)) || g.pendingCount === 0}
            markAllDoneCount={g.pendingCount}
            onMarkAllRead={onMarkAllRead}
            markAllReadDisabled={((busyRepoIds?.has(g.repositoryId) ?? false) || (markAllReadBusy ?? false)) || readable === 0}
            markAllReadCount={readable}
            onCopied={onCopied}
            visible={visible}
            contextAnchor={contextAnchor}
            onContextClose={() => setContextAnchor(null)}
            onVisibilityReset={reset}
          />
        </span>
      ) : null}
    </div>
  );
}
