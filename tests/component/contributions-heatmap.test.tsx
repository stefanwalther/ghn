import { render, screen, fireEvent, within, cleanup } from "@testing-library/react";
import { describe, expect, test, vi, afterEach } from "vitest";
import { ContributionsChip } from "@/components/contributions-chip";

afterEach(() => {
  cleanup();
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

    // 180 day cells render without native title tooltips (instant shadcn tooltips instead); pad cells have no marker
    const cells = document.querySelectorAll("span[data-day-cell]");
    expect(cells.length).toBe(180);
    expect(document.querySelector('span[title*="contribution"]')).toBeNull();

    // hovering a day cell shows its tooltip instantly (no native delay);
    // fixture day 0 is Apr 27 with count 0
    const firstCell = cells[0] as HTMLElement;
    fireEvent.pointerEnter(firstCell, { pointerType: "mouse" });
    fireEvent.mouseOver(firstCell);
    fireEvent.focus(firstCell);
    expect(
      await screen.findByText("Apr 27: 0 contributions", undefined, { timeout: 3000 })
    ).toBeTruthy();

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

  test("click toggles the overlay for touch and keyboard users", async () => {
    mockFetch([]);
    render(<ContributionsChip />);
    const trigger = await screen.findByRole("button", { name: /GitHub contributions/ });
    expect(trigger).toHaveAttribute("aria-expanded", "false");

    fireEvent.click(trigger);
    expect(await screen.findByRole("region", { name: "Contributions in the last 180 days" })).toBeTruthy();
    expect(trigger).toHaveAttribute("aria-expanded", "true");

    fireEvent.click(trigger);
    expect(screen.queryByRole("region", { name: "Contributions in the last 180 days" })).toBeNull();
    expect(trigger).toHaveAttribute("aria-expanded", "false");
  });

  test("a click right after hover keeps the overlay open", async () => {
    mockFetch([]);
    render(<ContributionsChip />);
    const trigger = await screen.findByRole("button", { name: /GitHub contributions/ });

    fireEvent.mouseEnter(trigger);
    expect(await screen.findByRole("region", { name: "Contributions in the last 180 days" })).toBeTruthy();

    fireEvent.click(trigger);
    expect(screen.getByRole("region", { name: "Contributions in the last 180 days" })).toBeTruthy();
    expect(trigger).toHaveAttribute("aria-expanded", "true");
  });

  test("the profile link shows even when the graph days fail to load", async () => {
    (globalThis as Record<string, unknown>).fetch = vi.fn((url: unknown) => {
      const u = String(url);
      if (u.includes("?days=180")) {
        return Promise.resolve({ ok: false, json: () => Promise.resolve(null) });
      }
      return Promise.resolve({ ok: true, json: () => Promise.resolve({ count: 84, login: "someone" }) });
    });
    render(<ContributionsChip />);
    const trigger = await screen.findByRole("button", { name: /GitHub contributions/ });
    fireEvent.click(trigger);

    const region = await screen.findByRole("region", { name: "Contributions in the last 180 days" });
    expect(within(region).getByText("Contributions unavailable (offline or not signed in).")).toBeTruthy();
    expect(within(region).getByRole("link", { name: /Full graph on github\.com\/someone/ })).toBeTruthy();
  });

  test("Escape closes the overlay and returns focus to the trigger", async () => {
    mockFetch([]);
    render(<ContributionsChip />);
    const trigger = await screen.findByRole("button", { name: /GitHub contributions/ });
    fireEvent.click(trigger);
    expect(await screen.findByRole("region", { name: "Contributions in the last 180 days" })).toBeTruthy();

    fireEvent.keyDown(document, { key: "Escape", bubbles: true });
    expect(screen.queryByRole("region", { name: "Contributions in the last 180 days" })).toBeNull();
    expect(trigger).toHaveFocus();
  });
});
