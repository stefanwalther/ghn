import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { cleanup, fireEvent, screen, waitFor, within } from "@testing-library/react";
import { renderWithQuery } from "./support/render-with-query";
import { resetUIStore } from "@/lib/ui-store";
import InboxPage from "@/app/page";
import { AppShell } from "@/components/app-shell";
import type { InboxItem } from "@/components/inbox/notification-list";

/**
 * The inbox screen reads the route and writes filters back to it.
 *
 * `useSearchParams` returns the query the screen is currently on, and
 * `useRouter().replace` is how a filter change reaches the URL bar.
 */
const nav = vi.hoisted(() => ({
  replace: vi.fn(),
  push: vi.fn(),
  back: vi.fn(),
  params: new URLSearchParams(""),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: nav.replace, push: nav.push, back: nav.back }),
  useSearchParams: () => nav.params,
  usePathname: () => "/",
}));

const firstItem: InboxItem = {
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

const notificationsPayload = {
  lastSyncAt: null,
  stale: false,
  mainFlow: [firstItem, secondItem],
  collapsedSection: [],
  facets: {
    types: [{ value: "pull_request", label: "Pull requests", count: 1 }],
    repos: [
      { id: "acme--web", fullName: "acme/web", main: 1, quiet: 0, isSnoozed: false },
      { id: "acme--api", fullName: "acme/api", main: 1, quiet: 0, isSnoozed: false },
    ],
  },
};

const digestPayload = {
  ...notificationsPayload,
  collapsedSection: [
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
  ],
};

interface StubOptions {
  notifications?: unknown;
  connection?: unknown;
  thread?: unknown;
  /** Fail the first notifications read, then behave normally. */
  failFirstNotifications?: boolean;
}

type FetchMock = ReturnType<typeof installFetch>;

/** Routes every request the inbox screen makes to a canned response. */
function installFetch(options: StubOptions = {}) {
  let failNext = options.failFirstNotifications === true;
  const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    void init;
    const url = String(input);
    if (url.includes("/api/notifications/bulk")) {
      return Response.json({ updated: 1, action: "done" });
    }
    if (url.includes("/api/notifications")) {
      if (failNext) {
        failNext = false;
        throw new Error("network unavailable");
      }
      return Response.json(options.notifications ?? notificationsPayload);
    }
    if (url.includes("/api/connection")) {
      return Response.json(options.connection ?? { connected: true });
    }
    // The sync endpoint has to be matched before the thread one, because
    // "/api/thread/sync" also contains "/api/thread".
    if (url.includes("/api/thread/sync")) {
      return Response.json({ id: "n_002", item: { subject: "Bump the linter" } });
    }
    if (url.includes("/api/thread")) {
      return Response.json(
        options.thread ?? { content: null, comments: [], checks: null, runs: [] }
      );
    }
    if (url.includes("/api/sync")) {
      return Response.json({ fresh: true, pollIntervalSecs: 60, lastSyncAt: Date.now() });
    }
    return Response.json({});
  });
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

/** The recorded calls whose first argument is exactly this url. */
function callsTo(fetchMock: FetchMock, url: string) {
  return fetchMock.mock.calls.filter(([input]) => String(input) === url);
}

