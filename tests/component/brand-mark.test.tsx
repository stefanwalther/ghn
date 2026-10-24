import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { cleanup, screen } from "@testing-library/react";
import { BrandMark } from "@/components/brand-mark";
import { renderWithQuery } from "./support/render-with-query";

function stubConnection(body: object) {
  const fetchMock = vi.fn(async () => Response.json(body));
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

beforeEach(() => {
  localStorage.clear();
  sessionStorage.clear();
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("BrandMark", () => {
  test("shows a theme-colored dot when in sync", async () => {
    stubConnection({
      connected: true,
      lastSyncAt: Date.now(),
      pollIntervalSecs: 60,
    });
    const { container } = renderWithQuery(<BrandMark />);
    expect(
      await screen.findByRole("link", { name: /synced/ })
    ).toBeInTheDocument();
    const svgs = container.querySelectorAll("svg");
    expect(svgs).toHaveLength(2);
    expect(svgs[0]?.getAttribute("style")).toContain("var(--foreground)");
    expect(svgs[1]?.getAttribute("style")).toContain("var(--primary)");
    expect(svgs[1]?.querySelector("circle")).not.toBeNull();
  });

  test("shows a theme-colored ring when stale", async () => {
    stubConnection({
      connected: true,
      lastSyncAt: Date.now() - 60 * 60 * 1000,
      pollIntervalSecs: 60,
    });
    const { container } = renderWithQuery(<BrandMark />);
    expect(
      await screen.findByRole("link", { name: /stale/ })
    ).toBeInTheDocument();
    const svgs = container.querySelectorAll("svg");
    expect(svgs).toHaveLength(2);
    expect(svgs[1]?.getAttribute("style")).toContain("var(--primary)");
    expect(svgs[1]?.querySelector("circle")).not.toBeNull();
  });

  test("shows the working bar while syncing", async () => {
    vi.stubGlobal("fetch", vi.fn(() => new Promise<Response>(() => {})));
    const { container } = renderWithQuery(<BrandMark />);
    expect(
      await screen.findByRole("link", { name: /syncing/ })
    ).toBeInTheDocument();
    const svgs = container.querySelectorAll("svg");
    expect(svgs).toHaveLength(2);
    expect(svgs[1]?.getAttribute("style")).toContain("var(--primary)");
    expect(svgs[1]?.querySelector("rect")).not.toBeNull();
  });
});
