import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { act, cleanup, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { CommandPalette } from "@/components/search/command-palette";
import { resetUIStore, useUIStore } from "@/lib/ui-store";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: vi.fn(), push: vi.fn(), back: vi.fn() }),
  useSearchParams: () => new URLSearchParams(""),
  usePathname: () => "/",
}));

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
  ],
  collapsedSection: [],
  facets: { types: [], repos: [] },
};

const repositoriesPayload = {
  repositories: [{ id: "acme--web", fullName: "acme/web" }],
};

function installFetch() {
  const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
    const url = String(input);
    if (url.startsWith("/api/notifications")) {
      return Response.json(notificationsPayload);
    }
    if (url.startsWith("/api/repositories")) {
      return Response.json(repositoriesPayload);
    }
    return Response.json({});
  });
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

describe("command palette cache", () => {
  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
    resetUIStore();
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  test("reopening within the freshness window issues no new fetches", async () => {
    const fetchMock = installFetch();
    const client = new QueryClient({
      defaultOptions: {
        queries: {
          retry: false,
          staleTime: 30_000,
          gcTime: 5 * 60_000,
          refetchOnWindowFocus: false,
          refetchOnReconnect: false,
        },
        mutations: { retry: false },
      },
    });
    const callsTo = (url: string) =>
      fetchMock.mock.calls.filter(([input]) => String(input) === url);

    render(
      <QueryClientProvider client={client}>
        <CommandPalette />
      </QueryClientProvider>
    );

    act(() => {
      useUIStore.getState().openPalette();
    });
    expect(await screen.findByText("Fix flaky login redirect")).toBeInTheDocument();
    expect(await screen.findByText("acme/web")).toBeInTheDocument();
    expect(callsTo("/api/notifications?state=all&limit=400")).toHaveLength(1);
    expect(callsTo("/api/repositories")).toHaveLength(1);

    act(() => {
      useUIStore.getState().closePalette();
    });
    expect(screen.queryByRole("dialog", { name: "Search and commands" })).not.toBeInTheDocument();

    act(() => {
      useUIStore.getState().openPalette();
    });
    expect(await screen.findByText("Fix flaky login redirect")).toBeInTheDocument();

    await waitFor(() => {
      expect(callsTo("/api/notifications?state=all&limit=400")).toHaveLength(1);
      expect(callsTo("/api/repositories")).toHaveLength(1);
    });
  });
});
