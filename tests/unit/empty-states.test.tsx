import { describe, expect, test } from "vitest";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import {
  EmptyInbox,
  ErrorInbox,
  ErrorRateLimits,
  ErrorRepositories,
  LoadingInbox,
  LoadingRateLimits,
  LoadingSettings,
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

describe("EmptyInbox follows the state filter", () => {
  test("unread is the default and keeps the original copy", () => {
    const html = renderToStaticMarkup(React.createElement(EmptyInbox, {}));
    expect(html).toContain("All caught up");
    expect(html).toContain("New digests appear here when due.");
  });

  test("all avoids the unread wording", () => {
    const html = renderToStaticMarkup(
      React.createElement(EmptyInbox, { state: "all" })
    );
    expect(html).toContain("Nothing here");
    expect(html).not.toContain("unread");
  });

  test("done points back at the unread inbox", () => {
    const html = renderToStaticMarkup(
      React.createElement(EmptyInbox, { state: "done" })
    );
    expect(html).toContain("Nothing finished yet");
    expect(html).toContain("unread inbox");
  });
});

describe("ErrorRepositories", () => {
  test("names repositories, not the inbox", () => {
    const html = renderToStaticMarkup(
      React.createElement(ErrorRepositories, { onRetry: () => {} })
    );
    expect(html).toContain("Repositories failed to load");
    expect(html).not.toContain("Inbox failed to load");
    expect(html).toContain("Retry");
  });
});

describe("LoadingSettings", () => {
  test("exposes a single status region with skeleton cards", () => {
    const html = renderToStaticMarkup(React.createElement(LoadingSettings));
    expect(html).toContain('role="status"');
    expect(html).toContain("Loading settings…");
    expect(html).toContain("animate-pulse");
  });
});
