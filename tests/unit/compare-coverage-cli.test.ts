import { describe, expect, test } from "vitest";
import { execFileSync } from "node:child_process";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

/**
 * The gate's exit code.
 *
 * The whole coverage gate depends on the process exiting non-zero when
 * coverage dropped. The comparison logic is checked elsewhere, so what is
 * pinned here is that the command actually runs and returns the right status.
 */

const SCRIPT = join(process.cwd(), "scripts/compare-coverage.ts");

interface FileCounts {
  covered: number;
  total: number;
}

function summaryFor(files: Record<string, FileCounts>) {
  const entries = Object.entries(files).map(([file, counts]) => [
    file,
    {
      lines: { ...counts, pct: (counts.covered / counts.total) * 100 },
      statements: { ...counts, pct: (counts.covered / counts.total) * 100 },
      functions: { ...counts, pct: (counts.covered / counts.total) * 100 },
      branches: { ...counts, pct: (counts.covered / counts.total) * 100 },
    },
  ]);
  const totals = Object.values(files).reduce(
    (sum, counts) => ({
      covered: sum.covered + counts.covered,
      total: sum.total + counts.total,
    }),
    { covered: 0, total: 0 }
  );
  const pct = totals.total === 0 ? 0 : (totals.covered / totals.total) * 100;
  return JSON.stringify({
    total: {
      lines: { ...totals, pct },
      statements: { ...totals, pct },
      functions: { ...totals, pct },
      branches: { ...totals, pct },
    },
    ...Object.fromEntries(entries),
  });
}

function run(args: string[]): { status: number; output: string } {
  try {
    const output = execFileSync("bun", ["run", SCRIPT, ...args], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    });
    return { status: 0, output };
  } catch (error) {
    const err = error as { status?: number; stdout?: string; stderr?: string };
    return {
      status: err.status ?? 1,
      output: `${err.stdout ?? ""}${err.stderr ?? ""}`,
    };
  }
}

function writeSummary(name: string, files: Record<string, FileCounts>) {
  // A directory of its own, so nothing outside it is ever touched.
  const dir = mkdtempSync(join(tmpdir(), "ghn-ratchet-"));
  const path = join(dir, name);
  writeFileSync(path, summaryFor(files));
  return path;
}

describe("the coverage gate command", () => {
  test("coverage at or above the baseline exits zero", () => {
    const base = writeSummary("base.json", { "lib/a.ts": { covered: 50, total: 100 } });
    const head = writeSummary("head.json", { "lib/a.ts": { covered: 60, total: 100 } });

    const result = run([base, head]);

    expect(result.status).toBe(0);
    expect(result.output).toContain("coverage ratchet: pass");
  });

  test("coverage below the baseline exits non-zero", () => {
    const base = writeSummary("base.json", { "lib/a.ts": { covered: 50, total: 100 } });
    const head = writeSummary("head.json", { "lib/a.ts": { covered: 40, total: 100 } });

    const result = run([base, head]);

    expect(result.status).toBe(1);
    expect(result.output).toContain("coverage ratchet: fail");
  });

  // A file that goes from fully covered to not covered at all has to fail
  // the gate, even when the overall number does not move.
  test("a file that loses its coverage fails the gate", () => {
    const base = writeSummary("base.json", {
      "lib/a.ts": { covered: 100, total: 100 },
      "lib/b.ts": { covered: 0, total: 100 },
    });
    const head = writeSummary("head.json", {
      "lib/a.ts": { covered: 0, total: 100 },
      "lib/b.ts": { covered: 0, total: 100 },
    });

    const result = run([base, head]);

    expect(result.status).toBe(1);
  });

  // The two runs can measure a different set of files. The comparison is
  // over the files they share, so a change to the list cannot move the
  // number on its own.
  test("a file only the head measures does not move the comparison", () => {
    const base = writeSummary("base.json", { "lib/a.ts": { covered: 50, total: 100 } });
    const head = writeSummary("head.json", {
      "lib/a.ts": { covered: 50, total: 100 },
      "lib/new.ts": { covered: 0, total: 100 },
    });

    const result = run([base, head]);

    expect(result.status).toBe(0);
  });

  test("a missing baseline is reported and does not block", () => {
    const head = writeSummary("head.json", { "lib/a.ts": { covered: 50, total: 100 } });
    const missing = join(mkdtempSync(join(tmpdir(), "ghn-ratchet-")), "absent.json");

    const result = run([missing, head]);

    expect(result.status).toBe(0);
    expect(result.output).toContain("not-evaluable");
  });

  test("no arguments exits with the usage status", () => {
    const result = run([]);

    expect(result.status).toBe(2);
    expect(result.output).toContain("usage:");
  });
});
