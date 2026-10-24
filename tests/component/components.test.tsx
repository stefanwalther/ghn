import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { renderWithQuery } from "./support/render-with-query";
import { resetUIStore } from "@/lib/ui-store";
import type { ComponentProps } from "react";
import { BulkBar } from "@/components/inbox/bulk-bar";
import { DigestSection, type DigestGroup } from "@/components/inbox/digest-section";
import { FilterSidebar, type RepoFacet, type TypeFacet } from "@/components/inbox/filter-sidebar";
import { ItemDrawer } from "@/components/inbox/item-drawer";
import { ItemMenu } from "@/components/inbox/item-menu";
import { NotificationList, type InboxItem } from "@/components/inbox/notification-list";
import { ShortcutsHelp } from "@/components/inbox/shortcuts-help";
import { RepoRow, type RepoRowData } from "@/components/repos/repo-row";
import { RepoSnoozeMenu } from "@/components/inbox/repo-snooze-menu";
import ReposPage from "@/app/repos/page";
import RateLimitsPage from "@/app/rate-limits/page";

const item: InboxItem = {
  id: "n_001",
  repositoryId: "acme--web",
  repositoryName: "acme/web",
  subject: "Fix flaky login redirect",
  subjectType: "PullRequest",
  subjectState: "closed",
  reason: "mention",
  prMerged: false,
  createdAt: Date.parse("2026-01-15T10:00:00Z"),
  isRead: 0,
  isDone: 0,
  sourceUrl: "https://github.com/acme/web/pull/1",
  due: true,
  dueLabel: null,
};

const secondItem: InboxItem = {
  id: "n_002",
  repositoryId: "acme--api",
  repositoryName: "acme/api",
  subject: "Bump the linter",
  subjectType: "Issue",
  subjectState: "open",
  reason: "subscribed",
  prMerged: false,
  createdAt: Date.parse("2026-01-15T09:00:00Z"),
  isRead: 1,
  isDone: 0,
  sourceUrl: "https://github.com/acme/api/issues/7",
  due: true,
  dueLabel: null,
};

const items = [item, secondItem];

const typeFacets: TypeFacet[] = [
  { value: "pull_request", label: "Pull requests", count: 4 },
  { value: "mention", label: "Mention", count: 2 },
];

const repoFacets: RepoFacet[] = [
  { id: "acme--web", fullName: "acme/web", main: 3, quiet: 1, isSnoozed: false },
  { id: "acme--api", fullName: "acme/api", main: 0, quiet: 4, isSnoozed: true },
  { id: "acme--empty", fullName: "acme/empty", main: 0, quiet: 0, isSnoozed: false },
];

/**
 * Serves one canned payload for the thread the drawer asked for.
 *
 * The stub checks the requested id, so a drawer that opens the wrong thread
 * fails the check instead of passing against a canned answer.
 */
function stubThread(payload: unknown, expectedId = item.id) {
  const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
    const url = new URL(String(input), "http://localhost");
    const id = url.searchParams.get("id");
    if (id !== expectedId) {
      throw new Error(`the drawer asked for thread ${id}, expected ${expectedId}`);
    }
    return Response.json(payload);
  });
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

// The sidebar and the drawer remember their state in the browser storage, so
// every check starts from an empty one.
beforeEach(() => {
  localStorage.clear();
  sessionStorage.clear();
  resetUIStore();
});

describe("NotificationList", () => {
  function renderList(overrides: Partial<ComponentProps<typeof NotificationList>> = {}) {
    const props = {
      items,
      selected: new Set<string>(),
      showHints: false,
      onToggle: vi.fn(),
      onToggleAll: vi.fn(),
      onQuickSelect: vi.fn(),
      onMenuAction: vi.fn(),
      onOpen: vi.fn(),
      ...overrides,
    };
    render(<NotificationList {...props} />);
    return props;
  }

  test("shows how many items the list holds", () => {
    renderList();
    expect(screen.getByText("2 items")).toBeInTheDocument();
  });

  test("shows the repository, the badges and the subject of every item", () => {
    renderList();

    const list = within(screen.getByRole("list"));
    expect(list.getByText("Fix flaky login redirect")).toBeInTheDocument();
    expect(list.getByText("Bump the linter")).toBeInTheDocument();
    expect(list.getByText("acme/web")).toBeInTheDocument();
    expect(list.getByText("acme/api")).toBeInTheDocument();
    expect(list.getByText("PR")).toBeInTheDocument();
    expect(list.getByText("closed")).toBeInTheDocument();
    expect(list.getByText("subscribed")).toBeInTheDocument();
  });

  test("shows the age of an item relative to the clock", () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-01-15T10:05:00Z"));

    renderList();

    expect(screen.getByText("5m ago")).toBeInTheDocument();
    expect(screen.getByText("1h ago")).toBeInTheDocument();
  });

  test("opens the item that was clicked", () => {
    const props = renderList();

    fireEvent.click(screen.getByText("Fix flaky login redirect"));

    expect(props.onOpen).toHaveBeenCalledWith(item);
  });

  test("toggles the item whose checkbox was clicked", () => {
    const props = renderList();

    fireEvent.click(screen.getByRole("checkbox", { name: "Select Fix flaky login redirect" }));

    expect(props.onToggle).toHaveBeenCalledWith("n_001");
  });

  test("toggles every item from the select-all checkbox", () => {
    const props = renderList();

    fireEvent.click(screen.getByRole("checkbox", { name: "Select all visible" }));

    expect(props.onToggleAll).toHaveBeenCalled();
  });

  test("reports the quick filter that was chosen", () => {
    const props = renderList();

    fireEvent.click(screen.getByRole("button", { name: "All merged" }));

    expect(props.onQuickSelect).toHaveBeenCalledWith("merged");
  });

  test("marks the selected items as checked", () => {
    renderList({ selected: new Set(["n_001"]) });

    expect(screen.getByRole("checkbox", { name: "Select Fix flaky login redirect" })).toBeChecked();
    expect(screen.getByRole("checkbox", { name: "Select Bump the linter" })).not.toBeChecked();
  });

  test("marks select-all as mixed for a partial selection", () => {
    renderList({ selected: new Set(["n_001"]) });

    expect(screen.getByRole("checkbox", { name: "Select all visible" })).toHaveAttribute(
      "aria-checked",
      "mixed"
    );
  });

  test("shows the keyboard hints when they are enabled", () => {
    renderList({ showHints: true });

    expect(screen.getByText(/move select all/)).toBeInTheDocument();
  });

  test("offers a menu and a source link for every item", () => {
    renderList();

    expect(
      screen.getByRole("button", { name: "Actions for Fix flaky login redirect" })
    ).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: "Open source for Fix flaky login redirect" })
    ).toHaveAttribute("href", "https://github.com/acme/web/pull/1");
  });

  test("shows whether an item is merged, due or only unread locally", () => {
    renderList({
      items: [
        { ...item, id: "n_merged", subject: "Merged change", reason: "subscribed", prMerged: true },
        { ...item, id: "n_due", subject: "Digested change", dueLabel: "Digest due" },
        { ...item, id: "n_local", subject: "Locally unread change", localUnread: true },
        {
          ...item,
          id: "n_failed",
          subject: "Broken build",
          reason: "ci_failed",
          subjectState: null,
        },
      ],
    });

    expect(screen.getByText("merged")).toBeInTheDocument();
    expect(screen.getByText("Digest due")).toBeInTheDocument();
    expect(screen.getByText("local only")).toBeInTheDocument();
    expect(screen.getByText("ci failed")).toBeInTheDocument();
  });
});

