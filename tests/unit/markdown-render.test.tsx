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
