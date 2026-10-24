import { describe, expect, test } from "vitest";
import { unwrapDetails } from "@/lib/markdown";

describe("unwrapDetails", () => {
  test("summary becomes a bold heading and body stays", () => {
    expect(
      unwrapDetails("<details><summary>Commits</summary><ul><li>one</li></ul></details>")
    ).toBe("**Commits**\n\n<ul><li>one</li></ul>");
  });

  test("multiline blocks unwrap", () => {
    const input = ["<details>", "<summary>What's Changed</summary>", "body here", "</details>"].join(
      "\n"
    );
    expect(unwrapDetails(input)).toBe("**What's Changed**\n\nbody here");
  });

  test("plain markdown passes through", () => {
    expect(unwrapDetails("## Hi\n\n- one")).toBe("## Hi\n\n- one");
  });

  test("unclosed details pass through", () => {
    expect(unwrapDetails("<details><summary>oops</summary>")).toBe(
      "<details><summary>oops</summary>"
    );
  });

  test("open attribute unwraps", () => {
    expect(unwrapDetails("<details open><summary>T</summary>\nbody\n</details>")).toBe(
      "**T**\n\nbody"
    );
  });

  test("block markup inside summary becomes plain bold text", () => {
    expect(
      unwrapDetails("<details><summary><h3>Diagram</h3></summary>\n\n```mermaid\nA-->B\n```\n</details>")
    ).toBe("**Diagram**\n\n```mermaid\nA-->B\n```");
  });

  test("unterminated tag fragment in summary is removed", () => {
    expect(unwrapDetails("<details><summary>Hi <script</summary>\nbody\n</details>")).toBe(
      "**Hi**\n\nbody"
    );
  });

  test("bare less-than in summary is kept as text", () => {
    expect(unwrapDetails("<details><summary>a < b</summary>\nbody\n</details>")).toBe(
      "**a < b**\n\nbody"
    );
  });

  test("nested tag soup leaves no script fragment", () => {
    const label = unwrapDetails(
      "<details><summary>A <script<script>> B</summary>\nbody\n</details>"
    );
    expect(label).not.toContain("<script");
    expect(label).toBe("**A > B**\n\nbody");
  });
});
