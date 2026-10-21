/**
 * Compares the overall coverage of two runs.
 *
 * Usage: bun run scripts/compare-coverage.ts <baseline-summary.json> <head-summary.json>
 *
 * Three outcomes. Only a real drop blocks:
 *
 *   pass           the head is at or above the baseline
 *   fail           the head is below the baseline
 *   not evaluable  there is no figure to compare against
 *
 * The not evaluable case is expected. The first pull request that introduces
 * the suite has a merge base with no coverage configuration, so there is
 * nothing to measure.
 */
import { readFileSync, realpathSync } from "node:fs";
import { fileURLToPath } from "node:url";

export type RatchetStatus = "pass" | "fail" | "not-evaluable";

export interface RatchetResult {
  status: RatchetStatus;
  message: string;
  exitCode: number;
}

type Metric = { total: number; covered: number; pct: number | string };
interface FileSummary {
  lines: Metric;
  statements: Metric;
  functions: Metric;
  branches: Metric;
}
interface CoverageSummary {
  total: FileSummary;
  [file: string]: FileSummary | undefined;
}

function readSummary(path: string): CoverageSummary | null {
  try {
    return JSON.parse(readFileSync(path, "utf8")) as CoverageSummary;
  } catch {
    return null;
  }
}

/** The coverage tool writes "Unknown" for a metric that has no data at all. */
function asPercent(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value !== "Unknown") {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return null;
}

function overall(
  summary: CoverageSummary,
  metric: "lines" | "statements"
): number | null {
  return asPercent(summary.total?.[metric]?.pct);
}

/**
 * The directory every measured file shares.
 *
 * The coverage tool writes absolute paths, and the two runs happen in
 * different directories, so the paths have to be made relative before they
 * can be compared.
 */
function commonRoot(files: string[]): string {
  if (files.length === 0) return "";
  let prefix = files[0]!;
  for (const file of files) {
    while (!file.startsWith(prefix)) {
      const cut = prefix.lastIndexOf("/");
      if (cut <= 0) return "";
      prefix = prefix.slice(0, cut);
    }
  }
  return prefix;
}

