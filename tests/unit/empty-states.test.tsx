import { describe, expect, test } from "vitest";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import {
  ErrorInbox,
  ErrorRateLimits,
  LoadingInbox,
  LoadingRateLimits,
} from "@/components/inbox/empty-states";

describe("LoadingRateLimits", () => {
  test("names the rate-limits view, not the inbox", () => {
    const html = renderToStaticMarkup(React.createElement(LoadingRateLimits));
    expect(html).toContain("Loading rate limits…");
    expect(html).not.toContain("Loading inbox");
  });

  test("exposes a single status region with skeleton cards", () => {
    const html = renderToStaticMarkup(React.createElement(LoadingRateLimits));
    expect(html).toContain('role="status"');
    expect(html).toContain("animate-pulse");
  });
});

describe("ErrorRateLimits", () => {
  test("names the rate-limits view, not the inbox", () => {
    const html = renderToStaticMarkup(
      React.createElement(ErrorRateLimits, { onRetry: () => {} })
    );
    expect(html).toContain("Rate limits failed to load");
    expect(html).not.toContain("Inbox failed to load");
    expect(html).toContain("Retry");
  });
});

describe("Inbox states stay untouched", () => {
  test("LoadingInbox still names the inbox", () => {
    const html = renderToStaticMarkup(React.createElement(LoadingInbox));
    expect(html).toContain("Loading inbox…");
  });

  test("ErrorInbox still names the inbox", () => {
    const html = renderToStaticMarkup(
      React.createElement(ErrorInbox, { onRetry: () => {} })
    );
    expect(html).toContain("Inbox failed to load");
  });
});
