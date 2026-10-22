import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
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
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  test("loads the notification list from the API and renders it", async () => {
    const fetchMock = installFetch();

    render(<InboxPage />);

    const list = within(await screen.findByRole("list"));
    expect(list.getByText("Fix flaky login redirect")).toBeInTheDocument();
    expect(list.getByText("Bump the linter")).toBeInTheDocument();
    expect(list.getByText("acme/web")).toBeInTheDocument();
    expect(screen.getByText("2 items")).toBeInTheDocument();

    expect(callsTo(fetchMock, "/api/notifications")).toHaveLength(1);
    expect(callsTo(fetchMock, "/api/notifications")[0]?.[0]).toBe("/api/notifications");
  });

  test("shows the empty state when the inbox has no items", async () => {
    installFetch({ notifications: { ...notificationsPayload, mainFlow: [] } });

    render(<InboxPage />);

    expect(await screen.findByText("All caught up")).toBeInTheDocument();
    expect(screen.queryByText("Fix flaky login redirect")).not.toBeInTheDocument();
  });

  test("shows the error state and recovers when the retry succeeds", async () => {
    const fetchMock = installFetch({ failFirstNotifications: true });

    render(<InboxPage />);

    expect(await screen.findByText("Inbox failed to load")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Retry" }));

    expect(await screen.findByText("Fix flaky login redirect")).toBeInTheDocument();
    expect(callsTo(fetchMock, "/api/notifications")).toHaveLength(2);
  });

  test("a type filter change replaces the route with the matching query string", async () => {
    installFetch();
    render(<InboxPage />);
    await screen.findByText("Fix flaky login redirect");

    fireEvent.click(screen.getByRole("button", { name: "Filter by Pull requests" }));

    expect(nav.replace).toHaveBeenCalledWith("/?type=pull_request", { scroll: false });
  });

  test("an age filter change replaces the route with the matching query string", async () => {
    installFetch();
    render(<InboxPage />);
    await screen.findByText("Fix flaky login redirect");

    fireEvent.change(screen.getByLabelText("Filter by age"), { target: { value: "7d" } });

    expect(nav.replace).toHaveBeenCalledWith("/?age=7d", { scroll: false });
  });

  test("a repository filter change replaces the route with the matching query string", async () => {
    installFetch();
    render(<InboxPage />);
    await screen.findByText("Fix flaky login redirect");

    fireEvent.click(screen.getByRole("button", { name: "Filter by acme/api" }));

    expect(nav.replace).toHaveBeenCalledWith("/?repo=acme--api", { scroll: false });
  });

  test("Escape closes the drawer", async () => {
    installFetch();
    render(<InboxPage />);
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
    render(<InboxPage />);
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

  test("a triage action from the drawer closes the drawer and posts the item", async () => {
    const fetchMock = installFetch();
    render(<InboxPage />);
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
    render(<InboxPage />);
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
    render(<InboxPage />);
    await screen.findByText("Fix flaky login redirect");

    fireEvent.keyDown(window, { key: "j" });
    fireEvent.keyDown(window, { key: "x" });

    expect(await screen.findByText("1 selected")).toBeInTheDocument();
  });

  test("the item menu copies the source link and says so", async () => {
    installFetch();
    render(<InboxPage />);
    await screen.findByText("Fix flaky login redirect");

    fireEvent.click(screen.getByRole("button", { name: "Actions for Fix flaky login redirect" }));
    fireEvent.click(screen.getByRole("menuitem", { name: /Copy link/ }));

    expect(await screen.findByText("Link copied to clipboard.")).toBeInTheDocument();
  });

  test("the question mark opens the shortcuts help", async () => {
    installFetch();
    render(
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

    render(<InboxPage />);
    await screen.findByText("Fix flaky login redirect");

    fireEvent.click(screen.getByRole("checkbox", { name: "Select all visible" }));
    await screen.findByText("2 selected");
    fireEvent.click(screen.getByRole("button", { name: "Done" }));

    expect(await screen.findByText("Action failed. Restored previous state.")).toBeInTheDocument();
    expect(screen.getByText("Fix flaky login redirect")).toBeInTheDocument();
  });

  test("renders the quiet digest section for collapsed repositories", async () => {
    installFetch({ notifications: digestPayload });

    render(<InboxPage />);

    expect(await screen.findByText("Quiet until due (2 pending)")).toBeInTheDocument();
    const digest = within(screen.getByRole("region", { name: "Quiet digests" }));
    expect(digest.getByText("acme/api")).toBeInTheDocument();
    expect(digest.getByText("weekly")).toBeInTheDocument();
  });

  test("the shortcuts help opens from the header and closes with Escape", async () => {
    installFetch();
    render(
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
    render(<InboxPage />);
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

    render(<InboxPage />);

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

    render(<InboxPage />);

    expect(await screen.findByText(/Data may be stale\./)).toBeInTheDocument();
    expect(screen.getByText(/Last synced/)).toBeInTheDocument();
  });

  test("the refresh button waits for the poll window to pass", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-01-15T10:00:00Z"));
    installFetch({
      notifications: {
        ...notificationsPayload,
        lastSyncAt: Date.parse("2026-01-15T10:00:00Z"),
      },
    });

    render(<InboxPage />);
    await screen.findByText("Fix flaky login redirect");

    expect(screen.getByRole("button", { name: "Next refresh in 60 seconds" })).toBeDisabled();

    // Two minutes later the poll window has passed and the refresh is allowed.
    vi.setSystemTime(new Date("2026-01-15T10:02:00Z"));

    await waitFor(
      () => {
        expect(screen.getByRole("button", { name: "Refresh inbox from GitHub" })).toBeEnabled();
      },
      { timeout: 5000 }
    );
  });
});
