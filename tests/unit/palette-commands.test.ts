import { describe, expect, test } from "vitest";
import {
  repoEntry,
  staticEntries,
  threadEntry,
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
        expect(e.action.href.startsWith("https://github.com")).toBe(true);
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
  });
});
