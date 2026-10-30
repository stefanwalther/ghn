import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { FilterSidebar } from "@/components/inbox/filter-sidebar";
import { CommandPalette } from "@/components/search/command-palette";
import { resetUIStore, useUIStore } from "@/lib/ui-store";

const pushMock = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: vi.fn(), push: pushMock, back: vi.fn() }),
  useSearchParams: () => new URLSearchParams(""),
  usePathname: () => "/",
}));

const repoFacets = [
  { id: "acme--web", fullName: "acme/web", main: 3, quiet: 0, isSnoozed: false },
  { id: "acme--api", fullName: "acme/api", main: 0, quiet: 4, isSnoozed: true },
  { id: "other--docs", fullName: "other/docs", main: 2, quiet: 0, isSnoozed: false },
];

const typeFacets = [{ value: "all", label: "All", count: 5 }];

const notificationsPayload = {
  lastSyncAt: null,
  stale: false,
  mainFlow: [
    {
      id: "n_001",
      repositoryId: "acme--web",
      repositoryName: "acme/web",
      subject: "Fix flaky login redirect",
      subjectType: "PullRequest",
      reason: "mention",
      createdAt: Date.parse("2026-01-15T10:00:00Z"),
      isRead: 0,
      isDone: 0,
      sourceUrl: "https://github.com/acme/web/pull/1",
      due: true,
      dueLabel: null,
    },
    {
      id: "n_002",
      repositoryId: "stefanwalther--bg",
      repositoryName: "stefanwalther/bg",
      subject: "chore(main): release bg 0.92 (#862)",
      subjectType: "PullRequest",
      reason: "subscribed",
      createdAt: Date.parse("2026-01-14T10:00:00Z"),
      isRead: 1,
      isDone: 0,
      sourceUrl: "https://github.com/stefanwalther/bg/pull/862",
      due: true,
      dueLabel: null,
    },
  ],
  collapsedSection: [],
  facets: { types: [], repos: [] },
};

const repositoriesPayload = {
  repositories: [
    { id: "acme--web", fullName: "acme/web" },
    { id: "other--docs", fullName: "other/docs" },
  ],
};

function installFetch() {
  const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
    const url = String(input);
    if (url.startsWith("/api/notifications")) return Response.json(notificationsPayload);
    if (url.startsWith("/api/repositories")) return Response.json(repositoriesPayload);
    return Response.json({});
  });
  vi.stubGlobal("fetch", fetchMock);
}

function renderPalette() {
  const client = new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
        staleTime: 30_000,
        gcTime: Infinity,
        refetchOnWindowFocus: false,
        refetchOnReconnect: false,
      },
      mutations: { retry: false },
    },
  });
  render(
    <QueryClientProvider client={client}>
      <CommandPalette />
    </QueryClientProvider>
  );
}

