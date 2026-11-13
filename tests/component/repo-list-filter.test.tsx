import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
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

describe("FilterSidebar multi-select", () => {
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

  function row(name: string) {
    return screen.getByRole("button", { name: `Filter by ${name}` });
  }

  test("ctrl-click toggles selection without filtering", () => {
    const props = renderSidebar();
    fireEvent.click(row("acme/web"), { ctrlKey: true });
    fireEvent.click(row("other/docs"), { ctrlKey: true });
    expect(row("acme/web")).toHaveAttribute("aria-pressed", "true");
    expect(row("other/docs")).toHaveAttribute("aria-pressed", "true");
    expect(props.onRepo).not.toHaveBeenCalled();
  });

  test("ctrl-click again deselects the row", () => {
    renderSidebar();
    fireEvent.click(row("acme/web"), { ctrlKey: true });
    fireEvent.click(row("acme/web"), { ctrlKey: true });
    expect(row("acme/web")).toHaveAttribute("aria-pressed", "false");
  });

  test("shift-click extends a range from the anchor in display order", () => {
    renderSidebar();
    fireEvent.click(row("acme/web"), { ctrlKey: true });
    fireEvent.click(row("acme/api"), { shiftKey: true });
    expect(row("acme/web")).toHaveAttribute("aria-pressed", "true");
    expect(row("other/docs")).toHaveAttribute("aria-pressed", "true");
    expect(row("acme/api")).toHaveAttribute("aria-pressed", "true");
  });

  test("plain click clears the selection and filters as today", () => {
    const props = renderSidebar();
    fireEvent.click(row("acme/web"), { ctrlKey: true });
    fireEvent.click(row("other/docs"));
    expect(row("acme/web")).toHaveAttribute("aria-pressed", "false");
    expect(props.onRepo).toHaveBeenCalledWith("other--docs");
  });

  test("escape clears the selection without filtering", () => {
    const props = renderSidebar();
    fireEvent.click(row("acme/web"), { ctrlKey: true });
    fireEvent.keyDown(row("acme/web"), { key: "Escape" });
    expect(row("acme/web")).toHaveAttribute("aria-pressed", "false");
    expect(props.onRepo).not.toHaveBeenCalled();
  });

  test("clicking empty sidebar space clears the selection without filtering", () => {
    const props = renderSidebar();
    fireEvent.click(row("acme/web"), { ctrlKey: true });
    fireEvent.click(screen.getByLabelText("Repository filters"));
    expect(row("acme/web")).toHaveAttribute("aria-pressed", "false");
    expect(props.onRepo).not.toHaveBeenCalled();
  });

  test("shift-arrow extends a range from the anchor", () => {
    renderSidebar();
    fireEvent.click(row("acme/web"), { ctrlKey: true });
    row("acme/web").focus();
    fireEvent.keyDown(row("acme/web"), { key: "ArrowDown", shiftKey: true });
    expect(row("acme/web")).toHaveAttribute("aria-pressed", "true");
    expect(row("other/docs")).toHaveAttribute("aria-pressed", "true");
  });
});