describe("ItemMenu", () => {
  function renderMenu(target: InboxItem = item) {
    const onAction = vi.fn();
    render(<ItemMenu item={target} onAction={onAction} />);
    return { onAction };
  }

  test("opens a menu with the available actions", () => {
    renderMenu();

    fireEvent.click(screen.getByRole("button", { name: "Actions for Fix flaky login redirect" }));

    const menu = screen.getByRole("menu", { name: "Actions for Fix flaky login redirect" });
    const items = within(menu).getAllByRole("menuitem").map((el) => el.textContent);
    expect(items.join(" ")).toContain("Open source");
    expect(items.join(" ")).toContain("Open details");
    expect(items.join(" ")).toContain("Copy link");
    expect(items.join(" ")).toContain("Sync this item");
    expect(items.join(" ")).toContain("Mark as done");
    expect(items.join(" ")).toContain("Mark as read");
    expect(items.join(" ")).toContain("Unsubscribe and mute");
  });

  test("reports the action that was chosen", () => {
    const { onAction } = renderMenu();

    fireEvent.click(screen.getByRole("button", { name: "Actions for Fix flaky login redirect" }));
    fireEvent.click(screen.getByRole("menuitem", { name: /Copy link/ }));

    expect(onAction).toHaveBeenCalledWith(item, "copy");
  });

  test("closes the menu once an action was chosen", () => {
    const { onAction } = renderMenu();

    fireEvent.click(screen.getByRole("button", { name: "Actions for Fix flaky login redirect" }));
    fireEvent.click(screen.getByRole("menuitem", { name: /Copy link/ }));

    expect(screen.queryByRole("menu")).not.toBeInTheDocument();
    expect(onAction).toHaveBeenCalledTimes(1);
  });

  test("closes the menu on Escape", () => {
    renderMenu();

    fireEvent.click(screen.getByRole("button", { name: "Actions for Fix flaky login redirect" }));
    expect(screen.getByRole("menu")).toBeInTheDocument();

    fireEvent.keyDown(document, { key: "Escape" });

    expect(screen.queryByRole("menu")).not.toBeInTheDocument();
  });

  test("offers to mark an already read item as unread", () => {
    renderMenu({ ...item, isRead: 1 });

    fireEvent.click(screen.getByRole("button", { name: "Actions for Fix flaky login redirect" }));

    const menu = screen.getByRole("menu");
    expect(within(menu).getByRole("menuitem", { name: /Mark as unread/ })).toBeInTheDocument();
    expect(within(menu).queryByRole("menuitem", { name: /Mark as read/ })).not.toBeInTheDocument();
  });

  test("moves the focus through the menu with the arrow keys", () => {
    renderMenu();

    fireEvent.click(screen.getByRole("button", { name: "Actions for Fix flaky login redirect" }));
    const menu = screen.getByRole("menu");
    const entries = within(menu).getAllByRole("menuitem");
    expect(entries[0]).toHaveFocus();

    fireEvent.keyDown(entries[0]!, { key: "ArrowDown" });

    expect(entries[1]).toHaveFocus();
  });

  test("closes the menu when the user clicks outside it", () => {
    renderMenu();

    fireEvent.click(screen.getByRole("button", { name: "Actions for Fix flaky login redirect" }));
    expect(screen.getByRole("menu")).toBeInTheDocument();

    fireEvent.mouseDown(document.body);

    expect(screen.queryByRole("menu")).not.toBeInTheDocument();
  });
});