beforeEach(() => {
  localStorage.clear();
  sessionStorage.clear();
  resetUIStore();
  pushMock.mockClear();
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("FilterSidebar repository search", () => {
  function renderSidebar(overrides = {}) {
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

  test("narrows the list with the same fuzzy matching as the palette", () => {
    renderSidebar();
    const input = screen.getByRole("searchbox", { name: "Filter repositories" });
    fireEvent.change(input, { target: { value: "web" } });

    expect(screen.getByRole("button", { name: "Filter by acme/web" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Filter by other/docs" })).not.toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveTextContent("1 of 3 repositories");
  });

  test("clearing restores every repository", () => {
    renderSidebar();
    const input = screen.getByRole("searchbox", { name: "Filter repositories" });
    fireEvent.change(input, { target: { value: "web" } });
    expect(screen.queryByRole("button", { name: "Filter by other/docs" })).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Clear repository filter" }));
    expect(screen.getByRole("button", { name: "Filter by other/docs" })).toBeInTheDocument();
  });

  test("Escape clears the filter", () => {
    renderSidebar();
    const input = screen.getByRole("searchbox", { name: "Filter repositories" });
    fireEvent.change(input, { target: { value: "web" } });
    fireEvent.keyDown(input, { key: "Escape" });
    expect(screen.getByRole("button", { name: "Filter by other/docs" })).toBeInTheDocument();
  });

  test("empty matches explain themselves with a recovery action", () => {
    renderSidebar();
    fireEvent.change(screen.getByRole("searchbox", { name: "Filter repositories" }), {
      target: { value: "zzz-no-such-repo" },
    });
    expect(screen.getByRole("status")).toHaveTextContent("No repositories match");
    fireEvent.click(screen.getByRole("button", { name: /Clear the filter/ }));
    expect(screen.getByRole("button", { name: "Filter by acme/web" })).toBeInTheDocument();
  });

  test("the active repo stays pinned so the current filter never vanishes", () => {
    renderSidebar({ activeRepo: "other--docs" });
    fireEvent.change(screen.getByRole("searchbox", { name: "Filter repositories" }), {
      target: { value: "web" },
    });
    expect(screen.getByRole("button", { name: "Filter by other/docs" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Filter by acme/web" })).toBeInTheDocument();
  });

  test("scope qualifiers are stripped: the box already lists only repos", () => {
    renderSidebar();
    fireEvent.change(screen.getByRole("searchbox", { name: "Filter repositories" }), {
      target: { value: "repo:web" },
    });
    expect(screen.getByRole("button", { name: "Filter by acme/web" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Filter by other/docs" })).not.toBeInTheDocument();
  });

  test("a bare qualifier alone filters nothing", () => {
    renderSidebar();
    fireEvent.change(screen.getByRole("searchbox", { name: "Filter repositories" }), {
      target: { value: "repo:" },
    });
    expect(screen.getByRole("button", { name: "Filter by acme/web" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Filter by other/docs" })).toBeInTheDocument();
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
  });
});

describe("CommandPalette repository filtering", () => {
  test("offers a sidebar-list handoff after the repo hits without stealing Enter", async () => {
    installFetch();
    renderPalette();
    act(() => {
      useUIStore.getState().openPalette();
    });
    const input = await screen.findByRole("combobox");
    fireEvent.change(input, { target: { value: "acme" } });

    const handoff = await screen.findByRole("option", {
      name: /Filter repository list to/,
    });
    expect(handoff).toBeInTheDocument();

    // The top hit keeps Enter: a thread still opens in the drawer.
    const options = screen.getAllByRole("option");
    expect(options[0]).toHaveTextContent("Fix flaky login redirect");

    fireEvent.click(handoff);
    await waitFor(() => {
      expect(useUIStore.getState().paletteOpen).toBe(false);
    });
    expect(useUIStore.getState().repoListFilter).toBe("acme");
  });

  test("repo: scopes the palette to repos only", async () => {
    installFetch();
    renderPalette();
    act(() => {
      useUIStore.getState().openPalette();
    });
    const input = await screen.findByRole("combobox");
    fireEvent.change(input, { target: { value: "repo:acme" } });

    await waitFor(() => {
      expect(screen.queryByRole("option", { name: /Fix flaky/ })).not.toBeInTheDocument();
    });
    expect(screen.getByRole("option", { name: /acme\/web/ })).toBeInTheDocument();
    expect(screen.getByText("repo: repos only")).toBeInTheDocument();
  });

  test("repo rows offer Select, not Filter", async () => {
    installFetch();
    renderPalette();
    act(() => {
      useUIStore.getState().openPalette();
    });
    const input = await screen.findByRole("combobox");
    fireEvent.change(input, { target: { value: "repo:acme" } });

    const row = await screen.findByRole("option", { name: /acme\/web/ });
    expect(row).toHaveTextContent("Select this repo");
    expect(row).toHaveTextContent("Select");
    expect(row).not.toHaveTextContent("Filter");
  });

  test("bg#862 finds the thread instead of scoping", async () => {
    installFetch();
    renderPalette();
    act(() => {
      useUIStore.getState().openPalette();
    });
    const input = await screen.findByRole("combobox");
    fireEvent.change(input, { target: { value: "bg#862" } });

    // No repo scope: the PR-number query finds its thread.
    expect(
      await screen.findByRole("option", { name: /release bg 0\.92 \(#862\)/ })
    ).toBeInTheDocument();
    expect(screen.queryByText(/repos only/)).not.toBeInTheDocument();
  });

  test("scope tabs toggle between all results and repos only", async () => {
    installFetch();
    renderPalette();
    act(() => {
      useUIStore.getState().openPalette();
    });
    const input = (await screen.findByRole("combobox")) as HTMLInputElement;
    fireEvent.change(input, { target: { value: "acme" } });
    await screen.findByRole("option", { name: /Fix flaky login redirect/ });

    const reposTab = screen.getByRole("button", { name: /^Repos/ });
    expect(reposTab).toHaveAttribute("aria-pressed", "false");
    fireEvent.click(reposTab);

    expect(input.value).toBe("repo:acme");
    expect(screen.getByRole("button", { name: /^Repos/ })).toHaveAttribute(
      "aria-pressed",
      "true"
    );
    expect(screen.queryByRole("option", { name: /Fix flaky/ })).not.toBeInTheDocument();
    expect(screen.getByText("repo: repos only")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /^All/ }));
    expect(input.value).toBe("acme");
    await screen.findByRole("option", { name: /Fix flaky login redirect/ });
  });

  test("Shift+Enter on a thread filters the inbox to its repo", async () => {
    installFetch();
    renderPalette();
    act(() => {
      useUIStore.getState().openPalette();
    });
    const input = await screen.findByRole("combobox");
    fireEvent.change(input, { target: { value: "flaky" } });

    await screen.findByRole("option", { name: /Fix flaky login redirect/ });
    // The active thread names both actions: Enter opens, Shift+Enter filters.
    expect(screen.getByText("Open", { exact: false })).toBeInTheDocument();
    fireEvent.keyDown(input, { key: "Enter", shiftKey: true });

    expect(pushMock).toHaveBeenCalledWith("/?repo=acme--web");
  });

  test("typing the qualifier suggests it GitHub-style and Enter completes it", async () => {
    installFetch();
    renderPalette();
    act(() => {
      useUIStore.getState().openPalette();
    });
    const input = (await screen.findByRole("combobox")) as HTMLInputElement;
    fireEvent.change(input, { target: { value: "r" } });

    const syntax = await screen.findByRole("option", { name: /^repo:/ });
    expect(syntax).toHaveTextContent("Search only repositories");
    fireEvent.keyDown(input, { key: "Enter" });

    expect(input.value).toBe("repo:");
    expect(useUIStore.getState().paletteOpen).toBe(true);
  });

  test("Syntax tips closes the palette and opens help", async () => {
    installFetch();
    renderPalette();
    act(() => {
      useUIStore.getState().openPalette();
    });
    await screen.findByRole("combobox");

    fireEvent.click(screen.getByRole("button", { name: "Syntax tips" }));

    await waitFor(() => {
      expect(useUIStore.getState().paletteOpen).toBe(false);
    });
    expect(useUIStore.getState().helpOpen).toBe(true);
  });

  test("typing filter shows dimensions with current values; Repository drills into repos", async () => {
    installFetch();
    renderPalette();
    act(() => {
      useUIStore.getState().openPalette();
    });
    const input = (await screen.findByRole("combobox")) as HTMLInputElement;
    fireEvent.change(input, { target: { value: "filter" } });

    const repo = await screen.findByRole("option", { name: /^Repository/ });
    expect(repo).toHaveTextContent("Currently: All repositories");
    expect(
      screen.getByRole("option", { name: /^Type/ })
    ).toHaveTextContent("Currently: All types");
    expect(
      screen.getByRole("option", { name: /^State/ })
    ).toHaveTextContent("Currently: Unread");
    expect(
      screen.getByRole("option", { name: /^Age/ })
    ).toHaveTextContent("Currently: All time");

    fireEvent.click(repo);
    expect(input.value).toBe("repo:");
    expect(screen.getByRole("button", { name: /^Repos/ })).toHaveAttribute(
      "aria-pressed",
      "true"
    );
  });

  test("type: lists server types and filters the inbox preserving other filters", async () => {
    installFetch();
    renderPalette();
    act(() => {
      useUIStore.getState().openPalette();
    });
    const input = await screen.findByRole("combobox");
    fireEvent.change(input, { target: { value: "type:rel" } });

    fireEvent.click(await screen.findByRole("option", { name: /^Release/ }));
    expect(pushMock).toHaveBeenCalledWith("/?type=release");
  });

  test("state: and age: scopes filter the inbox too", async () => {
    installFetch();
    renderPalette();
    act(() => {
      useUIStore.getState().openPalette();
    });
    const input = await screen.findByRole("combobox");

    fireEvent.change(input, { target: { value: "state:don" } });
    fireEvent.click(await screen.findByRole("option", { name: /^Done/ }));
    expect(pushMock).toHaveBeenCalledWith("/?state=done");

    act(() => {
      useUIStore.getState().openPalette();
    });
    const reopened = await screen.findByRole("combobox");
    fireEvent.change(reopened, { target: { value: "age:7" } });
    fireEvent.click(await screen.findByRole("option", { name: /Last 7 days/ }));
    expect(pushMock).toHaveBeenCalledWith("/?age=7d");
  });

  test("Types tab scopes an empty query to type values", async () => {
    installFetch();
    renderPalette();
    act(() => {
      useUIStore.getState().openPalette();
    });
    const input = (await screen.findByRole("combobox")) as HTMLInputElement;

    fireEvent.click(screen.getByRole("button", { name: /^Types/ }));
    expect(input.value).toBe("type:");
    expect(await screen.findByRole("option", { name: /^Release/ })).toBeInTheDocument();
  });
});
