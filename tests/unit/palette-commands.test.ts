import { describe, expect, test } from "vitest";
import {
  ageEntries,
  dimensionEntries,
  ensureRepoEntries,
  filterListEntry,
  parsePaletteScope,
  qualifierEntries,
  repoEntry,
  SCOPE_PREFIX,
  stateEntries,
  staticEntries,
  stripScopePrefix,
  threadEntry,
  typeEntries,
} from "@/lib/palette-commands";

describe("palette static entries", () => {
  test("covers commands, navigation, and filters", () => {
    const entries = staticEntries();
    const sections = new Set(entries.map((e) => e.section));
    expect(sections.has("commands")).toBe(true);
    expect(sections.has("go")).toBe(true);
    expect(sections.has("filters")).toBe(true);
  });

  test("ids are unique", () => {
    const entries = staticEntries();
    expect(new Set(entries.map((e) => e.id)).size).toBe(entries.length);
  });

  test("navigation targets stay internal except GitHub links", () => {
    for (const e of staticEntries()) {
      if (e.action.type === "navigate") {
        expect(e.action.href.startsWith("/")).toBe(true);
      }
      if (e.action.type === "external") {
        expect(e.action.href.startsWith("https://github.com/")).toBe(true);
      }
    }
  });
});

describe("palette dynamic entries", () => {
  test("thread entry carries open-thread action", () => {
    const e = threadEntry({
      id: "t1",
      repositoryId: "r1",
      repositoryName: "acme/web",
      subject: "Fix CI",
      reason: "ci_failed",
    });
    expect(e.section).toBe("threads");
    expect(e.action).toEqual({ type: "thread", id: "t1", repositoryId: "r1" });
    expect(e.keywords).toContain("acme/web");
  });

  test("repo entry carries repo-filter action", () => {
    const e = repoEntry({ id: "r1", fullName: "acme/web" });
    expect(e.section).toBe("repos");
    expect(e.action).toEqual({ type: "repo-filter", repositoryId: "r1" });
    expect(e.title).toBe("acme/web");
    expect(e.subtitle).toBe("Select this repo");
  });
});

describe("palette repo scope", () => {
  test("plain queries search everything", () => {
    expect(parsePaletteScope("web")).toEqual({ scope: "all", term: "web" });
    expect(parsePaletteScope("")).toEqual({ scope: "all", term: "" });
  });

  test("hash and repo prefixes scope to repos", () => {
    expect(parsePaletteScope("repo:web")).toEqual({ scope: "repos", term: "web" });
    expect(parsePaletteScope("r:web")).toEqual({ scope: "repos", term: "web" });
    expect(parsePaletteScope("repo:")).toEqual({ scope: "repos", term: "" });
  });

  test("# stays a plain character so PR numbers keep working", () => {
    expect(parsePaletteScope("#web")).toEqual({ scope: "all", term: "#web" });
    expect(parsePaletteScope("bg#862")).toEqual({ scope: "all", term: "bg#862" });
    expect(parsePaletteScope("#")).toEqual({ scope: "all", term: "#" });
  });

  test("type, state, and age prefixes scope to those dimensions", () => {
    expect(parsePaletteScope("type:rel")).toEqual({ scope: "types", term: "rel" });
    expect(parsePaletteScope("state:un")).toEqual({ scope: "states", term: "un" });
    expect(parsePaletteScope("age:7d")).toEqual({ scope: "ages", term: "7d" });
    expect(parsePaletteScope("type:")).toEqual({ scope: "types", term: "" });
  });

  test("prefix matching is case-insensitive and trims", () => {
    expect(parsePaletteScope("REPO: acme")).toEqual({ scope: "repos", term: "acme" });
    expect(parsePaletteScope("TYPE: rel")).toEqual({ scope: "types", term: "rel" });
  });

  test("scope prefixes round-trip through strip", () => {
    expect(stripScopePrefix("repo:acme")).toBe("acme");
    expect(stripScopePrefix("type:rel")).toBe("rel");
    expect(stripScopePrefix("state:unread")).toBe("unread");
    expect(stripScopePrefix("age:7d")).toBe("7d");
    expect(stripScopePrefix("plain")).toBe("plain");
    // `#` is not a prefix: PR numbers survive the strip untouched.
    expect(stripScopePrefix("#acme")).toBe("#acme");
    expect(SCOPE_PREFIX).toEqual({
      repos: "repo:",
      types: "type:",
      states: "state:",
      ages: "age:",
    });
  });
});

describe("palette filter-list entry", () => {
  test("carries the handoff query and match count", () => {
    const e = filterListEntry("web", 3);
    expect(e.section).toBe("repos");
    expect(e.title).toContain("web");
    expect(e.subtitle).toContain("3 matching repositories");
    expect(e.action).toEqual({ type: "filter-list", query: "web" });
  });

  test("singular match count reads naturally", () => {
    const e = filterListEntry("web", 1);
    expect(e.subtitle).toContain("1 matching repository");
  });
});