describe("ItemDrawer", () => {
  const threadPayload = {
    title: "Fix flaky login redirect",
    body: "Looks good to me",
    state: "closed",
    authorLogin: "alice",
    htmlUrl: "https://github.com/acme/web/pull/1",
    draft: false,
    merged: false,
    headSha: "abc123",
    comments: [
      {
        authorLogin: "bob",
        body: "Merged it",
        createdAt: Date.parse("2026-01-15T10:30:00Z"),
      },
    ],
    checks: { state: "success", passing: 3, total: 3, failing: 0 },
  };

  function renderDrawer(target: InboxItem = item) {
    const onClose = vi.fn();
    const onAction = vi.fn();
    renderWithQuery(<ItemDrawer item={target} onClose={onClose} onAction={onAction} />);
    return { onClose, onAction };
  }

  test("asks the server for the thread it was given", async () => {
    // The second item, so a drawer that always opens the first thread is
    // caught. The stub refuses any other id.
    const fetchMock = stubThread(threadPayload, secondItem.id);
    renderDrawer(secondItem);

    await screen.findByRole("dialog", { name: "Preview drawer" });
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/thread?id=n_002",
      expect.anything()
    );
  });

  test("shows the subject, the repository and the read state", async () => {
    stubThread(threadPayload);
    renderDrawer();

    const drawer = await screen.findByRole("dialog", { name: "Preview drawer" });
    expect(
      within(drawer).getByRole("link", { name: "Open source for Fix flaky login redirect" })
    ).toHaveAttribute("href", "https://github.com/acme/web/pull/1");
    expect(within(drawer).getByText("acme/web")).toBeInTheDocument();
    expect(within(drawer).getByText(/unread/)).toBeInTheDocument();
  });

  test("offers the triage actions", async () => {
    stubThread(threadPayload);
    renderDrawer();

    const drawer = await screen.findByRole("dialog", { name: "Preview drawer" });
    expect(within(drawer).getByRole("button", { name: "Done" })).toBeInTheDocument();
    expect(within(drawer).getByRole("button", { name: "Mark as read" })).toBeInTheDocument();
    expect(within(drawer).getByRole("button", { name: "Unsubscribe" })).toBeInTheDocument();
  });

  test("reports the triage action that was chosen", async () => {
    stubThread(threadPayload);
    const { onAction } = renderDrawer();

    const drawer = await screen.findByRole("dialog", { name: "Preview drawer" });
    fireEvent.click(within(drawer).getByRole("button", { name: "Done" }));

    expect(onAction).toHaveBeenCalledWith(item, "done");
  });

  test("marks an already read item as unread instead", async () => {
    stubThread(threadPayload);
    const { onAction } = renderDrawer({ ...item, isRead: 1 });

    const drawer = await screen.findByRole("dialog", { name: "Preview drawer" });
    fireEvent.click(within(drawer).getByRole("button", { name: "Mark as unread" }));

    expect(onAction).toHaveBeenCalledWith({ ...item, isRead: 1 }, "unread");
  });

  test("shows the thread body and its comments", async () => {
    stubThread(threadPayload);
    renderDrawer();

    const drawer = await screen.findByRole("dialog", { name: "Preview drawer" });
    expect(await within(drawer).findByText("Looks good to me")).toBeInTheDocument();
    expect(within(drawer).getByText("1 comment")).toBeInTheDocument();
    expect(within(drawer).getByText("Merged it")).toBeInTheDocument();
  });

  test("shows how many checks passed", async () => {
    stubThread(threadPayload);
    renderDrawer();

    const drawer = await screen.findByRole("dialog", { name: "Preview drawer" });
    expect(await within(drawer).findByText("3/3 checks passing")).toBeInTheDocument();
  });

  test("marks a merged pull request as merged", async () => {
    stubThread({ ...threadPayload, merged: true });
    renderDrawer();

    const drawer = await screen.findByRole("dialog", { name: "Preview drawer" });
    expect(await within(drawer).findByText("merged")).toBeInTheDocument();
  });

  test("falls back to GitHub when the thread has no preview", async () => {
    stubThread({ content: null, comments: [], checks: null, runs: [] });
    renderDrawer({ ...item, subjectType: "Release" });

    const drawer = await screen.findByRole("dialog", { name: "Preview drawer" });
    expect(await within(drawer).findByText("No preview for releases")).toBeInTheDocument();
    expect(
      within(drawer).getByRole("link", { name: "Open in new window" })
    ).toHaveAttribute("href", "https://github.com/acme/web/pull/1");
  });

  test("lists the workflow runs when the thread has no preview", async () => {
    stubThread({
      content: null,
      comments: [],
      checks: null,
      runs: [
        {
          name: "build",
          htmlUrl: "https://github.com/acme/web/actions/runs/1",
          conclusion: "success",
          branch: "main",
        },
      ],
    });
    renderDrawer({ ...item, subjectType: "CheckSuite" });

    const drawer = await screen.findByRole("dialog", { name: "Preview drawer" });
    expect(await within(drawer).findByText(/Latest/)).toBeInTheDocument();
    expect(within(drawer).getByText("build · main")).toBeInTheDocument();
    expect(
      within(drawer).getByRole("link", { name: /build/ })
    ).toHaveAttribute("href", "https://github.com/acme/web/actions/runs/1");
  });

  test("closes when the close button is used", async () => {
    stubThread(threadPayload);
    const { onClose } = renderDrawer();

    const drawer = await screen.findByRole("dialog", { name: "Preview drawer" });
    fireEvent.click(within(drawer).getByRole("button", { name: "Close details" }));

    expect(onClose).toHaveBeenCalled();
  });
});

