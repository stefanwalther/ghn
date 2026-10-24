import { render, screen, fireEvent } from "@testing-library/react";
import { describe, expect, test, vi, afterEach } from "vitest";
import { ContributionsChip } from "@/components/contributions-chip";

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

function mockFetch(days: { date: string; count: number }[]) {
  (globalThis as Record<string, unknown>).fetch = vi.fn((url: unknown) => {
    const u = String(url);
    if (u.includes("?days=180")) {
      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve({ days, cached: false, login: "someone" }),
      });
    }
    return Promise.resolve({ ok: true, json: () => Promise.resolve({ count: 84, login: "someone" }) });
  });
}

describe("contributions heatmap overlay", () => {
  test("hover loads 180 days and renders one cell per day plus legend", async () => {
    const days = Array.from({ length: 180 }, (_, i) => {
      const base = Date.parse("2026-10-23T00:00:00Z") - (179 - i) * 86400000;
      return { date: new Date(base).toISOString().slice(0, 10), count: i % 7 };
    });
    mockFetch(days);
    render(<ContributionsChip />);
    expect(await screen.findByText("84 today")).toBeTruthy();

    fireEvent.mouseEnter(screen.getByText("84 today"));
    expect(await screen.findByText("Last 180 days")).toBeTruthy();
    const expectedTotal = days.reduce((s, d) => s + d.count, 0);
    expect(screen.getByText(`${expectedTotal} contributions`)).toBeTruthy();

    // 180 day cells have per-day tooltips; pad cells have none
    const cells = document.querySelectorAll('span[title*="contribution"]');
    expect(cells.length).toBe(180);

    // weekday labels + month labels + legend + range all render
    expect(screen.getByText("Mon")).toBeTruthy();
    expect(screen.getByText("Wed")).toBeTruthy();
    expect(screen.getByText("Fri")).toBeTruthy();
    expect(screen.getByText("Less", { exact: false })).toBeTruthy();
    expect(screen.getByText("More", { exact: false })).toBeTruthy();

    // single-column leading month is skipped so labels never collide
    // (180 days ending Oct 23 start Apr 27, a single-column April)
    expect(screen.queryByText("Apr")).toBeNull();
    expect(screen.getByText("May")).toBeTruthy();
    expect(screen.getByText("Jun")).toBeTruthy();
    expect(screen.getByText("Jul")).toBeTruthy();
    expect(screen.getByText("Aug")).toBeTruthy();
    expect(screen.getByText("Sep")).toBeTruthy();
    expect(screen.getByText("Oct")).toBeTruthy();

    // cells use GitHub palette classes
    const html = document.body.innerHTML;
    expect(html).toContain("bg-[#eff2f5]");
    expect(html).toContain("dark:bg-[#151b23]");
  });
});
