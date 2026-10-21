import { describe, expect, test } from "vitest";
import { remarkPrAutolinks } from "@/lib/markdown";

interface MdNode {
  type: string;
  value?: string;
  url?: string;
  children?: MdNode[];
}

const BASE = "https://github.com/acme/web";
const SHA = "0123456789abcdef0123456789abcdef01234567";

function text(value: string): MdNode {
  return { type: "text", value };
}

function paragraph(...children: MdNode[]): MdNode {
  return { type: "paragraph", children };
}

function autolink(tree: MdNode, repositoryUrl = BASE): MdNode {
  remarkPrAutolinks({ repositoryUrl })(tree);
  return tree;
}

describe("the pull request autolinks", () => {
  // An issue reference becomes a link to that issue in the same repository.
  test("an issue reference becomes a link to the issue", () => {
    const tree = autolink({ type: "root", children: [paragraph(text("fixes #12"))] });
    expect(tree.children?.[0]?.children).toEqual([
      { type: "text", value: "fixes " },
      {
        type: "link",
        url: `${BASE}/issues/12`,
        children: [{ type: "text", value: "#12" }],
      },
    ]);
  });

  // A commit hash becomes a link to that commit, shortened to the short
  // hash as the link text.
  test("a commit hash becomes a short link to the commit", () => {
    const tree = autolink({ type: "root", children: [paragraph(text(`see ${SHA}`))] });
    expect(tree.children?.[0]?.children).toEqual([
      { type: "text", value: "see " },
      {
        type: "link",
        url: `${BASE}/commit/${SHA}`,
        children: [{ type: "text", value: SHA.slice(0, 7) }],
      },
    ]);
  });

  // The repository url is the base of every link, and its trailing slash
  // must not double up in the link.
  test("the repository url loses its trailing slash", () => {
    const tree = autolink(
      { type: "root", children: [paragraph(text("fixes #12"))] },
      `${BASE}/`
    );
    expect(tree.children?.[0]?.children?.[1]?.url).toBe(`${BASE}/issues/12`);
  });

  // A reference that is part of a word is not a reference.
  test("a reference that is part of a word is left alone", () => {
    const tree = autolink({ type: "root", children: [paragraph(text("issue#12"))] });
    expect(tree.children?.[0]?.children).toEqual([text("issue#12")]);
  });

  // A reference that runs into a word is not a reference either.
  test("a reference followed by a word character is left alone", () => {
    const tree = autolink({ type: "root", children: [paragraph(text("#12abc"))] });
    expect(tree.children?.[0]?.children).toEqual([text("#12abc")]);
  });

  // A commit hash that is not preceded by a separator is part of a word.
  test("a commit hash without a separator in front is left alone", () => {
    const tree = autolink({ type: "root", children: [paragraph(text(`abc${SHA}`))] });
    expect(tree.children?.[0]?.children).toEqual([text(`abc${SHA}`)]);
  });

  // The text after the last reference is kept as text.
  test("the text after the last reference is kept", () => {
    const tree = autolink({ type: "root", children: [paragraph(text("#12 done"))] });
    expect(tree.children?.[0]?.children).toEqual([
      {
        type: "link",
        url: `${BASE}/issues/12`,
        children: [{ type: "text", value: "#12" }],
      },
      { type: "text", value: " done" },
    ]);
  });

  // Text with no reference at all is passed through unchanged.
  test("text without a reference is passed through", () => {
    const tree = autolink({ type: "root", children: [paragraph(text("nothing here"))] });
    expect(tree.children?.[0]?.children).toEqual([text("nothing here")]);
  });

  // A code span is the author's own text, so it is not rewritten.
  test("a code span is not rewritten", () => {
    const tree = autolink({
      type: "root",
      children: [paragraph({ type: "inlineCode", value: "#12" })],
    });
    expect(tree.children?.[0]?.children).toEqual([
      { type: "inlineCode", value: "#12" },
    ]);
  });

  // A link the author wrote is the author's own text as well.
  test("an existing link is not rewritten", () => {
    const link: MdNode = {
      type: "link",
      url: "https://example.com/#12",
      children: [text("#12")],
    };
    const tree = autolink({ type: "root", children: [paragraph(link)] });
    expect(tree.children?.[0]?.children).toEqual([link]);
  });

  // A node without children has nothing to rewrite.
  test("a node without children is left alone", () => {
    const tree = autolink({ type: "root" });
    expect(tree.children).toBeUndefined();
  });
});