describe("FilterSidebar", () => {
  function renderSidebar(overrides: Partial<ComponentProps<typeof FilterSidebar>> = {}) {
    const props = {
      types: typeFacets,
      activeType: "all",
      repos: repoFacets,
      activeRepo: "all",
      onType: vi.fn(),
      onRepo: vi.fn(),
      ...overrides,
    };
    render(<FilterSidebar {...props} />);
    return props;
  }

  test("lists the type facets with their counts", () => {
    renderSidebar();

    expect(screen.getByRole("button", { name: "Filter by Pull requests" })).toBeInTheDocument();
    expect(screen.getByText("4")).toBeInTheDocument();
    expect(screen.getByText("2")).toBeInTheDocument();
  });

  test("reports the type that was chosen", () => {
    const props = renderSidebar();

    fireEvent.click(screen.getByRole("button", { name: "Filter by Mention" }));

    expect(props.onType).toHaveBeenCalledWith("mention");
  });

  test("reports the reset when the active type is chosen again", () => {
    const props = renderSidebar({ activeType: "mention" });

    fireEvent.click(screen.getByRole("button", { name: "Filter by Mention" }));

    expect(props.onType).toHaveBeenCalledWith("all");
  });

  test("marks the active type as current", () => {
    renderSidebar({ activeType: "mention" });

    expect(screen.getByRole("button", { name: "Filter by Mention" })).toHaveAttribute(
      "aria-current",
      "true"
    );
    expect(screen.getByRole("button", { name: "Filter by Pull requests" })).not.toHaveAttribute(
      "aria-current"
    );
  });

  test("lists the repositories with their counts", () => {
    renderSidebar();

    expect(screen.getByRole("button", { name: "Filter by acme/web" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Show all repositories" })).toBeInTheDocument();
  });

  test("hides a repository that has no items at all", () => {
    renderSidebar();

    // A repository waiting for its digest is still listed, because its items
    // are only hidden until the digest is due. One with nothing in either
    // bucket is not worth a row.
    expect(screen.getByRole("button", { name: "Filter by acme/api" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Filter by acme/empty" })).not.toBeInTheDocument();
  });

  test("lists snoozed repositories in their own section", () => {
    renderSidebar();

    expect(
      screen.getByRole("button", { name: "Collapse snoozed repositories" })
    ).toBeInTheDocument();
    // The snoozed repo is no longer mixed into the main repository list.
    expect(screen.getByRole("button", { name: "Filter by acme/web" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Filter by acme/api" })).toBeInTheDocument();
  });

  test("collapses and expands the snoozed section", () => {
    renderSidebar();

    fireEvent.click(screen.getByRole("button", { name: "Collapse snoozed repositories" }));
    expect(screen.queryByRole("button", { name: "Filter by acme/api" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Filter by acme/web" })).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Expand snoozed repositories" }));
    expect(screen.getByRole("button", { name: "Filter by acme/api" })).toBeInTheDocument();
  });

  test("shows no snoozed section when nothing is snoozed", () => {
    renderSidebar({
      repos: [{ id: "acme--web", fullName: "acme/web", main: 3, quiet: 0, isSnoozed: false }],
    });

    expect(screen.queryByRole("button", { name: /snoozed repositories/ })).not.toBeInTheDocument();
  });

  test("opens the actions menu on right-click", () => {
    renderSidebar({ onSnooze: vi.fn() });

    fireEvent.contextMenu(screen.getByText("acme/web"));

    expect(
      screen.getByRole("menu", { name: "Actions for acme/web" })
    ).toBeInTheDocument();
    expect(screen.getByRole("menuitem", { name: /Snooze/ })).toBeInTheDocument();
  });

  test("offers Mark all as done with the pending total on right-click", () => {
    renderSidebar({ onSnooze: vi.fn(), onMarkAllDone: vi.fn() });

    fireEvent.contextMenu(screen.getByText("acme/web"));

    expect(
      screen.getByRole("menuitem", { name: "Mark all as done (4)" })
    ).toBeInTheDocument();
  });

  test("reports the repo when Mark all as done is chosen", () => {
    const onMarkAllDone = vi.fn();
    renderSidebar({ onSnooze: vi.fn(), onMarkAllDone });

    fireEvent.contextMenu(screen.getByText("acme/web"));
    fireEvent.click(screen.getByRole("menuitem", { name: /Mark all as done/ }));

    expect(onMarkAllDone).toHaveBeenCalledWith("acme--web");
  });

  test("offers Mark all as read above Snooze on right-click", () => {
    const onMarkAllRead = vi.fn();
    renderSidebar({ onSnooze: vi.fn(), onMarkAllDone: vi.fn(), onMarkAllRead });

    fireEvent.contextMenu(screen.getByText("acme/web"));

    const menu = screen.getByRole("menu", { name: "Actions for acme/web" });
    const entries = within(menu).getAllByRole("menuitem");
    expect(entries.map((el) => el.textContent)).toEqual([
      "Mark all as done (4)",
      "Mark all as read (4)",
      expect.stringMatching(/^Snooze/),
      "Open repo",
    ]);

    fireEvent.click(screen.getByRole("menuitem", { name: /Mark all as read/ }));
    expect(onMarkAllRead).toHaveBeenCalledWith("acme--web");
  });

  test("a preset click reports the repo and a future snooze time", () => {
    const onSnooze = vi.fn();
    renderSidebar({ onSnooze });
    const before = Date.now();

    fireEvent.contextMenu(screen.getByText("acme/web"));
    fireEvent.click(screen.getByRole("menuitem", { name: /^Snooze/ }));

    const submenu = screen.getByRole("menu", { name: "Snooze acme/web" });
    fireEvent.click(within(submenu).getByRole("menuitem", { name: /In 1 hour/ }));

    expect(onSnooze).toHaveBeenCalledTimes(1);
    const [id, at] = onSnooze.mock.calls[0]!;
    expect(id).toBe("acme--web");
    expect(at).toBeGreaterThanOrEqual(before + 3600 * 1000);
    expect(at).toBeLessThanOrEqual(Date.now() + 3600 * 1000);
  });

  test("reports the repository that was chosen", () => {
    const props = renderSidebar();

    fireEvent.click(screen.getByRole("button", { name: "Filter by acme/web" }));

    expect(props.onRepo).toHaveBeenCalledWith("acme--web");
  });

  test("collapses and expands the type section", () => {
    renderSidebar();

    fireEvent.click(screen.getByRole("button", { name: "Collapse type filters" }));
    expect(screen.queryByRole("button", { name: "Filter by Mention" })).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Expand type filters" }));
    expect(screen.getByRole("button", { name: "Filter by Mention" })).toBeInTheDocument();
  });
});

describe("BulkBar", () => {
  function renderBar(overrides: Partial<ComponentProps<typeof BulkBar>> = {}) {
    const props = {
      selectedCount: 2,
      busy: false,
      showHints: false,
      onAction: vi.fn(),
      onClear: vi.fn(),
      ...overrides,
    };
    render(<BulkBar {...props} />);
    return props;
  }

  test("asks for a selection when nothing is selected", () => {
    renderBar({ selectedCount: 0 });

    expect(screen.getByText("Select items to triage them in bulk")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Done" })).not.toBeInTheDocument();
  });

  test("shows the number of selected items and the bulk actions", () => {
    renderBar();

    expect(screen.getByText("2 selected")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Done" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Unsubscribe" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Mark as read" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Mark as unread" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Clear" })).toBeInTheDocument();
  });

  test("reports the bulk action that was chosen", () => {
    const props = renderBar();

    fireEvent.click(screen.getByRole("button", { name: "Unsubscribe" }));

    expect(props.onAction).toHaveBeenCalledWith("unsubscribe");
  });

  test("reports the request to clear the selection", () => {
    const props = renderBar();

    fireEvent.click(screen.getByRole("button", { name: "Clear" }));

    expect(props.onClear).toHaveBeenCalled();
  });

  test("disables the actions while a request is running", () => {
    renderBar({ busy: true });

    expect(screen.getByRole("button", { name: "Done" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Clear" })).toBeDisabled();
  });

  test("shows the keyboard hints when they are enabled", () => {
    renderBar({ showHints: true });

    expect(screen.getByText("D")).toBeInTheDocument();
    expect(screen.getByText("⇧U")).toBeInTheDocument();
    expect(screen.getByText("R")).toBeInTheDocument();
    expect(screen.getByText("U")).toBeInTheDocument();
    expect(screen.getByText("Esc")).toBeInTheDocument();
  });
});

describe("DigestSection", () => {
  const groups: DigestGroup[] = [
    {
      repositoryId: "acme--api",
      repositoryName: "acme/api",
      rhythm: "weekly",
      nextDueAt: Date.parse("2026-01-22T09:00:00Z"),
      nextDueLabel: "in 7 days",
      pendingCount: 2,
      isSnoozed: false,
      snoozeLabel: "Not snoozed",
    },
  ];

  test("shows the pending total and the quiet repositories", () => {
    render(<DigestSection groups={groups} />);

    expect(screen.getByText("Quiet until due (2 pending)")).toBeInTheDocument();
    expect(screen.getByText("acme/api")).toBeInTheDocument();
    expect(screen.getByText("weekly")).toBeInTheDocument();
    expect(screen.getByText("due in 7 days")).toBeInTheDocument();
  });

  test("explains the digest once the group is expanded", () => {
    render(<DigestSection groups={groups} />);

    expect(screen.queryByText(/New items stay here/)).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /acme\/api/ }));

    expect(screen.getByText(/New items stay here/)).toBeInTheDocument();
  });

  test("says nothing when there is no quiet repository", () => {
    const { container } = render(<DigestSection groups={[]} />);

    expect(container).toBeEmptyDOMElement();
  });

  test("opens the actions menu on right-click", () => {
    render(<DigestSection groups={groups} onSnooze={vi.fn()} />);

    fireEvent.contextMenu(screen.getByText("acme/api"));

    expect(
      screen.getByRole("menu", { name: "Actions for acme/api" })
    ).toBeInTheDocument();
  });

  test("offers Mark all as done for the quiet repository", () => {
    const onMarkAllDone = vi.fn();
    render(
      <DigestSection groups={groups} onSnooze={vi.fn()} onMarkAllDone={onMarkAllDone} />
    );

    fireEvent.contextMenu(screen.getByText("acme/api"));
    expect(
      screen.getByRole("menuitem", { name: "Mark all as done (2)" })
    ).toBeInTheDocument();

    fireEvent.click(screen.getByRole("menuitem", { name: /Mark all as done/ }));
    expect(onMarkAllDone).toHaveBeenCalledWith("acme--api");
  });

  test("offers Mark all as read above Snooze for the quiet repository", () => {
    const onMarkAllRead = vi.fn();
    render(
      <DigestSection
        groups={groups}
        onSnooze={vi.fn()}
        onMarkAllDone={vi.fn()}
        onMarkAllRead={onMarkAllRead}
      />
    );

    fireEvent.contextMenu(screen.getByText("acme/api"));
    const menu = screen.getByRole("menu", { name: "Actions for acme/api" });
    const entries = within(menu).getAllByRole("menuitem");
    expect(entries.map((el) => el.textContent)).toEqual([
      "Mark all as done (2)",
      "Mark all as read (2)",
      expect.stringMatching(/^Snooze/),
      "Open repo",
    ]);

    fireEvent.click(screen.getByRole("menuitem", { name: /Mark all as read/ }));
    expect(onMarkAllRead).toHaveBeenCalledWith("acme--api");
  });
});

describe("RepoSnoozeMenu", () => {
  function renderSnoozeMenu(overrides: Partial<ComponentProps<typeof RepoSnoozeMenu>> = {}) {
    const props = {
      repoId: "acme--web",
      fullName: "acme/web",
      isSnoozed: false,
      onSnooze: vi.fn(),
      ...overrides,
    };
    render(<RepoSnoozeMenu {...props} />);
    return props;
  }

  test("opens the menu from the trigger and lists Snooze", () => {
    renderSnoozeMenu();

    fireEvent.click(screen.getByRole("button", { name: "Actions for acme/web" }));

    expect(screen.getByRole("menu", { name: "Actions for acme/web" })).toBeInTheDocument();
    expect(screen.getByRole("menuitem", { name: /^Snooze/ })).toBeInTheDocument();
  });

  test("lists Mark all as done when the handler is given", () => {
    renderSnoozeMenu({ onMarkAllDone: vi.fn(), markAllDoneCount: 4 });

    fireEvent.click(screen.getByRole("button", { name: "Actions for acme/web" }));

    expect(
      screen.getByRole("menuitem", { name: "Mark all as done (4)" })
    ).toBeInTheDocument();
  });

  test("hides Mark all as done without the handler", () => {
    renderSnoozeMenu();

    fireEvent.click(screen.getByRole("button", { name: "Actions for acme/web" }));

    expect(
      screen.queryByRole("menuitem", { name: /Mark all as done/ })
    ).not.toBeInTheDocument();
  });

  test("reports the repo when Mark all as done is chosen", () => {
    const onMarkAllDone = vi.fn();
    renderSnoozeMenu({ onMarkAllDone, markAllDoneCount: 3 });

    fireEvent.click(screen.getByRole("button", { name: "Actions for acme/web" }));
    fireEvent.click(screen.getByRole("menuitem", { name: /Mark all as done/ }));

    expect(onMarkAllDone).toHaveBeenCalledWith("acme--web");
    expect(screen.queryByRole("menu")).not.toBeInTheDocument();
  });

  test("disables Mark all as done with nothing pending", () => {
    renderSnoozeMenu({
      onMarkAllDone: vi.fn(),
      markAllDoneCount: 0,
      markAllDoneDisabled: true,
    });

    fireEvent.click(screen.getByRole("button", { name: "Actions for acme/web" }));

    expect(
      screen.getByRole("menuitem", { name: /Mark all as done/ })
    ).toBeDisabled();
  });

  test("lists Mark all as done above Snooze and focuses it first", () => {
    renderSnoozeMenu({ onMarkAllDone: vi.fn(), markAllDoneCount: 4 });

    fireEvent.click(screen.getByRole("button", { name: "Actions for acme/web" }));

    const menu = screen.getByRole("menu", { name: "Actions for acme/web" });
    const entries = within(menu).getAllByRole("menuitem");
    expect(entries[0]).toHaveTextContent(/Mark all as done/);
    expect(entries[1]).toHaveTextContent(/^Snooze/);
    expect(entries[0]).toHaveFocus();
  });

  test("lists Mark all as read above Snooze and reports the repo", () => {
    const onMarkAllRead = vi.fn();
    renderSnoozeMenu({
      onMarkAllDone: vi.fn(),
      markAllDoneCount: 4,
      onMarkAllRead,
      markAllReadCount: 4,
    });

    fireEvent.click(screen.getByRole("button", { name: "Actions for acme/web" }));

    const menu = screen.getByRole("menu", { name: "Actions for acme/web" });
    const entries = within(menu).getAllByRole("menuitem");
    expect(entries.map((el) => el.textContent)).toEqual([
      "Mark all as done (4)",
      "Mark all as read (4)",
      expect.stringMatching(/^Snooze/),
      "Open repo",
    ]);

    fireEvent.click(screen.getByRole("menuitem", { name: /Mark all as read/ }));
    expect(onMarkAllRead).toHaveBeenCalledWith("acme--web");
    expect(screen.queryByRole("menu")).not.toBeInTheDocument();
  });

  test("hides Mark all as read without the handler", () => {
    renderSnoozeMenu({ onMarkAllDone: vi.fn() });

    fireEvent.click(screen.getByRole("button", { name: "Actions for acme/web" }));

    expect(
      screen.queryByRole("menuitem", { name: /Mark all as read/ })
    ).not.toBeInTheDocument();
  });

  test("opening the Snooze submenu does not steal focus from Snooze", () => {
    renderSnoozeMenu({ onMarkAllDone: vi.fn(), markAllDoneCount: 4 });

    fireEvent.click(screen.getByRole("button", { name: "Actions for acme/web" }));
    const snooze = screen.getByRole("menuitem", { name: /^Snooze/ });
    snooze.focus();
    fireEvent.mouseEnter(snooze);

    expect(screen.getByRole("menu", { name: "Snooze acme/web" })).toBeInTheDocument();
    expect(snooze).toHaveFocus();
  });

  test("focuses the first enabled entry when the done entry is disabled", () => {
    renderSnoozeMenu({
      onMarkAllDone: vi.fn(),
      markAllDoneCount: 0,
      markAllDoneDisabled: true,
    });

    fireEvent.click(screen.getByRole("button", { name: "Actions for acme/web" }));

    expect(screen.getByRole("menuitem", { name: /^Snooze/ })).toHaveFocus();
  });

  test("arrow keys skip disabled entries", () => {
    renderSnoozeMenu({
      onMarkAllDone: vi.fn(),
      markAllDoneCount: 0,
      markAllDoneDisabled: true,
      onMarkAllRead: vi.fn(),
      markAllReadCount: 0,
      markAllReadDisabled: true,
    });

    fireEvent.click(screen.getByRole("button", { name: "Actions for acme/web" }));
    const menu = screen.getByRole("menu", { name: "Actions for acme/web" });
    const openRepo = within(menu).getByRole("menuitem", { name: "Open repo" });
    openRepo.focus();
    fireEvent.keyDown(openRepo, { key: "ArrowDown" });

    expect(within(menu).getByRole("menuitem", { name: /^Snooze/ })).toHaveFocus();

    const snooze = within(menu).getByRole("menuitem", { name: /^Snooze/ });
    fireEvent.keyDown(snooze, { key: "ArrowUp" });

    expect(within(menu).getByRole("menuitem", { name: "Open repo" })).toHaveFocus();
  });

  test("opens the repository root in a new window", () => {
    const openSpy = vi.spyOn(window, "open").mockReturnValue(null);
    renderSnoozeMenu();
    try {
      fireEvent.click(screen.getByRole("button", { name: "Actions for acme/web" }));
      fireEvent.click(screen.getByRole("menuitem", { name: "Open repo" }));

      expect(openSpy).toHaveBeenCalledWith(
        "https://github.com/acme/web",
        "_blank",
        "noopener"
      );
      expect(screen.queryByRole("menu")).not.toBeInTheDocument();
    } finally {
      openSpy.mockRestore();
    }
  });

  test("opens the given repository URL when provided", () => {
    const openSpy = vi.spyOn(window, "open").mockReturnValue(null);
    renderSnoozeMenu({ repoUrl: "https://ghe.example.com/acme/web" });
    try {
      fireEvent.click(screen.getByRole("button", { name: "Actions for acme/web" }));
      fireEvent.click(screen.getByRole("menuitem", { name: "Open repo" }));

      expect(openSpy).toHaveBeenCalledWith(
        "https://ghe.example.com/acme/web",
        "_blank",
        "noopener"
      );
    } finally {
      openSpy.mockRestore();
    }
  });

  test("a preset reports the repo and a future time", () => {
    const onSnooze = vi.fn();
    renderSnoozeMenu({ onSnooze });
    const before = Date.now();

    fireEvent.click(screen.getByRole("button", { name: "Actions for acme/web" }));
    fireEvent.click(screen.getByRole("menuitem", { name: /^Snooze/ }));
    const submenu = screen.getByRole("menu", { name: "Snooze acme/web" });
    fireEvent.click(within(submenu).getByRole("menuitem", { name: /Next week/ }));

    expect(onSnooze).toHaveBeenCalledTimes(1);
    const [id, at] = onSnooze.mock.calls[0]!;
    expect(id).toBe("acme--web");
    expect(at).toBeGreaterThan(before);
  });

  test("offers unsnooze for a snoozed repo", () => {
    const props = renderSnoozeMenu({ isSnoozed: true });

    fireEvent.click(screen.getByRole("button", { name: "Actions for acme/web" }));
    fireEvent.click(screen.getByRole("menuitem", { name: /^Snooze/ }));
    fireEvent.click(screen.getByRole("menuitem", { name: "Unsnooze" }));

    expect(props.onSnooze).toHaveBeenCalledWith("acme--web", null);
  });

  test("Escape steps out of the submenu then the menu", () => {
    renderSnoozeMenu();

    fireEvent.click(screen.getByRole("button", { name: "Actions for acme/web" }));
    fireEvent.click(screen.getByRole("menuitem", { name: /^Snooze/ }));
    expect(screen.getByRole("menu", { name: "Snooze acme/web" })).toBeInTheDocument();

    fireEvent.keyDown(document, { key: "Escape" });
    expect(screen.queryByRole("menu", { name: "Snooze acme/web" })).not.toBeInTheDocument();
    expect(screen.getByRole("menu", { name: "Actions for acme/web" })).toBeInTheDocument();

    fireEvent.keyDown(document, { key: "Escape" });
    expect(screen.queryByRole("menu")).not.toBeInTheDocument();
  });

  test("arrow keys move between menu and submenu", async () => {
    renderSnoozeMenu();

    fireEvent.click(screen.getByRole("button", { name: "Actions for acme/web" }));
    fireEvent.keyDown(screen.getByRole("menuitem", { name: /^Snooze/ }), { key: "ArrowRight" });

    const submenu = screen.getByRole("menu", { name: "Snooze acme/web" });
    const presets = within(submenu).getAllByRole("menuitem");
    await waitFor(() => expect(presets[0]).toHaveFocus());
    fireEvent.keyDown(presets[0]!, { key: "ArrowDown" });
    expect(presets[1]).toHaveFocus();
    fireEvent.keyDown(presets[1]!, { key: "ArrowLeft" });
    expect(screen.queryByRole("menu", { name: "Snooze acme/web" })).not.toBeInTheDocument();
  });

  test("clicking the trigger again closes the menu", () => {
    renderSnoozeMenu();

    const trigger = screen.getByRole("button", { name: "Actions for acme/web" });
    fireEvent.click(trigger);
    expect(screen.getByRole("menu")).toBeInTheDocument();

    fireEvent.click(trigger);
    expect(screen.queryByRole("menu")).not.toBeInTheDocument();
  });

  test("reveals the trigger on row hover", () => {
    render(
      <FilterSidebar
        types={[{ value: "all", label: "All", count: 1 }]}
        activeType="all"
        repos={[{ id: "acme--web", fullName: "acme/web", main: 1, quiet: 0, isSnoozed: false }]}
        activeRepo="all"
        onType={vi.fn()}
        onRepo={vi.fn()}
        onSnooze={vi.fn()}
      />
    );

    const trigger = screen.getByRole("button", { name: "Actions for acme/web" });
    expect(trigger).toHaveStyle({ opacity: "0" });

    fireEvent.mouseEnter(screen.getByText("acme/web"));
    expect(trigger).toHaveStyle({ opacity: "1" });
  });
});

describe("RepoRow", () => {
  const repo: RepoRowData = {
    id: "acme--web",
    fullName: "acme/web",
    ownership: "owned",
    rhythm: "immediate",
    nextDueLabel: "Not scheduled",
    pendingCount: 3,
    unreachable: false,
    snoozedUntil: null,
    isSnoozed: false,
    snoozeLabel: "Not snoozed",
  };

  function renderRow(overrides: Partial<RepoRowData> = {}) {
    const props = {
      repo: { ...repo, ...overrides },
      onRhythm: vi.fn(),
      onSnooze: vi.fn(),
      busy: false,
    };
    render(<RepoRow {...props} />);
    return props;
  }

  test("shows the repository, its ownership and the pending count", () => {
    renderRow();

    expect(screen.getByText("acme/web")).toBeInTheDocument();
    expect(screen.getByText("owned")).toBeInTheDocument();
    expect(screen.getByText("3 pending")).toBeInTheDocument();
    expect(screen.getByText(/Next digest Not scheduled/)).toBeInTheDocument();
  });

  test("reports a new digest rhythm", () => {
    const props = renderRow();

    fireEvent.change(screen.getByRole("combobox", { name: "Digest rhythm for acme/web" }), {
      target: { value: "weekly" },
    });

    expect(props.onRhythm).toHaveBeenCalledWith("acme--web", "weekly");
  });

  test("reports a snooze preset", () => {
    const before = Date.now();
    const props = renderRow();

    fireEvent.change(screen.getByRole("combobox", { name: "Snooze acme/web" }), {
      target: { value: "1h" },
    });

    expect(props.onSnooze).toHaveBeenCalledTimes(1);
    const [id, at] = props.onSnooze.mock.calls[0]!;
    expect(id).toBe("acme--web");
    expect(at).toBeGreaterThanOrEqual(before + 3600 * 1000);
    expect(at).toBeLessThanOrEqual(Date.now() + 3600 * 1000);
  });

  test("reports the end of a snooze", () => {
    const props = renderRow({ isSnoozed: true, snoozeLabel: "Tomorrow 09:00" });

    fireEvent.change(screen.getByRole("combobox", { name: "Snooze acme/web" }), {
      target: { value: "off" },
    });

    expect(props.onSnooze).toHaveBeenCalledWith("acme--web", null);
  });

  test("takes a custom snooze time", () => {
    const props = renderRow();

    fireEvent.change(screen.getByRole("combobox", { name: "Snooze acme/web" }), {
      target: { value: "custom" },
    });

    const input = screen.getByLabelText("Custom snooze time for acme/web");
    fireEvent.change(input, { target: { value: "2030-01-01T09:00" } });
    fireEvent.click(screen.getByRole("button", { name: "Snooze" }));

    expect(props.onSnooze).toHaveBeenCalledWith("acme--web", Date.parse("2030-01-01T09:00:00Z"));
  });

  test("shows a snoozed repository as snoozed", () => {
    renderRow({ isSnoozed: true, snoozeLabel: "Tomorrow 09:00" });

    expect(screen.getByRole("combobox", { name: "Snooze acme/web" })).toHaveValue("snoozed");
    expect(
      screen.getByRole("option", { name: "Snoozed until Tomorrow 09:00" })
    ).toBeInTheDocument();
  });

  test("marks an unreachable repository", () => {
    renderRow({ unreachable: true });

    expect(screen.getByText("Unreachable")).toBeInTheDocument();
    expect(screen.getByText(/GitHub no longer returns this repository/)).toBeInTheDocument();
  });
});

describe("ShortcutsHelp", () => {
  test("lists the shortcuts in a dialog", () => {
    render(<ShortcutsHelp onClose={vi.fn()} />);

    const dialog = screen.getByRole("dialog", { name: "Keyboard shortcuts" });
    expect(within(dialog).getByRole("heading", { name: "Keyboard shortcuts" })).toBeInTheDocument();
    expect(within(dialog).getByText("j / k")).toBeInTheDocument();
    expect(within(dialog).getByText(/Move focus between rows/)).toBeInTheDocument();
    expect(within(dialog).getByText(/Jump to the previous \/ next thread/)).toBeInTheDocument();
    expect(within(dialog).getByText(/First Esc clears the search/)).toBeInTheDocument();
  });

  test("closes when the backdrop is clicked", () => {
    const onClose = vi.fn();
    render(<ShortcutsHelp onClose={onClose} />);

    fireEvent.click(screen.getByRole("dialog", { name: "Keyboard shortcuts" }));

    expect(onClose).toHaveBeenCalled();
  });

  test("stays open when the content is clicked", () => {
    const onClose = vi.fn();
    render(<ShortcutsHelp onClose={onClose} />);

    fireEvent.click(screen.getByText(/Move focus between rows/));

    expect(onClose).not.toHaveBeenCalled();
  });

  test("groups shortcuts and shows the match count", () => {
    render(<ShortcutsHelp onClose={vi.fn()} />);

    const dialog = screen.getByRole("dialog", { name: "Keyboard shortcuts" });
    expect(within(dialog).getByText("Navigate")).toBeInTheDocument();
    expect(within(dialog).getByText("Triage")).toBeInTheDocument();
    expect(within(dialog).getByText("App")).toBeInTheDocument();
    expect(within(dialog).getByText(/of \d+/)).toBeInTheDocument();
  });

  test("filters the list as the user types", () => {
    render(<ShortcutsHelp onClose={vi.fn()} />);

    fireEvent.change(screen.getByLabelText("Search keyboard shortcuts"), {
      target: { value: "sidebar" },
    });

    expect(screen.getByText("Cmd+B")).toBeInTheDocument();
    expect(screen.queryByText("j / k")).not.toBeInTheDocument();
  });

  test("shows an empty state when nothing matches and clears the search", () => {
    render(<ShortcutsHelp onClose={vi.fn()} />);

    fireEvent.change(screen.getByLabelText("Search keyboard shortcuts"), {
      target: { value: "zzz-no-match" },
    });

    expect(screen.getByRole("status")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Clear search" }));

    expect(screen.getByLabelText("Search keyboard shortcuts")).toHaveValue("");
    expect(screen.getByText("j / k")).toBeInTheDocument();
  });

  test("Escape clears the query first and closes on a second press", () => {
    const onClose = vi.fn();
    render(<ShortcutsHelp onClose={onClose} />);
    const input = screen.getByLabelText("Search keyboard shortcuts");

    fireEvent.change(input, { target: { value: "theme" } });
    fireEvent.keyDown(input, { key: "Escape" });
    expect(onClose).not.toHaveBeenCalled();
    expect(input).toHaveValue("");

    fireEvent.keyDown(input, { key: "Escape" });
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});

describe("repositories screen", () => {
  const payload = {
    repositories: [
      {
        id: "acme--web",
        fullName: "acme/web",
        ownership: "owned",
        rhythm: "immediate",
        lastPromotedAt: null,
        nextDueAt: null,
        nextDueLabel: "Not scheduled",
        pendingCount: 3,
        isDue: true,
        unreachable: false,
        snoozedUntil: null,
        isSnoozed: false,
        snoozeLabel: "Not snoozed",
      },
      {
        id: "acme--api",
        fullName: "acme/api",
        ownership: "watched",
        rhythm: "weekly",
        lastPromotedAt: null,
        nextDueAt: null,
        nextDueLabel: "in 7 days",
        pendingCount: 1,
        isDue: false,
        unreachable: false,
        snoozedUntil: null,
        isSnoozed: false,
        snoozeLabel: "Not snoozed",
      },
    ],
  };

  function stubRepositories(body: unknown) {
    const fetchMock =
      vi.fn<(input: RequestInfo | URL, init?: RequestInit) => Promise<Response>>(
        async () => Response.json(body)
      );
    vi.stubGlobal("fetch", fetchMock);
    return fetchMock;
  }

  test("loads the repositories and renders a row for each", async () => {
    stubRepositories(payload);

    renderWithQuery(<ReposPage />);

    expect(await screen.findByText("acme/web")).toBeInTheDocument();
    expect(screen.getByText("acme/api")).toBeInTheDocument();
    expect(screen.getByText("2 of 2")).toBeInTheDocument();
  });

  test("filters the repositories by name", async () => {
    stubRepositories(payload);
    renderWithQuery(<ReposPage />);
    await screen.findByText("acme/web");

    fireEvent.change(screen.getByLabelText("Filter repositories by name"), {
      target: { value: "api" },
    });

    expect(screen.getByText("1 of 2")).toBeInTheDocument();
    expect(screen.queryByText("acme/web")).not.toBeInTheDocument();
  });

  test("says when nothing matches the filter", async () => {
    stubRepositories(payload);
    renderWithQuery(<ReposPage />);
    await screen.findByText("acme/web");

    fireEvent.change(screen.getByLabelText("Filter repositories by name"), {
      target: { value: "nothing" },
    });

    expect(screen.getByText(/No repositories match/)).toBeInTheDocument();
  });

  test("changing the rhythm patches the repository", async () => {
    const fetchMock = stubRepositories(payload);
    renderWithQuery(<ReposPage />);
    await screen.findByText("acme/web");

    fireEvent.change(screen.getByRole("combobox", { name: "Digest rhythm for acme/web" }), {
      target: { value: "weekly" },
    });

    await waitFor(() => {
      const patch = fetchMock.mock.calls.find(
        ([input, init]) =>
          String(input) === "/api/repositories/acme--web" && init?.method === "PATCH"
      );
      expect(patch).toBeDefined();
      expect(JSON.parse(String(patch?.[1]?.body))).toEqual({ rhythm: "weekly" });
    });
  });
});

describe("rate limits screen", () => {
  const payload = {
    provider: "github",
    fetchedAt: "2026-01-15T10:00:00.000Z",
    usage: {
      core: {
        used: 100,
        limit: 5000,
        remaining: 4900,
        percent: 2,
        resetsAt: "2026-01-15T11:00:00.000Z",
        resetsInSecs: 3600,
        status: "ok",
      },
      graphql: {
        used: 4000,
        limit: 5000,
        remaining: 1000,
        percent: 80,
        resetsAt: null,
        resetsInSecs: 120,
        status: "ok",
      },
    },
    warnings: { search: "no rate-limit headers on HTTP 200" },
  };

  function stubRateLimits(body: unknown, ok = true) {
    const fetchMock = vi.fn(async () =>
      ok ? Response.json(body) : new Response(JSON.stringify(body), { status: 502 })
    );
    vi.stubGlobal("fetch", fetchMock);
    return fetchMock;
  }

  test("shows the usage of every bucket", async () => {
    stubRateLimits(payload);

    renderWithQuery(<RateLimitsPage />);

    expect(await screen.findByText("Core (REST)")).toBeInTheDocument();
    expect(screen.getByText("GraphQL")).toBeInTheDocument();
    expect(screen.getByLabelText("2% used")).toBeInTheDocument();
    expect(screen.getByLabelText("80% used")).toBeInTheDocument();
    expect(screen.getByText(/100 \/ 5,000 used/)).toBeInTheDocument();
    expect(screen.getByRole("progressbar", { name: "Core (REST) usage" })).toHaveAttribute(
      "aria-valuenow",
      "2"
    );
  });

  test("warns about a bucket it could not read", async () => {
    stubRateLimits(payload);

    renderWithQuery(<RateLimitsPage />);

    expect(await screen.findByText("no rate-limit headers on HTTP 200")).toBeInTheDocument();
  });

  test("shows the error state when the buckets cannot be read", async () => {
    stubRateLimits({ error: "GitHub API probes failed", reason: "unreachable" }, false);

    renderWithQuery(<RateLimitsPage />);

    // The rate limits have their own error state.
    expect(await screen.findByText("Rate limits failed to load")).toBeInTheDocument();
    expect(await screen.findByText("GitHub API probes failed")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Retry" })).toBeInTheDocument();
  });
});
