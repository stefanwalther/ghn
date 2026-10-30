import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { resetUIStore } from "@/lib/ui-store";
import HelpPage from "@/app/help/page";

/**
 * The help screen reads its topic from the route and writes the choice
 * back to it, so topics stay linkable.
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
  usePathname: () => "/help",
}));

beforeEach(() => {
  nav.params = new URLSearchParams("");
  localStorage.clear();
  sessionStorage.clear();
  resetUIStore();
  nav.replace.mockClear();
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

/**
 * Matches a tip row by its full rendered text. The tips interleave Kbd
 * and code elements mid-sentence, so no single text node holds the whole
 * sentence; matching the row's complete text is the honest assertion.
 */
function tipWith(text: string) {
  return (_content: string, element: Element | null) =>
    element?.tagName === "LI" && (element.textContent ?? "").includes(text);
}

describe("help screen", () => {
  test("lists the topics with the search guide first", () => {
    render(<HelpPage />);

    expect(screen.getByRole("button", { name: "Help topic: Universal search" })).toHaveAttribute("aria-current", "true");
    expect(screen.getByRole("button", { name: "Help topic: Filtering the inbox" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Help topic: Keyboard shortcuts" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Help topic: Digest and snooze" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Help topic: If something looks off" })).toBeInTheDocument();
  });

  test("shows the universal search tricks by default", () => {
    render(<HelpPage />);

    expect(screen.getByText(/tabs above the results/)).toBeInTheDocument();
    expect(screen.getByText(tipWith("belongs to the number"))).toBeInTheDocument();
  });

  test("switching topics swaps the guide and records the route", () => {
    render(<HelpPage />);

    fireEvent.click(screen.getByRole("button", { name: "Help topic: Keyboard shortcuts" }));

    expect(nav.replace).toHaveBeenCalledWith("/help?topic=shortcuts", { scroll: false });
  });

  test("an unknown topic falls back to the search guide", () => {
    nav.params = new URLSearchParams("topic=nope");

    render(<HelpPage />);

    expect(screen.getByText(/tabs above the results/)).toBeInTheDocument();
  });

  test("the shortcuts guide mirrors the shortcut list", () => {
    nav.params = new URLSearchParams("topic=shortcuts");

    render(<HelpPage />);

    expect(screen.getByText("Move down / up")).toBeInTheDocument();
    expect(screen.getByText("Repos only")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Navigate" })).toBeInTheDocument();
  });

  test("the troubleshooting guide names the disconnected fix", () => {
    nav.params = new URLSearchParams("topic=troubleshooting");

    render(<HelpPage />);

    expect(screen.getByText(/GitHub is disconnected/)).toBeInTheDocument();
    expect(screen.getByText(/gh auth login/)).toBeInTheDocument();
  });
});
