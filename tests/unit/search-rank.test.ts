import { describe, expect, test } from "vitest";
import { fuzzyScore, multiScore, rankSearch } from "@/lib/search";

describe("fuzzyScore", () => {
  test("empty query matches everything", () => {
    expect(fuzzyScore("", "anything")).toBe(0);
  });

  test("substring ranks higher than scattered subsequence", () => {
    const sub = fuzzyScore("notif", "github notifications");
    const scattered = fuzzyScore("ntf", "github notifications");
    expect(sub).toBeGreaterThan(scattered);
  });

  test("non-subsequence returns -1", () => {
    expect(fuzzyScore("zzz", "inbox")).toBe(-1);
  });

  test("prefix beats late match", () => {
    const early = fuzzyScore("rep", "repos settings");
    const late = fuzzyScore("rep", "prepare release");
    expect(early).toBeGreaterThan(late);
  });

  test("case-insensitive", () => {
    expect(fuzzyScore("GITHUB", "github")).toBeGreaterThan(-1);
  });
});

describe("multiScore", () => {
  test("every token must match", () => {
    expect(multiScore("acme pr", ["acme/web Fix PR", "other"])).toBeGreaterThan(-1);
    expect(multiScore("acme zzz", ["acme/web Fix PR"])).toBe(-1);
  });

  test("empty query scores zero", () => {
    expect(multiScore("   ", ["a"])).toBe(0);
  });
});

describe("rankSearch", () => {
  const items = [
    { title: "Fix CI failure", repo: "acme/web" },
    { title: "Release v2", repo: "acme/api" },
    { title: "Docs update", repo: "acme/web" },
  ];
  const hay = (i: (typeof items)[number]) => [i.title, i.repo];

  test("empty query returns head", () => {
    expect(rankSearch("", items, hay)).toHaveLength(3);
  });

  test("ranks best match first", () => {
    const out = rankSearch("release", items, hay);
    expect(out[0].item.title).toBe("Release v2");
  });

  test("multi-token narrows to items matching all tokens", () => {
    const out = rankSearch("acme fix", items, hay);
    expect(out.map((r) => r.item.title)).toEqual(["Fix CI failure"]);
  });

  test("no match returns empty", () => {
    expect(rankSearch("zzz-nope", items, hay)).toEqual([]);
  });

  test("respects limit", () => {
    const out = rankSearch("", items, hay, 2);
    expect(out).toHaveLength(2);
  });
});
