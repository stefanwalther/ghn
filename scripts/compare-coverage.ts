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
import { readFileSync } from "node:fs";

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

function summaryWith(
  lines: number | string,
  statements: number | string = lines
): CoverageSummary {
  const metric = (pct: number | string) => ({
    total: 100,
    covered: typeof pct === "number" ? pct : 0,
    pct,
  });
  return {
    total: {
      lines: metric(lines),
      statements: metric(statements),
      functions: metric(lines),
      branches: metric(lines),
    },
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

  const baseLines = overall(base, "lines");
  if (baseLines === null) {
    return {
      status: "not-evaluable",
      message: `the baseline at ${basePath} has no overall line coverage.`,
      exitCode: 0,
    };
  }

  const headStatements = overall(head, "statements");
  const baseStatements = overall(base, "statements");
  const delta = Number((headLines - baseLines).toFixed(4));

  const detail =
    `head lines ${headLines}% (statements ${headStatements}%), ` +
    `base lines ${baseLines}% (statements ${baseStatements}%), ` +
    `delta ${delta > 0 ? "+" : ""}${delta}pp`;

  if (delta < 0) {
    return {
      status: "fail",
      message:
        `coverage dropped by ${Math.abs(delta)} percentage points against the merge base ` +
        `(${headLines}% vs ${baseLines}%).`,
      exitCode: 1,
    };
  }

  return {
    status: "pass",
    message: `coverage is at or above the merge-base baseline (${headLines}% vs ${baseLines}%). ${detail}`,
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

const isDirectRun =
  typeof process.argv[1] === "string" &&
  import.meta.url.endsWith(process.argv[1].split("/").pop() ?? "\u0000");

if (isDirectRun) {
  process.exit(main(process.argv.slice(2)));
}

export { main, summaryWith };