describe("FilterSidebar bulk menu", () => {
  function renderBulkSidebar(overrides = {}) {
    const props = {
      types: typeFacets,
      activeType: "all",
      repos: repoFacets,
      activeRepo: "all",
      onType: vi.fn(),
      onRepo: vi.fn(),
      onSnooze: vi.fn(),
      onRhythm: vi.fn(),
      onBulkSnooze: vi.fn(),
      onBulkRhythm: vi.fn(),
      onBulkDone: vi.fn(),
      onBulkRead: vi.fn(),
      onBulkCopied: vi.fn(),
      ...overrides,
    };
    render(<FilterSidebar {...props} />);
    return props;
  }

  function row(name: string) {
    return screen.getByRole("button", { name: `Filter by ${name}` });
  }

  function selectTwo() {
    fireEvent.click(row("acme/web"), { ctrlKey: true });
    fireEvent.click(row("other/docs"), { ctrlKey: true });
  }

  test("right-click on a selected row opens one menu for the whole selection", () => {
    renderBulkSidebar();
    selectTwo();
    fireEvent.contextMenu(row("acme/web"));
    expect(screen.getByRole("menu", { name: "Actions for 2 repositories" })).toBeInTheDocument();
  });

  test("choosing a snooze preset fans out to every selected repository", () => {
    const props = renderBulkSidebar();
    selectTwo();
    fireEvent.contextMenu(row("acme/web"));
    fireEvent.click(screen.getByRole("menuitem", { name: /^In 1 hour/ }));
    expect(props.onBulkSnooze).toHaveBeenCalledTimes(1);
    const [ids, at] = props.onBulkSnooze.mock.calls[0];
    expect([...ids].sort()).toEqual(["acme--web", "other--docs"]);
    expect(typeof at).toBe("number");
  });

  test("disagreeing rhythms show as mixed", () => {
    const repos = [
      { id: "acme--web", fullName: "acme/web", main: 3, quiet: 0, isSnoozed: false, rhythm: "immediate" },
      { id: "other--docs", fullName: "other/docs", main: 2, quiet: 0, isSnoozed: false, rhythm: "weekly" },
    ];
    renderBulkSidebar({ repos });
    selectTwo();
    fireEvent.contextMenu(row("acme/web"));
    expect(screen.getByText("Mixed")).toBeInTheDocument();
  });

  test("all-snoozed selections name the snoozed state, mixed names mixed", () => {
    const repos = [
      { id: "acme--web", fullName: "acme/web", main: 3, quiet: 0, isSnoozed: true },
      { id: "acme--api", fullName: "acme/api", main: 0, quiet: 4, isSnoozed: true },
    ];
    renderBulkSidebar({ repos });
    fireEvent.click(row("acme/web"), { ctrlKey: true });
    fireEvent.contextMenu(row("acme/web"));
    expect(
      screen.getByRole("menu", { name: "Actions for 1 repository" })
    ).toBeInTheDocument();
    expect(screen.getByText("Snoozed")).toBeInTheDocument();
  });

  test("right-click on an unselected row clears the selection and targets one repo", () => {
    const props = renderBulkSidebar();
    selectTwo();
    fireEvent.contextMenu(row("acme/api"));
    expect(
      screen.getByRole("menu", { name: "Actions for acme/api" })
    ).toBeInTheDocument();
    expect(props.onBulkSnooze).not.toHaveBeenCalled();
  });

  test("trigger button opens the combined menu", () => {
    renderBulkSidebar();
    selectTwo();
    const triggers = screen.getAllByRole("button", { name: "Actions for 2 repositories" });
    expect(triggers).toHaveLength(2);
    fireEvent.click(triggers[0]!);
    expect(screen.getByRole("menu", { name: "Actions for 2 repositories" })).toBeInTheDocument();
  });

  test("rhythm, done, and read entries fan out to the whole selection", () => {
    const props = renderBulkSidebar();
    selectTwo();
    fireEvent.contextMenu(row("acme/web"));
    fireEvent.click(screen.getByRole("menuitemradio", { name: "Weekly" }));
    expect(props.onBulkRhythm).toHaveBeenCalledTimes(1);
    expect(props.onBulkRhythm.mock.calls[0]).toEqual([["acme--web", "other--docs"], "weekly"]);

    fireEvent.contextMenu(row("acme/web"));
    const reopened = screen.getByRole("menu", { name: "Actions for 2 repositories" });
    expect(reopened).toBeInTheDocument();
    fireEvent.click(within(reopened).getByRole("menuitem", { name: "Mark all as done (5)" }));
    expect(props.onBulkDone).toHaveBeenCalledTimes(1);
    expect(props.onBulkDone.mock.calls[0]).toEqual([["acme--web", "other--docs"]]);

    fireEvent.contextMenu(row("acme/web"));
    fireEvent.click(screen.getByRole("menuitem", { name: "Mark all as read (5)" }));
    expect(props.onBulkRead).toHaveBeenCalledTimes(1);
    expect(props.onBulkRead.mock.calls[0]).toEqual([["acme--web", "other--docs"]]);
  });

  test("copy joins every selected link and open targets the anchor row", async () => {
    const props = renderBulkSidebar();
    const writeSpy = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(window.navigator, "clipboard", {
      value: { writeText: writeSpy },
      configurable: true,
    });
    const openSpy = vi.spyOn(window, "open").mockReturnValue(null);
    try {
      selectTwo();
      fireEvent.contextMenu(row("other/docs"));
      fireEvent.click(screen.getByRole("menuitem", { name: "Copy 2 links" }));
      await waitFor(() => {
        expect(writeSpy).toHaveBeenCalledWith(
          "https://github.com/acme/web\nhttps://github.com/other/docs"
        );
      });
      expect(props.onBulkCopied).toHaveBeenCalledWith(["acme--web", "other--docs"], true);

      fireEvent.contextMenu(row("other/docs"));
      fireEvent.click(screen.getByRole("menuitem", { name: /Open repo/ }));
      expect(openSpy).toHaveBeenCalledWith("https://github.com/other/docs", "_blank", "noopener");
    } finally {
      vi.unstubAllGlobals();
      openSpy.mockRestore();
    }
  });

  test("unsnooze appears when any selected repo is snoozed", () => {
    const props = renderBulkSidebar();
    fireEvent.click(row("acme/web"), { ctrlKey: true });
    fireEvent.click(row("acme/api"), { ctrlKey: true });
    fireEvent.contextMenu(row("acme/web"));
    fireEvent.click(screen.getByRole("menuitem", { name: "Unsnooze all" }));
    expect(props.onBulkSnooze).toHaveBeenCalledTimes(1);
    expect(props.onBulkSnooze.mock.calls[0]).toEqual([["acme--web", "acme--api"], null]);
  });

  test("escape closes the combined menu", () => {
    renderBulkSidebar();
    selectTwo();
    fireEvent.contextMenu(row("acme/web"));
    expect(screen.getByRole("menu", { name: "Actions for 2 repositories" })).toBeInTheDocument();
    fireEvent.keyDown(document.documentElement, { key: "Escape" });
    expect(screen.queryByRole("menu")).not.toBeInTheDocument();
  });

  test("escape on the trigger moves focus to the row before clearing", () => {
    const props = renderBulkSidebar();
    fireEvent.click(row("acme/web"), { ctrlKey: true });
    fireEvent.contextMenu(row("acme/web"));
    expect(screen.getByRole("menu", { name: "Actions for 1 repository" })).toBeInTheDocument();
    fireEvent.keyDown(document.documentElement, { key: "Escape" });
    expect(screen.queryByRole("menu")).not.toBeInTheDocument();
    const trigger = screen.getByRole("button", { name: "Actions for 1 repository" });
    trigger.focus();
    fireEvent.keyDown(trigger, { key: "Escape" });
    expect(document.activeElement).toBe(row("acme/web"));
    expect(row("acme/web")).toHaveAttribute("aria-pressed", "false");
    expect(props.onRepo).not.toHaveBeenCalled();
  });

  test("selection count is announced as it changes", () => {
    renderBulkSidebar();
    expect(screen.queryByText(/repositories? selected/)).not.toBeInTheDocument();
    const r = row("acme/web");
    fireEvent.click(r, { ctrlKey: true });
    expect(screen.getByRole("status")).toHaveTextContent("1 repository selected");
    fireEvent.click(row("other/docs"), { ctrlKey: true });
    expect(screen.getByRole("status")).toHaveTextContent("2 repositories selected");
    fireEvent.click(row("other/docs"), { ctrlKey: true });
    expect(screen.getByRole("status")).toHaveTextContent("1 repository selected");
  });

  test("single-repo updates disable bulk snooze and rhythm entries", () => {
    renderBulkSidebar({ snoozeDisabled: true });
    fireEvent.click(row("acme/web"), { ctrlKey: true });
    fireEvent.click(row("other/docs"), { ctrlKey: true });
    fireEvent.contextMenu(row("acme/web"));
    const menu = screen.getByRole("menu", { name: "Actions for 2 repositories" });
    expect(within(menu).getByRole("menuitem", { name: /^In 1 hour/ })).toBeDisabled();
    expect(within(menu).getByRole("menuitemradio", { name: "Weekly" })).toBeDisabled();
  });

  test("partially known rhythm keeps the known choice enabled", () => {
    const repos = [
      { id: "acme--web", fullName: "acme/web", main: 3, quiet: 0, isSnoozed: false, rhythm: "immediate" },
      { id: "other--docs", fullName: "other/docs", main: 2, quiet: 0, isSnoozed: false },
    ];
    renderBulkSidebar({ repos });
    fireEvent.click(row("acme/web"), { ctrlKey: true });
    fireEvent.click(row("other/docs"), { ctrlKey: true });
    fireEvent.contextMenu(row("acme/web"));
    const menu = screen.getByRole("menu", { name: "Actions for 2 repositories" });
    expect(within(menu).getByRole("menuitemradio", { name: "Immediate" })).toBeEnabled();
    expect(within(menu).queryByText("Mixed")).not.toBeInTheDocument();
  });

  test("arrow keys move focus between combined entries", () => {
    renderBulkSidebar();
    selectTwo();
    fireEvent.contextMenu(row("acme/web"));
    const menu = screen.getByRole("menu", { name: "Actions for 2 repositories" });
    const done = within(menu).getByRole("menuitem", { name: "Mark all as done (5)" });
    const read = within(menu).getByRole("menuitem", { name: "Mark all as read (5)" });
    done.focus();
    fireEvent.keyDown(done, { key: "ArrowDown" });
    expect(read).toHaveFocus();
    fireEvent.keyDown(read, { key: "ArrowUp" });
    expect(done).toHaveFocus();
  });

  test("clicking outside closes the combined menu", () => {
    renderBulkSidebar();
    selectTwo();
    fireEvent.contextMenu(row("acme/web"));
    expect(screen.getByRole("menu", { name: "Actions for 2 repositories" })).toBeInTheDocument();
    fireEvent.mouseDown(document.body);
    expect(screen.queryByRole("menu")).not.toBeInTheDocument();
  });

  test("scrolling closes the combined menu", () => {
    renderBulkSidebar();
    selectTwo();
    fireEvent.contextMenu(row("acme/web"));
    expect(screen.getByRole("menu", { name: "Actions for 2 repositories" })).toBeInTheDocument();
    fireEvent.scroll(window);
    expect(screen.queryByRole("menu")).not.toBeInTheDocument();
  });

  test("scrolling inside the combined menu keeps it open", () => {
    renderBulkSidebar();
    selectTwo();
    fireEvent.contextMenu(row("acme/web"));
    const menu = screen.getByRole("menu", { name: "Actions for 2 repositories" });
    fireEvent.scroll(menu);
    expect(screen.getByRole("menu", { name: "Actions for 2 repositories" })).toBeInTheDocument();
  });

  test("ctrl-shift-click extends the range without moving the anchor", () => {
    renderBulkSidebar();
    fireEvent.click(row("acme/web"), { ctrlKey: true });
    // Display order is regular rows then snoozed rows, so a range from the
    // anchor to the snoozed row spans all three; a plain toggle would not.
    fireEvent.click(row("acme/api"), { ctrlKey: true, shiftKey: true });
    expect(row("acme/web")).toHaveAttribute("aria-pressed", "true");
    expect(row("other/docs")).toHaveAttribute("aria-pressed", "true");
    expect(row("acme/api")).toHaveAttribute("aria-pressed", "true");
  });

  test("hidden rows keep their selection across collapse and search", () => {
    renderBulkSidebar();
    fireEvent.click(row("acme/web"), { ctrlKey: true });
    fireEvent.click(screen.getByRole("button", { name: "Collapse repository filters" }));
    expect(screen.queryByRole("button", { name: "Filter by acme/web" })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Expand repository filters" }));
    expect(row("acme/web")).toHaveAttribute("aria-pressed", "true");
  });

  test("bulk actions include selections hidden by the search box", () => {
    const props = renderBulkSidebar();
    fireEvent.click(row("acme/web"), { ctrlKey: true });
    fireEvent.click(row("other/docs"), { ctrlKey: true });
    fireEvent.change(screen.getByRole("searchbox", { name: "Filter repositories" }), {
      target: { value: "web" },
    });
    expect(screen.queryByRole("button", { name: "Filter by other/docs" })).not.toBeInTheDocument();
    fireEvent.contextMenu(row("acme/web"));
    fireEvent.click(screen.getByRole("menuitem", { name: /^In 1 hour/ }));
    expect(props.onBulkSnooze).toHaveBeenCalledTimes(1);
    expect(props.onBulkSnooze.mock.calls[0][0]).toEqual(["acme--web", "other--docs"]);
  });

  test("escape on the trigger after menu close clears the selection", () => {
    const props = renderBulkSidebar();
    selectTwo();
    fireEvent.contextMenu(row("acme/web"));
    fireEvent.keyDown(document.documentElement, { key: "Escape" });
    expect(screen.queryByRole("menu")).not.toBeInTheDocument();
    const trigger = screen.getAllByRole("button", { name: "Actions for 2 repositories" })[0]!;
    (document.activeElement as HTMLElement | null)?.blur?.();
    trigger.focus();
    fireEvent.keyDown(trigger, { key: "Escape" });
    expect(row("acme/web")).toHaveAttribute("aria-pressed", "false");
    expect(props.onRepo).not.toHaveBeenCalled();
  });

  test("busy targets disable bulk triage entries", () => {
    renderBulkSidebar({ busyRepoIds: new Set(["acme--web"]) });
    selectTwo();
    fireEvent.contextMenu(row("other/docs"));
    const menu = screen.getByRole("menu", { name: "Actions for 2 repositories" });
    expect(within(menu).getByRole("menuitem", { name: "Mark all as done (5)" })).toBeDisabled();
    expect(within(menu).getByRole("menuitem", { name: "Mark all as read (5)" })).toBeDisabled();
  });

  test("shift-arrow does not reach outer key handlers", () => {
    const onOuterKeyDown = vi.fn();
    render(
      <div onKeyDown={onOuterKeyDown}>
        <FilterSidebar
          types={typeFacets}
          activeType="all"
          repos={repoFacets}
          activeRepo="all"
          onType={vi.fn()}
          onRepo={vi.fn()}
          onBulkSnooze={vi.fn()}
          onBulkRhythm={vi.fn()}
          onBulkDone={vi.fn()}
          onBulkRead={vi.fn()}
        />
      </div>
    );
    const target = screen.getByRole("button", { name: "Filter by acme/web" });
    fireEvent.click(target, { ctrlKey: true });
    target.focus();
    fireEvent.keyDown(target, { key: "ArrowDown", shiftKey: true });
    expect(onOuterKeyDown).not.toHaveBeenCalled();
    fireEvent.keyDown(target, { key: "ArrowDown" });
    expect(onOuterKeyDown).toHaveBeenCalledTimes(1);
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