describe("inbox screen", () => {
  beforeEach(() => {
    nav.params = new URLSearchParams("");
    localStorage.clear();
    sessionStorage.clear();
    resetUIStore();
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  test("loads the notification list from the API and renders it", async () => {
    const fetchMock = installFetch();

    renderWithQuery(<InboxPage />);

    const list = within(await screen.findByRole("listbox"));
    expect(list.getByText("Fix flaky login redirect")).toBeInTheDocument();
    expect(list.getByText("Bump the linter")).toBeInTheDocument();
    expect(list.getByText("acme/web")).toBeInTheDocument();
    expect(screen.getByText("2 items")).toBeInTheDocument();

    expect(callsTo(fetchMock, "/api/notifications")).toHaveLength(1);
    expect(callsTo(fetchMock, "/api/notifications")[0]?.[0]).toBe("/api/notifications");
  });

  test("shows the empty state when the inbox has no items", async () => {
    installFetch({ notifications: { ...notificationsPayload, mainFlow: [] } });

    renderWithQuery(<InboxPage />);

    expect(await screen.findByText("All caught up")).toBeInTheDocument();
    expect(screen.queryByText("Fix flaky login redirect")).not.toBeInTheDocument();
  });

  test("shows the error state and recovers when the retry succeeds", async () => {
    const fetchMock = installFetch({ failFirstNotifications: true });

    renderWithQuery(<InboxPage />);

    expect(await screen.findByText("Inbox failed to load")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Retry" }));

    expect(await screen.findByText("Fix flaky login redirect")).toBeInTheDocument();
    expect(callsTo(fetchMock, "/api/notifications")).toHaveLength(2);
  });

  test("a type filter change replaces the route with the matching query string", async () => {
    installFetch();
    renderWithQuery(<InboxPage />);
    await screen.findByText("Fix flaky login redirect");

    fireEvent.click(screen.getByRole("button", { name: "Filter by Pull requests" }));

    expect(nav.replace).toHaveBeenCalledWith("/?type=pull_request", { scroll: false });
  });

  test("an age filter change replaces the route with the matching query string", async () => {
    installFetch();
    renderWithQuery(<InboxPage />);
    await screen.findByText("Fix flaky login redirect");

    fireEvent.change(screen.getByLabelText("Filter by age"), { target: { value: "7d" } });

    expect(nav.replace).toHaveBeenCalledWith("/?age=7d", { scroll: false });
  });

  test("a repository filter change replaces the route with the matching query string", async () => {
    installFetch();
    renderWithQuery(<InboxPage />);
    await screen.findByText("Fix flaky login redirect");

    fireEvent.click(screen.getByRole("button", { name: "Filter by acme/api" }));

    expect(nav.replace).toHaveBeenCalledWith("/?repo=acme--api", { scroll: false });
  });

  test("snoozing a repo from the sidebar patches the repository", async () => {
    const fetchMock = installFetch();
    renderWithQuery(<InboxPage />);
    await screen.findByText("Fix flaky login redirect");

    fireEvent.click(screen.getByRole("button", { name: "Actions for acme/web" }));
    fireEvent.click(screen.getByRole("menuitem", { name: /^Snooze/ }));
    const submenu = screen.getByRole("menu", { name: "Snooze acme/web" });
    fireEvent.click(within(submenu).getByRole("menuitem", { name: /In 1 hour/ }));

    await waitFor(() => {
      expect(callsTo(fetchMock, "/api/repositories/acme--web")).toHaveLength(1);
    });
    const [, init] = callsTo(fetchMock, "/api/repositories/acme--web")[0]!;
    expect(init?.method).toBe("PATCH");
    const body = JSON.parse(String(init?.body)) as { snoozedUntil?: unknown };
    expect(typeof body.snoozedUntil).toBe("number");
    expect(body.snoozedUntil as number).toBeGreaterThan(Date.now());
  });

  test("Escape closes the drawer", async () => {
    installFetch();
    renderWithQuery(<InboxPage />);
    await screen.findByText("Fix flaky login redirect");

    fireEvent.click(screen.getByText("Fix flaky login redirect"));
    expect(await screen.findByRole("dialog", { name: "Preview drawer" })).toBeInTheDocument();

    fireEvent.keyDown(window, { key: "Escape" });

    await waitFor(() => {
      expect(screen.queryByRole("dialog", { name: "Preview drawer" })).not.toBeInTheDocument();
    });
  });

  test("a bulk action posts the selected ids and the action to the bulk endpoint", async () => {
    const fetchMock = installFetch();
    renderWithQuery(<InboxPage />);
    await screen.findByText("Fix flaky login redirect");

    fireEvent.click(screen.getByRole("checkbox", { name: "Select all visible" }));
    expect(await screen.findByText("2 selected")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Done" }));

    await waitFor(() => {
      expect(callsTo(fetchMock, "/api/notifications/bulk")).toHaveLength(1);
    });
    const [url, init] = callsTo(fetchMock, "/api/notifications/bulk")[0]!;
    expect(String(url)).toBe("/api/notifications/bulk");
    expect(init?.method).toBe("POST");
    expect(JSON.parse(String(init?.body))).toEqual({
      ids: ["n_001", "n_002"],
      action: "done",
    });

    // The optimistic update is followed by a reload of the list.
    await waitFor(() => {
      expect(callsTo(fetchMock, "/api/notifications")).toHaveLength(2);
    });
  });

  test("a bulk done updates the sidebar counts before the server answers", async () => {
    const releaseItems: InboxItem[] = [
      {
        ...firstItem,
        id: "n_101",
        repositoryId: "acme--web",
        repositoryName: "acme/web",
        subject: "Release v2.0 ships",
        subjectType: "Release",
        subjectState: "open",
        reason: "release",
      },
      {
        ...firstItem,
        id: "n_102",
        repositoryId: "acme--api",
        repositoryName: "acme/api",
        subject: "Release v2.1 ships",
        subjectType: "Release",
        subjectState: "open",
        reason: "release",
      },
    ];
    const releaseFacets = {
      types: [
        { value: "all", label: "All", count: 2 },
        { value: "release", label: "Release", count: 2 },
      ],
      repos: [
        { id: "acme--web", fullName: "acme/web", main: 1, quiet: 0, isSnoozed: false },
        { id: "acme--api", fullName: "acme/api", main: 1, quiet: 0, isSnoozed: false },
      ],
    };
    const releasePayload = {
      lastSyncAt: null,
      stale: false,
      mainFlow: releaseItems,
      collapsedSection: [],
      facets: releaseFacets,
    };
    const emptiedPayload = {
      lastSyncAt: null,
      stale: false,
      mainFlow: [],
      collapsedSection: [],
      facets: {
        types: [
          { value: "all", label: "All", count: 0 },
          { value: "release", label: "Release", count: 0 },
        ],
        repos: [
          { id: "acme--web", fullName: "acme/web", main: 0, quiet: 0, isSnoozed: false },
          { id: "acme--api", fullName: "acme/api", main: 0, quiet: 0, isSnoozed: false },
        ],
      },
    };
    let notifCalls = 0;
    let resolveBulk: (value: Response) => void = () => {};
    const bulkGate = new Promise<Response>((resolve) => {
      resolveBulk = resolve;
    });
    const gatedFetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      void init;
      const url = String(input);
      if (url.includes("/api/notifications/bulk")) return bulkGate;
      if (url.includes("/api/notifications")) {
        notifCalls += 1;
        return Response.json(notifCalls === 1 ? releasePayload : emptiedPayload);
      }
      if (url.includes("/api/connection")) {
        return Response.json({ connected: true });
      }
      return Response.json({});
    });
    vi.stubGlobal("fetch", gatedFetch);

    renderWithQuery(<InboxPage />);
    await screen.findByText("Release v2.0 ships");
    expect(
      within(screen.getByRole("button", { name: "Show all" })).getByText("2")
    ).toBeInTheDocument();

    fireEvent.click(screen.getByRole("checkbox", { name: "Select all visible" }));
    fireEvent.click(screen.getByRole("button", { name: "Done" }));

    // The bulk request is still gated, so any count change is optimistic.
    expect(
      await within(screen.getByRole("button", { name: "Show all" })).findByText("0")
    ).toBeInTheDocument();
    expect(
      await within(screen.getByRole("button", { name: "Filter by Release" })).findByText(
        "0"
      )
    ).toBeInTheDocument();

    resolveBulk(Response.json({ updated: 2, action: "done" }));
    await waitFor(() => {
      expect(notifCalls).toBeGreaterThanOrEqual(2);
    });
    expect(
      within(screen.getByRole("button", { name: "Show all" })).getByText("0")
    ).toBeInTheDocument();
  });

  test("a triage action from the drawer closes the drawer and posts the item", async () => {
    const fetchMock = installFetch();
    renderWithQuery(<InboxPage />);
    await screen.findByText("Fix flaky login redirect");

    fireEvent.click(screen.getByText("Fix flaky login redirect"));
    const drawer = await screen.findByRole("dialog", { name: "Preview drawer" });
    fireEvent.click(within(drawer).getByRole("button", { name: "Done" }));

    await waitFor(() => {
      expect(screen.queryByRole("dialog", { name: "Preview drawer" })).not.toBeInTheDocument();
    });
    await waitFor(() => {
      expect(callsTo(fetchMock, "/api/notifications/bulk")).toHaveLength(1);
    });
    const [, init] = callsTo(fetchMock, "/api/notifications/bulk")[0]!;
    expect(JSON.parse(String(init?.body))).toEqual({ ids: ["n_001"], action: "done" });
  });

  test("syncing one item posts the id of that item", async () => {
    const fetchMock = installFetch();
    renderWithQuery(<InboxPage />);
    await screen.findByText("Fix flaky login redirect");

    // The menu of the second row, so the id has to be the second one.
    fireEvent.click(screen.getByRole("button", { name: "Actions for Bump the linter" }));
    const menu = await screen.findByRole("menu", { name: "Actions for Bump the linter" });
    fireEvent.click(within(menu).getByRole("menuitem", { name: /Sync this item/ }));

    await waitFor(() => {
      expect(callsTo(fetchMock, "/api/thread/sync")).toHaveLength(1);
    });
    const [, init] = callsTo(fetchMock, "/api/thread/sync")[0]!;
    expect(init?.method).toBe("POST");
    expect(JSON.parse(String(init?.body))).toEqual({ id: "n_002" });
  });

  test("the keyboard selects the focused row", async () => {    installFetch();
    renderWithQuery(<InboxPage />);
    await screen.findByText("Fix flaky login redirect");

    fireEvent.keyDown(window, { key: "j" });
    fireEvent.keyDown(window, { key: "x" });

    expect(await screen.findByText("1 selected")).toBeInTheDocument();
  });

  test("the d key marks the focused row done", async () => {
    const fetchMock = installFetch();
    renderWithQuery(<InboxPage />);
    await screen.findByText("Fix flaky login redirect");

    fireEvent.keyDown(window, { key: "j" });
    fireEvent.keyDown(window, { key: "d" });

    await waitFor(() => {
      expect(callsTo(fetchMock, "/api/notifications/bulk")).toHaveLength(1);
    });
    const [, init] = callsTo(fetchMock, "/api/notifications/bulk")[0]!;
    expect(JSON.parse(String(init?.body))).toEqual({ ids: ["n_001"], action: "done" });
  });

  test("Shift+D opens details for the focused row", async () => {
    installFetch();
    renderWithQuery(<InboxPage />);
    await screen.findByText("Fix flaky login redirect");

    fireEvent.keyDown(window, { key: "j" });
    fireEvent.keyDown(window, { key: "D" });
    expect(screen.queryByRole("dialog", { name: "Preview drawer" })).not.toBeInTheDocument();

    fireEvent.keyDown(window, { key: "D", shiftKey: true });
    expect(await screen.findByRole("dialog", { name: "Preview drawer" })).toBeInTheDocument();

    fireEvent.keyDown(window, { key: "D", shiftKey: true });
    expect(await screen.findByRole("dialog", { name: "Preview drawer" })).toBeInTheDocument();
  });

  test("the item menu copies the source link and says so", async () => {
    installFetch();
    renderWithQuery(<InboxPage />);
    await screen.findByText("Fix flaky login redirect");

    fireEvent.click(screen.getByRole("button", { name: "Actions for Fix flaky login redirect" }));
    fireEvent.click(screen.getByRole("menuitem", { name: /Copy link/ }));

    expect(await screen.findByText("Link copied to clipboard.")).toBeInTheDocument();
  });

  test("the question mark opens the shortcuts help", async () => {
    installFetch();
    renderWithQuery(
      <AppShell>
        <InboxPage />
      </AppShell>
    );
    await screen.findByText("Fix flaky login redirect");

    fireEvent.keyDown(window, { key: "?" });

    expect(await screen.findByRole("dialog", { name: "Keyboard shortcuts" })).toBeInTheDocument();
  });

  test("a bulk action that fails restores the previous list and reports it", async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      void init;
      const url = String(input);
      if (url.includes("/api/notifications/bulk")) {
        return new Response("nope", { status: 500 });
      }
      if (url.includes("/api/notifications")) {
        return Response.json(notificationsPayload);
      }
      if (url.includes("/api/connection")) {
        return Response.json({ connected: true });
      }
      return Response.json({});
    });
    vi.stubGlobal("fetch", fetchMock);

    renderWithQuery(<InboxPage />);
    await screen.findByText("Fix flaky login redirect");

    fireEvent.click(screen.getByRole("checkbox", { name: "Select all visible" }));
    await screen.findByText("2 selected");
    fireEvent.click(screen.getByRole("button", { name: "Done" }));

    expect(await screen.findByText("Action failed. Restored previous state.")).toBeInTheDocument();
    expect(screen.getByText("Fix flaky login redirect")).toBeInTheDocument();
  });

  test("renders the quiet digest section for collapsed repositories", async () => {
    installFetch({ notifications: digestPayload });

    renderWithQuery(<InboxPage />);

    expect(await screen.findByText("Quiet until due (2 pending)")).toBeInTheDocument();
    const digest = within(screen.getByRole("region", { name: "Quiet digests" }));
    expect(digest.getByText("acme/api")).toBeInTheDocument();
    expect(digest.getByText("weekly")).toBeInTheDocument();
  });

  test("the shortcuts help opens from the header and closes with Escape", async () => {
    installFetch();
    renderWithQuery(
      <AppShell>
        <InboxPage />
      </AppShell>
    );
    await screen.findByText("Fix flaky login redirect");

    fireEvent.click(screen.getByRole("button", { name: "Show keyboard shortcuts" }));
    expect(await screen.findByRole("dialog", { name: "Keyboard shortcuts" })).toBeInTheDocument();

    fireEvent.keyDown(window, { key: "Escape" });

    await waitFor(() => {
      expect(screen.queryByRole("dialog", { name: "Keyboard shortcuts" })).not.toBeInTheDocument();
    });
  });

  test("the refresh button syncs from GitHub and reloads the list", async () => {
    const fetchMock = installFetch();
    renderWithQuery(<InboxPage />);
    await screen.findByText("Fix flaky login redirect");

    fireEvent.click(screen.getByRole("button", { name: "Refresh inbox from GitHub" }));

    await waitFor(() => {
      expect(callsTo(fetchMock, "/api/sync")).toHaveLength(1);
    });
    const [, init] = callsTo(fetchMock, "/api/sync")[0]!;
    expect(init?.method).toBe("POST");
    await waitFor(() => {
      expect(callsTo(fetchMock, "/api/notifications").length).toBeGreaterThanOrEqual(2);
    });
  });

  test("warns when the GitHub connection is down but still shows the cached list", async () => {
    installFetch({ connection: { connected: false, reason: "auth" } });

    renderWithQuery(<InboxPage />);

    expect(await screen.findByText("GitHub disconnected.")).toBeInTheDocument();
    expect(screen.getByText("Fix flaky login redirect")).toBeInTheDocument();
  });

  test("warns that the cached data is stale", async () => {
    installFetch({
      notifications: {
        ...notificationsPayload,
        lastSyncAt: Date.parse("2026-01-15T10:00:00Z"),
        stale: true,
      },
    });

    renderWithQuery(<InboxPage />);

    expect(await screen.findByText(/Data may be stale\./)).toBeInTheDocument();
    expect(screen.getByText(/Last synced/)).toBeInTheDocument();
  });

  test("the subtitle follows the state filter", async () => {
    installFetch();
    nav.params = new URLSearchParams("state=done");
    renderWithQuery(<InboxPage />);
    expect(
      await screen.findByText("Finished items. Mark anything unread to bring it back.")
    ).toBeInTheDocument();
    cleanup();

    nav.params = new URLSearchParams("state=all");
    renderWithQuery(<InboxPage />);
    expect(
      await screen.findByText("Every notification in one place. Digests stay collapsed until due.")
    ).toBeInTheDocument();
    cleanup();

    nav.params = new URLSearchParams("");
    renderWithQuery(<InboxPage />);
    expect(
      await screen.findByText("Triage unread notifications. Digests stay collapsed until due.")
    ).toBeInTheDocument();
  });

  test("unsubscribe asks for confirmation before sending", async () => {
    const fetchMock = installFetch();
    renderWithQuery(<InboxPage />);
    await screen.findByText("Fix flaky login redirect");

    fireEvent.click(screen.getByRole("checkbox", { name: "Select Fix flaky login redirect" }));
    await screen.findByText("1 selected");
    fireEvent.click(screen.getByRole("button", { name: "Unsubscribe" }));

    const confirm = await screen.findByRole("alertdialog", { name: /Unsubscribe from/ });
    expect(within(confirm).getByText("Unsubscribe from 1 thread?")).toBeInTheDocument();
    expect(callsTo(fetchMock, "/api/notifications/bulk")).toHaveLength(0);

    fireEvent.click(within(confirm).getByRole("button", { name: "Cancel" }));
    await waitFor(() => {
      expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument();
    });
    expect(callsTo(fetchMock, "/api/notifications/bulk")).toHaveLength(0);

    fireEvent.click(screen.getByRole("button", { name: "Unsubscribe" }));
    const retry = await screen.findByRole("alertdialog", { name: /Unsubscribe from/ });
    fireEvent.click(within(retry).getByRole("button", { name: "Unsubscribe" }));

    await waitFor(() => {
      expect(callsTo(fetchMock, "/api/notifications/bulk")).toHaveLength(1);
    });
    const [, init] = callsTo(fetchMock, "/api/notifications/bulk")[0]!;
    expect(JSON.parse(String(init?.body))).toEqual({ ids: ["n_001"], action: "unsubscribe" });
  });

  test("Escape closes the unsubscribe confirm without touching the selection", async () => {
    installFetch();
    renderWithQuery(<InboxPage />);
    await screen.findByText("Fix flaky login redirect");

    fireEvent.click(screen.getByRole("checkbox", { name: "Select Fix flaky login redirect" }));
    await screen.findByText("1 selected");
    fireEvent.click(screen.getByRole("button", { name: "Unsubscribe" }));
    await screen.findByRole("alertdialog", { name: /Unsubscribe from/ });

    fireEvent.keyDown(window, { key: "Escape" });

    await waitFor(() => {
      expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument();
    });
    expect(screen.getByText("1 selected")).toBeInTheDocument();
  });

  test("the refresh button waits for the poll window to pass", async () => {    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-01-15T10:00:00Z"));
    installFetch({
      notifications: {
        ...notificationsPayload,
        lastSyncAt: Date.parse("2026-01-15T10:00:00Z"),
      },
    });

    renderWithQuery(<InboxPage />);
    await screen.findByText("Fix flaky login redirect");

    // Accessible name stays stable so the button never changes width or
    // forces screen readers to re-announce every second. The countdown
    // lives in a fixed-width, aria-hidden slot next to the synced time.
    expect(screen.getByRole("button", { name: "Refresh inbox from GitHub" })).toBeDisabled();
    expect(screen.getByText("· 60s")).toBeInTheDocument();

    // Two minutes later the poll window has passed and the refresh is allowed.
    vi.setSystemTime(new Date("2026-01-15T10:02:00Z"));

    await waitFor(
      () => {
        expect(screen.getByRole("button", { name: "Refresh inbox from GitHub" })).toBeEnabled();
      },
      { timeout: 5000 }
    );
  });

  function sidebarWidth(): string | null {
    const aside = screen.getByRole("complementary", { name: "Inbox filters" });
    return aside.style.getPropertyValue("--filter-w") || null;
  }

  test("applies the stored sidebar width before showing the filters", async () => {
    installFetch();
    localStorage.setItem("ghn:filter-width", "320");

    renderWithQuery(<InboxPage />);
    await screen.findByText("Fix flaky login redirect");

    expect(sidebarWidth()).toBe("320px");
    expect(screen.getByRole("complementary", { name: "Inbox filters" })).toBeVisible();
  });

  test("the arrow keys resize the sidebar and persist the width", async () => {
    installFetch();
    renderWithQuery(<InboxPage />);
    await screen.findByText("Fix flaky login redirect");

    const handle = screen.getByRole("separator", { name: "Resize filters sidebar" });
    fireEvent.keyDown(handle, { key: "ArrowRight" });

    expect(sidebarWidth()).toBe("272px");
    expect(localStorage.getItem("ghn:filter-width")).toBe("272");

    fireEvent.keyDown(handle, { key: "ArrowLeft" });
    expect(sidebarWidth()).toBe("256px");
  });

  test("hovering or focusing the edge reveals the resize indicator", async () => {
    installFetch();
    renderWithQuery(<InboxPage />);
    await screen.findByText("Fix flaky login redirect");

    const handle = screen.getByRole("separator", { name: "Resize filters sidebar" });
    const line = () => handle.querySelector("span")?.style.opacity ?? null;
    expect(line()).toBe("0");

    fireEvent.mouseOver(handle);
    expect(line()).toBe("1");
    fireEvent.mouseOut(handle);
    expect(line()).toBe("0");

    fireEvent.focus(handle);
    expect(line()).toBe("1");
    fireEvent.blur(handle);
    expect(line()).toBe("0");
  });

  test("dragging the separator resizes and double-click resets the width", async () => {
    installFetch();
    const originalCapture = window.HTMLElement.prototype.setPointerCapture;
    window.HTMLElement.prototype.setPointerCapture = vi.fn();
    try {
      renderWithQuery(<InboxPage />);
      await screen.findByText("Fix flaky login redirect");

      const handle = screen.getByRole("separator", { name: "Resize filters sidebar" });
      // happy-dom reports a zero rect, so the width lands on the pointer x.
      fireEvent.pointerDown(handle, { clientX: 300 });
      fireEvent.pointerMove(handle, { clientX: 500 });
      fireEvent.pointerUp(handle);

      expect(sidebarWidth()).toBe("480px");
      expect(localStorage.getItem("ghn:filter-width")).toBe("480");

      fireEvent.doubleClick(handle);
      expect(sidebarWidth()).toBe("256px");
      expect(localStorage.getItem("ghn:filter-width")).toBe("256");
    } finally {
      window.HTMLElement.prototype.setPointerCapture = originalCapture;
    }
  });
});
