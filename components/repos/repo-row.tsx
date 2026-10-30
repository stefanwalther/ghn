"use client";

import * as React from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/select";
import { snoozePresets } from "@/lib/snooze";

export interface RepoRowData {
  id: string;
  fullName: string;
  ownership: string;
  rhythm: string;
  nextDueLabel: string;
  pendingCount: number;
  unreachable?: boolean;
  snoozedUntil: number | null;
  isSnoozed: boolean;
  snoozeLabel: string;
  pinned: boolean;
}

function toLocalInputValue(ts: number): string {
  const d = new Date(ts);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function RepoRow({
  repo,
  onRhythm,
  onSnooze,
  onPin,
  busy,
}: {
  repo: RepoRowData;
  onRhythm: (id: string, rhythm: string) => void;
  onSnooze: (id: string, snoozedUntil: number | null) => void;
  onPin: (id: string, pinned: boolean) => void;
  busy: boolean;
}) {
  const presets = React.useMemo(() => snoozePresets(Date.now()), []);
  const [customOpen, setCustomOpen] = React.useState(false);
  const [customValue, setCustomValue] = React.useState(() =>
    toLocalInputValue(Date.now() + 24 * 3600 * 1000)
  );

  function handleSnoozeSelect(value: string) {
    if (value === "off") {
      onSnooze(repo.id, null);
      return;
    }
    if (value === "custom") {
      setCustomOpen(true);
      return;
    }
    const preset = presets.find((p) => p.value === value);
    if (preset) onSnooze(repo.id, preset.at);
  }

  function applyCustom() {
    const at = new Date(customValue).getTime();
    if (Number.isFinite(at) && at > Date.now()) {
      onSnooze(repo.id, at);
      setCustomOpen(false);
    }
  }

  return (
    <div className="flex flex-wrap items-center gap-3 rounded-lg bg-card px-4 py-3 shadow-sm">
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-sm font-medium">{repo.fullName}</span>
          <Badge variant="muted">{repo.ownership}</Badge>
          <Badge variant="muted">{repo.pendingCount} pending</Badge>
          {repo.pinned ? <Badge variant="accent">Pinned</Badge> : null}
          {repo.isSnoozed ? <Badge variant="accent">Snoozed until {repo.snoozeLabel}</Badge> : null}
          {repo.unreachable ? (
            <Badge
              variant="destructive"
              title="GitHub no longer returns this repository (renamed, deleted, or access lost). Cached items stay readable."
            >
              Unreachable
            </Badge>
          ) : null}
        </div>
        <p className="mt-1 text-xs text-muted-foreground">
          {repo.unreachable
            ? "GitHub no longer returns this repository. Cached items stay readable; change the rhythm or remove it once triaged."
            : "Next digest " + repo.nextDueLabel + ". Monthly and biweekly items stay collapsed in the inbox until due."}
        </p>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <Button
          size="sm"
          variant="ghost"
          disabled={busy}
          onClick={() => onPin(repo.id, !repo.pinned)}
          aria-label={`${repo.pinned ? "Unpin" : "Pin"} ${repo.fullName}`}
          title={repo.pinned ? "Unpin this repository" : "Pin this repository"}
        >
          {repo.pinned ? "Unpin" : "Pin"}
        </Button>
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
        <label className="flex items-center gap-2 text-xs text-muted-foreground">
          Snooze
          <Select
            value={repo.isSnoozed ? "snoozed" : "off"}
            disabled={busy}
            onChange={(e) => handleSnoozeSelect(e.target.value)}
            aria-label={`Snooze ${repo.fullName}`}
          >
            {repo.isSnoozed ? (
              <option value="snoozed">Snoozed until {repo.snoozeLabel}</option>
            ) : (
              <option value="off">Not snoozed</option>
            )}
            {presets.map((p) => (
              <option key={p.value} value={p.value}>
                {p.label}
              </option>
            ))}
            <option value="custom">Custom…</option>
            {repo.isSnoozed ? <option value="off">Unsnooze</option> : null}
          </Select>
        </label>
      </div>
      {customOpen ? (
        <div className="flex w-full flex-wrap items-center gap-2">
          <input
            type="datetime-local"
            value={customValue}
            onChange={(e) => setCustomValue(e.target.value)}
            aria-label={`Custom snooze time for ${repo.fullName}`}
            className="h-9 cursor-pointer rounded-md border border-input bg-background px-3 text-sm transition-colors duration-150 hover:bg-accent hover:text-accent-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          />
          <Button size="sm" variant="secondary" disabled={busy} onClick={applyCustom}>
            Snooze
          </Button>
          <Button size="sm" variant="ghost" onClick={() => setCustomOpen(false)}>
            Cancel
          </Button>
        </div>
      ) : null}
    </div>
  );
}
