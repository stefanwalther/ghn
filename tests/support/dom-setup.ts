import "@testing-library/jest-dom/vitest";
import { afterEach, beforeAll, vi } from "vitest";

/**
 * Stubs for the browser APIs that neither `happy-dom` nor `jsdom` implements.
 *
 * The inbox page reads `prefers-reduced-motion` on a render path, calls
 * `scrollIntoView` as soon as the status becomes ready, and reaches for the
 * clipboard and the window-opening APIs from its action handlers. Without
 * these stubs a check fails at mount rather than at the behaviour it is
 * meant to cover.
 */
beforeAll(() => {
  if (typeof window.matchMedia !== "function") {
    Object.defineProperty(window, "matchMedia", {
      writable: true,
      value: (query: string) => ({
        matches: false,
        media: query,
        onchange: null,
        addListener: () => {},
        removeListener: () => {},
        addEventListener: () => {},
        removeEventListener: () => {},
        dispatchEvent: () => false,
      }),
    });
  }

  Element.prototype.scrollIntoView = function scrollIntoView() {};

  window.open = (() => null) as typeof window.open;
  window.scrollTo = (() => {}) as typeof window.scrollTo;

  if (!navigator.clipboard) {
    Object.defineProperty(navigator, "clipboard", {
      writable: true,
      configurable: true,
      value: { writeText: vi.fn().mockResolvedValue(undefined) },
    });
  }
});

afterEach(() => {
  vi.clearAllMocks();
});
