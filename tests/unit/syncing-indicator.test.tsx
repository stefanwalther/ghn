import { describe, expect, test } from "vitest";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import {
  NotificationList,
  type InboxItem,
} from "@/components/inbox/notification-list";
import { SyncSpinner } from "@/components/ui/sync-spinner";

const item: InboxItem = {
  id: "a1",
  repositoryId: "r1",
  repositoryName: "my-org/my-repo",
  subject: "Fix flaky rate-limit retry",
  subjectType: "PullRequest",
  subjectState: "open",
  reason: "review_requested",
  prMerged: false,
  createdAt: Date.now(),
  isRead: 0,
  isDone: 0,
  sourceUrl: "https://github.com/my-org/my-repo/pull/1",
  due: false,
  dueLabel: null,
};

function renderList(syncingIds?: Set<string>) {
  return renderToStaticMarkup(
    <NotificationList
      items={[item]}
      selected={new Set()}
      showHints={false}
      syncingIds={syncingIds}
      onToggle={() => {}}
      onToggleAll={() => {}}
      onQuickSelect={() => {}}
      onMenuAction={() => {}}
      onOpen={() => {}}
    />
  );
}

describe("single-item sync indicator", () => {
  test("idle row shows no syncing markup", () => {
    const html = renderList(new Set());
    expect(html).not.toContain("aria-busy");
    expect(html).not.toContain('role="status"');
    expect(html).not.toContain("Syncing");
  });

  test("syncing row marks itself busy with a spinner status", () => {
    const html = renderList(new Set([item.id]));
    expect(html).toContain('aria-busy="true"');
    expect(html).toContain('role="status"');
    expect(html).toContain("Syncing…");
    expect(html).toContain("animate-spin");
    expect(html).toContain("sr-only");
  });

  test("only the syncing row is marked busy", () => {
    const other: InboxItem = { ...item, id: "b2", subject: "Other thread" };
    const html = renderToStaticMarkup(
      <NotificationList
        items={[item, other]}
        selected={new Set()}
        showHints={false}
        syncingIds={new Set([other.id])}
        onToggle={() => {}}
        onToggleAll={() => {}}
        onQuickSelect={() => {}}
        onMenuAction={() => {}}
        onOpen={() => {}}
      />
    );
    expect(html).toContain('id="notification-b2"');
    const busyCount = html.split('aria-busy="true"').length - 1;
    expect(busyCount).toBe(1);
  });
});

describe("SyncSpinner", () => {
  test("spins by default", () => {
    const html = renderToStaticMarkup(<SyncSpinner />);
    expect(html).toContain("animate-spin");
  });

  test("static when spinning is false", () => {
    const html = renderToStaticMarkup(<SyncSpinner spinning={false} />);
    expect(html).not.toContain("animate-spin");
    expect(html).toContain("<svg");
  });
});
