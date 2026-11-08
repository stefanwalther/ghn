"use client";

import * as React from "react";
import { ChevronDown, ExternalLink } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Markdown } from "@/components/inbox/markdown";
import { releaseBadgeKind, type ReleaseAsset, type ReleaseDetails } from "@/lib/github";
import { cn } from "@/lib/utils";

export function formatReleaseAssetSize(size: number | null): string | null {
  if (size === null || !Number.isFinite(size) || size < 0) return null;
  if (size < 1024) return `${size} Bytes`;
  const units = ["KB", "MB", "GB"];
  let value = size / 1024;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit += 1;
  }
  const rounded = Math.round(value * 10) / 10;
  const text = Number.isInteger(rounded) ? rounded.toString() : rounded.toFixed(1);
  return `${text} ${units[unit]}`;
}

function AssetRow({ asset }: { asset: ReleaseAsset }) {
  const size = formatReleaseAssetSize(asset.size);
  const body = (
    <>
      <span
        className="min-w-0 flex-1 truncate font-mono text-xs"
        title={asset.name}
      >
        {asset.name}
      </span>
      {size ? (
        <span className="shrink-0 text-xs text-muted-foreground">{size}</span>
      ) : null}
      <ExternalLink className="h-3.5 w-3.5 shrink-0" aria-hidden />
    </>
  );
  const className =
    "flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-sm transition-colors duration-150 hover:bg-accent hover:text-accent-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";
  if (asset.downloadUrl) {
    return (
      <a
        href={asset.downloadUrl}
        target="_blank"
        rel="noopener noreferrer"
        aria-label={`Download ${asset.name}`}
        className={className}
      >
        {body}
      </a>
    );
  }
  return (
    <span aria-label={asset.name} className={className}>
      {body}
    </span>
  );
}

export function ReleasePreview({
  release,
  repositoryUrl,
}: {
  release: ReleaseDetails;
  repositoryUrl: string;
}) {
  const published =
    release.publishedAt !== null && !Number.isNaN(release.publishedAt)
      ? new Date(release.publishedAt).toLocaleString()
      : null;
  const badge = releaseBadgeKind(release);
  // Assets stay collapsed until the user asks for them: the count is the
  // triage signal, the file list is one tap away.
  const [assetsOpen, setAssetsOpen] = React.useState(false);
  return (
    <div className="flex min-w-0 flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2">
        {badge === "draft" ? <Badge variant="secondary">draft</Badge> : null}
        {badge === "pre-release" ? (
          <Badge variant="outline">pre-release</Badge>
        ) : null}
        <span className="font-mono text-xs text-muted-foreground">{release.tagName}</span>
        {release.targetRef ? (
          <span className="font-mono text-xs text-muted-foreground">
            · {release.targetRef}
          </span>
        ) : null}
      </div>
      <p className="text-xs text-muted-foreground">
        {release.authorLogin ? <span>{release.authorLogin}</span> : null}
        {release.authorLogin && published ? " · " : null}
        {published ? <span>{published}</span> : null}
      </p>
      {release.body ? (
        <Markdown text={release.body} repositoryUrl={repositoryUrl} />
      ) : (
        <p className="text-sm text-muted-foreground">No description.</p>
      )}
      {release.assets.length > 0 ? (
        <div className="flex min-w-0 flex-col gap-1 border-t border-border pt-4">
          <button
            type="button"
            aria-expanded={assetsOpen}
            aria-label={assetsOpen ? "Collapse assets" : "Expand assets"}
            onClick={() => setAssetsOpen((v) => !v)}
            className="flex w-full cursor-pointer items-center justify-between gap-2 rounded-md px-2 py-1 text-xs font-medium text-muted-foreground transition-colors duration-150 hover:bg-accent hover:text-accent-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <span>
              Assets ({release.assets.length})
            </span>
            <ChevronDown
              className={cn(
                "h-3.5 w-3.5 shrink-0 transition-transform duration-150",
                !assetsOpen && "-rotate-90"
              )}
              aria-hidden
            />
          </button>
          {assetsOpen ? (
            release.assets.map((asset, index) => (
              <AssetRow key={`${asset.name}-${index}`} asset={asset} />
            ))
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
