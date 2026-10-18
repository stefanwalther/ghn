import { describe, expect, test } from "bun:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { Markdown } from "@/components/inbox/markdown";

describe("Markdown images", () => {
  test("badge images stay inline with text", () => {
    const html = renderToStaticMarkup(
      React.createElement(Markdown, {
        text: '- <img alt="P1" src="https://example.test/p1.svg" align="top">&nbsp;**Title**',
      })
    );
    expect(html).toContain("display:inline-block");
    expect(html).not.toContain("display:block");
  });

  test("content images stay within the drawer", () => {
    const html = renderToStaticMarkup(
      React.createElement(Markdown, { text: "![alt](https://example.test/big.png)" })
    );
    expect(html).toContain("max-width:100%");
  });
});

describe("Markdown PR autolinks", () => {
  const repo = "https://github.com/acme/web";

  test("bare issue refs link into the repo", () => {
    const html = renderToStaticMarkup(
      React.createElement(Markdown, { text: "Fixes #4489", repositoryUrl: repo })
    );
    expect(html).toContain(`href="${repo}/issues/4489"`);
    expect(html).toContain("#4489");
  });

  test("full SHAs link short to the commit", () => {
    const sha = "0123456789abcdef0123456789abcdef01234567";
    const html = renderToStaticMarkup(
      React.createElement(Markdown, { text: `Landed in ${sha}`, repositoryUrl: repo })
    );
    expect(html).toContain(`href="${repo}/commit/${sha}"`);
    expect(html).toContain(">0123456<");
  });

  test("code spans and authored links stay untouched", () => {
    const html = renderToStaticMarkup(
      React.createElement(Markdown, {
        text: "`#4489` and [#4489](https://example.test/other)",
        repositoryUrl: repo,
      })
    );
    expect(html).toContain("<code");
    expect(html).not.toContain(`${repo}/issues/4489`);
    expect(html).toContain('href="https://example.test/other"');
  });

  test("no repo means no autolinks", () => {
    const html = renderToStaticMarkup(React.createElement(Markdown, { text: "Fixes #4489" }));
    expect(html).not.toContain("/issues/4489");
  });
});