describe("palette qualifier completion", () => {
  test("suggests the qualifier while it is being typed", () => {
    expect(qualifierEntries("r").map((e) => e.title)).toEqual(["repo:"]);
    expect(qualifierEntries("rep").map((e) => e.title)).toEqual(["repo:"]);
    expect(qualifierEntries("repo:").map((e) => e.title)).toEqual(["repo:"]);
    expect(qualifierEntries("t").map((e) => e.title)).toEqual(["type:"]);
    expect(qualifierEntries("type:").map((e) => e.title)).toEqual(["type:"]);
    expect(qualifierEntries("s").map((e) => e.title)).toEqual(["state:"]);
    expect(qualifierEntries("a").map((e) => e.title)).toEqual(["age:"]);
    for (const e of qualifierEntries("r")) {
      expect(e.section).toBe("syntax");
    }
    expect(qualifierEntries("repo:")[0]?.action).toEqual({ type: "qualifier", prefix: "repo:" });
  });

  test("stays out of the way for real queries", () => {
    for (const q of ["", "  ", "bg", "acme/web", "repo:bg", "type:release", "#", "bg#862", "r:"]) {
      expect(qualifierEntries(q)).toEqual([]);
    }
  });
});

describe("palette filter dimensions", () => {  test("state and age entries carry filter actions", () => {
    const states = stateEntries();
    expect(states).toHaveLength(3);
    expect(states[0]).toMatchObject({ title: "Unread" });
    expect(states[0]?.action).toEqual({ type: "filter", field: "state", value: "unread" });

    const ages = ageEntries();
    expect(ages).toHaveLength(8);
    expect(ages[0]).toMatchObject({ title: "All time" });
    expect(ages.find((e) => e.title === "Last 7 days")?.action).toEqual({
      type: "filter",
      field: "age",
      value: "7d",
    });
  });

  test("type entries mirror the server facets with counts", () => {
    const entries = typeEntries([
      { value: "all", label: "All types", count: 5 },
      { value: "release", label: "Release", count: 2 },
    ]);
    expect(entries).toHaveLength(2);
    expect(entries[1]).toMatchObject({
      title: "Release",
      subtitle: "2 items",
    });
    expect(entries[1]?.action).toEqual({ type: "filter", field: "type", value: "release" });
  });

  test("dimension entries show the current filter values", () => {
    const entries = dimensionEntries(
      { repo: "acme--web", state: "unread", type: "release", age: "7d" },
      [{ id: "acme--web", fullName: "acme/web" }],
      [{ value: "release", label: "Release" }]
    );
    expect(entries.map((e) => e.title)).toEqual(["Repository", "Type", "State", "Age"]);
    expect(entries.map((e) => e.subtitle)).toEqual([
      "Currently: acme/web",
      "Currently: Release",
      "Currently: Unread",
      "Currently: Last 7 days",
    ]);
    expect(entries[0]?.action).toEqual({ type: "dimension", dimension: "repo" });
  });

  test("dimension entries fall back to ids when nothing matches", () => {
    const entries = dimensionEntries(
      { repo: "all", state: "all", type: "all", age: "all" },
      [],
      []
    );
    expect(entries.map((e) => e.subtitle)).toEqual([
      "Currently: All repositories",
      "Currently: All types",
      "Currently: All open",
      "Currently: All time",
    ]);
  });
});

describe("ensureRepoEntries", () => {
  const repos = [
    { id: "acme--web", fullName: "acme/web" },
    { id: "other--docs", fullName: "other/docs" },
  ];
  const thread = threadEntry({
    id: "n_001",
    repositoryId: "acme--web",
    repositoryName: "acme/web",
    subject: "Fix flaky login redirect",
    reason: "mention",
  });

  test("empty terms pass through untouched", () => {
    expect(ensureRepoEntries([thread], "", repos)).toEqual([thread]);
  });

  test("present repos are not duplicated", () => {
    const ranked = [thread, repoEntry({ id: "acme--web", fullName: "acme/web" })];
    expect(ensureRepoEntries(ranked, "acme", repos)).toEqual(ranked);
  });

  test("missing top matches are spliced in after the repo hits", () => {
    const ranked = [thread, repoEntry({ id: "other--docs", fullName: "other/docs" })];
    const merged = ensureRepoEntries(ranked, "acme", repos);
    expect(merged.map((e) => e.id)).toEqual([
      "thread-n_001",
      "repo-other--docs",
      "repo-acme--web",
    ]);
  });

  test("missing matches append at the end when no repo ranked", () => {
    const merged = ensureRepoEntries([thread], "docs", repos);
    expect(merged.map((e) => e.id)).toEqual(["thread-n_001", "repo-other--docs"]);
  });
});
