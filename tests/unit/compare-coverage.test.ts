import { describe, expect, test } from "vitest";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { compareCoverage, summaryWith } from "@/scripts/compare-coverage";

function writeSummary(name: string, lines: number | string): string {
  const dir = mkdtempSync(join(tmpdir(), "ghn-coverage-"));
  const path = join(dir, name);
  writeFileSync(path, JSON.stringify(summaryWith(lines)));
  return path;
}

describe("the coverage ratchet", () => {
  test("coverage above the baseline passes", () => {
    const base = writeSummary("base.json", 60);
    const head = writeSummary("head.json", 65);
    const result = compareCoverage(base, head);
    expect(result.status).toBe("pass");
    expect(result.exitCode).toBe(0);
  });

  test("coverage equal to the baseline passes", () => {
    const base = writeSummary("base.json", 60);
    const head = writeSummary("head.json", 60);
    const result = compareCoverage(base, head);
    expect(result.status).toBe("pass");
    expect(result.exitCode).toBe(0);
  });

  test("coverage below the baseline fails", () => {
    const base = writeSummary("base.json", 60);
    const head = writeSummary("head.json", 59.99);
    const result = compareCoverage(base, head);
    expect(result.status).toBe("fail");
    expect(result.exitCode).toBe(1);
    expect(result.message).toContain("dropped");
  });

  test("a missing baseline is reported and does not block", () => {
    const head = writeSummary("head.json", 60);
    const result = compareCoverage(join(tmpdir(), "does-not-exist.json"), head);
    expect(result.status).toBe("not-evaluable");
    expect(result.exitCode).toBe(0);
    expect(result.message).toContain("no baseline coverage summary");
  });

  test("a missing head is reported and does not block", () => {
    const base = writeSummary("base.json", 60);
    const result = compareCoverage(base, join(tmpdir(), "does-not-exist.json"));
    expect(result.status).toBe("not-evaluable");
    expect(result.exitCode).toBe(0);
  });

  test("a summary with no overall figure is reported and does not block", () => {
    const dir = mkdtempSync(join(tmpdir(), "ghn-coverage-"));
    const path = join(dir, "empty.json");
    writeFileSync(path, JSON.stringify({ total: { lines: { pct: "Unknown" } } }));
    const base = writeSummary("base.json", 60);
    const result = compareCoverage(base, path);
    expect(result.status).toBe("not-evaluable");
    expect(result.exitCode).toBe(0);
  });

  test("a summary that is not readable at all is reported and does not block", () => {
    const dir = mkdtempSync(join(tmpdir(), "ghn-coverage-"));
    const path = join(dir, "broken.json");
    writeFileSync(path, "not json at all");
    const base = writeSummary("base.json", 60);
    const result = compareCoverage(base, path);
    expect(result.status).toBe("not-evaluable");
    expect(result.exitCode).toBe(0);
  });
});
