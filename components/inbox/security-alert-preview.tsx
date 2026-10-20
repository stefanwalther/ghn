"use client";

import { Badge } from "@/components/ui/badge";
import { Markdown } from "@/components/inbox/markdown";
import type { DependabotAlertDetails } from "@/lib/github";

function severityVariant(severity: string | null): "destructive" | "secondary" | "muted" | "outline" {
  switch ((severity ?? "").toLowerCase()) {
    case "critical":
    case "high":
      return "destructive";
    case "medium":
      return "secondary";
    case "low":
      return "muted";
    default:
      return "outline";
  }
}

function stateVariant(state: string | null): "destructive" | "secondary" | "muted" {
  switch ((state ?? "").toLowerCase()) {
    case "open":
      return "destructive";
    case "fixed":
      return "secondary";
    default:
      return "muted";
  }
}

function formatDate(ms: number | null): string | null {
  if (ms === null || Number.isNaN(ms)) return null;
  try {
    return new Date(ms).toLocaleDateString(undefined, {
      year: "numeric",
      month: "short",
      day: "numeric",
    });
  } catch {
    return null;
  }
}

export function SecurityAlertPreview({
  alert,
  repositoryUrl,
}: {
  alert: DependabotAlertDetails;
  repositoryUrl: string;
}) {
  const created = formatDate(alert.createdAt);
  const fixed = formatDate(alert.fixedAt);
  const dismissed = formatDate(alert.dismissedAt);
  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-2">
        {alert.severity ? (
          <Badge variant={severityVariant(alert.severity)}>
            {alert.severity}
          </Badge>
        ) : null}
        {alert.state ? <Badge variant={stateVariant(alert.state)}>{alert.state}</Badge> : null}
        {alert.packageName ? (
          <span className="font-mono text-xs text-muted-foreground">
            {alert.ecosystem ? `${alert.ecosystem}:` : ""}
            {alert.packageName}
          </span>
        ) : null}
      </div>

      {alert.summary ? (
        <p className="text-sm font-medium leading-snug">{alert.summary}</p>
      ) : null}

      <dl className="grid grid-cols-1 gap-2 rounded-lg bg-muted/40 px-4 py-3 text-sm">
        {alert.manifestPath ? (
          <div className="flex gap-2">
            <dt className="w-28 shrink-0 text-xs text-muted-foreground">Manifest</dt>
            <dd className="min-w-0 flex-1 truncate font-mono text-xs" title={alert.manifestPath}>
              {alert.manifestPath}
            </dd>
          </div>
        ) : null}
        {alert.vulnerableRange ? (
          <div className="flex gap-2">
            <dt className="w-28 shrink-0 text-xs text-muted-foreground">Affected</dt>
            <dd className="min-w-0 flex-1 font-mono text-xs">{alert.vulnerableRange}</dd>
          </div>
        ) : null}
        {alert.patchedVersion ? (
          <div className="flex gap-2">
            <dt className="w-28 shrink-0 text-xs text-muted-foreground">Patched</dt>
            <dd className="min-w-0 flex-1 font-mono text-xs">{alert.patchedVersion}</dd>
          </div>
        ) : null}
        {alert.scope ? (
          <div className="flex gap-2">
            <dt className="w-28 shrink-0 text-xs text-muted-foreground">Scope</dt>
            <dd className="min-w-0 flex-1 text-xs">{alert.scope}</dd>
          </div>
        ) : null}
        <div className="flex gap-2">
          <dt className="w-28 shrink-0 text-xs text-muted-foreground">Identifiers</dt>
          <dd className="min-w-0 flex-1 font-mono text-xs">
            {[alert.cveId, alert.ghsaId].filter(Boolean).join(" · ") || "—"}
          </dd>
        </div>
        <div className="flex gap-2">
          <dt className="w-28 shrink-0 text-xs text-muted-foreground">Timeline</dt>
          <dd className="min-w-0 flex-1 text-xs text-muted-foreground">
            {[
              created ? `Opened ${created}` : null,
              fixed ? `Fixed ${fixed}` : null,
              dismissed
                ? `Dismissed ${dismissed}${alert.dismissedReason ? ` (${alert.dismissedReason.replace("_", " ")})` : ""}`
                : null,
            ]
              .filter(Boolean)
              .join(" · ") || "—"}
          </dd>
        </div>
      </dl>

      {alert.description ? (
        <div className="flex min-w-0 flex-col gap-2">
          <h3 className="text-xs font-medium text-muted-foreground">Advisory</h3>
          <Markdown text={alert.description} repositoryUrl={repositoryUrl} />
        </div>
      ) : (
        <p className="text-sm text-muted-foreground">No advisory description.</p>
      )}
    </div>
  );
}