/** The measured files, keyed by their path relative to the repository. */
function relativeFiles(summary: CoverageSummary): Map<string, FileSummary> {
  const files = Object.keys(summary).filter((file) => file !== "total");
  const root = commonRoot(files);
  const relative = new Map<string, FileSummary>();
  for (const file of files) {
    const key = root ? file.slice(root.length).replace(/^\//, "") : file;
    relative.set(key, summary[file]!);
  }
  return relative;
}

/**
 * The overall percentage over the files both runs measured.
 *
 * The two runs can disagree about which files count. The base has the
 * coverage list it shipped with, and a pull request can change that list. A
 * whole-run comparison would then move the number without any real change in
 * coverage, so only the shared files are compared.
 */
function overallOverCommonFiles(
  base: CoverageSummary,
  head: CoverageSummary
): { base: number; head: number } | null {
  const baseFiles = relativeFiles(base);
  const headFiles = relativeFiles(head);

  const shared = [...headFiles.keys()].filter((file) => baseFiles.has(file));
  if (shared.length === 0) return null;

  const totals = { baseCovered: 0, baseTotal: 0, headCovered: 0, headTotal: 0 };
  for (const file of shared) {
    const baseFile = baseFiles.get(file)!;
    const headFile = headFiles.get(file)!;
    totals.baseCovered += baseFile.lines.covered;
    totals.baseTotal += baseFile.lines.total;
    totals.headCovered += headFile.lines.covered;
    totals.headTotal += headFile.lines.total;
  }
  if (totals.baseTotal === 0 || totals.headTotal === 0) return null;

  return {
    base: (totals.baseCovered / totals.baseTotal) * 100,
    head: (totals.headCovered / totals.headTotal) * 100,
  };
}

function summaryWith(
  lines: number | string,
  statements: number | string = lines
): CoverageSummary {
  const metric = (pct: number | string) => ({
    total: 100,
    covered: typeof pct === "number" ? pct : 0,
    pct,
  });
  const file = {
    lines: metric(lines),
    statements: metric(statements),
    functions: metric(lines),
    branches: metric(lines),
  };
  return {
    total: file,
    // A per-file entry, so the comparison over the shared files has
    // something to work with.
    "lib/example.ts": file,
  };
}

/**
 * Compares two coverage summaries.
 *
 * The head's overall line coverage is compared against the baseline's. The
 * tool rounds percentages to two decimals, so comparing the rounded values
 * is exact and no tolerance is needed.
 */
export function compareCoverage(
  basePath: string,
  headPath: string
): RatchetResult {
  const head = readSummary(headPath);
  if (!head) {
    return {
      status: "not-evaluable",
      message: `no coverage summary at ${headPath}. The run produced no coverage.`,
      exitCode: 0,
    };
  }

  const headLines = overall(head, "lines");
  if (headLines === null) {
    return {
      status: "not-evaluable",
      message: `no overall line coverage in ${headPath}.`,
      exitCode: 0,
    };
  }

  const base = readSummary(basePath);
  if (!base) {
    return {
      status: "not-evaluable",
      message:
        `no baseline coverage summary at ${basePath}. ` +
        "The merge base has no coverage measurement to compare against.",
      exitCode: 0,
    };
  }

  const headStatements = overall(head, "statements");
  const baseStatements = overall(base, "statements");

  // The comparison is over the files both runs measured, so a change to the
  // coverage list cannot move the number on its own.
  const common = overallOverCommonFiles(base, head);
  if (common === null) {
    return {
      status: "not-evaluable",
      message:
        "the baseline and this run have no source file in common, " +
        "so there is nothing to compare.",
      exitCode: 0,
    };
  }

  const delta = Number((common.head - common.base).toFixed(4));

  const detail =
    `head lines ${common.head.toFixed(2)}% (statements ${headStatements}%), ` +
    `base lines ${common.base.toFixed(2)}% (statements ${baseStatements}%), ` +
    `delta ${delta > 0 ? "+" : ""}${delta}pp`;

  if (delta < 0) {
    return {
      status: "fail",
      message:
        `coverage dropped by ${Math.abs(delta)} percentage points against the merge base ` +
        `(${common.head.toFixed(2)}% vs ${common.base.toFixed(2)}%).`,
      exitCode: 1,
    };
  }

  return {
    status: "pass",
    message: `coverage is at or above the merge-base baseline (${common.head.toFixed(2)}% vs ${common.base.toFixed(2)}%). ${detail}`,
    exitCode: 0,
  };
}

function main(argv: string[]): number {
  const [basePath, headPath] = argv;
  if (!basePath || !headPath) {
    console.error(
      "usage: compare-coverage.ts <baseline-summary.json> <head-summary.json>"
    );
    return 2;
  }

  const result = compareCoverage(basePath, headPath);
  console.log(`coverage ratchet: ${result.status}`);
  console.log(result.message);
  if (result.status === "fail") {
    console.error("::error::Coverage fell below the merge-base baseline.");
  }
  return result.exitCode;
}

/**
 * Whether this module was started as a command rather than imported.
 *
 * The comparison must run when the file is invoked directly, because the
 * whole gate depends on the exit code. A loose name match can silently
 * decide the other way and the gate would exit zero without comparing
 * anything, so the paths are compared instead.
 */
function isDirectRun(): boolean {
  const entry = process.argv[1];
  if (!entry) return false;
  try {
    return realpathSync(entry) === realpathSync(fileURLToPath(import.meta.url));
  } catch {
    return false;
  }
}

if (isDirectRun()) {
  process.exit(main(process.argv.slice(2)));
}

export { main, summaryWith, isDirectRun };
