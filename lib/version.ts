/**
 * Semantic-version comparison for the update check.
 *
 * Only the numeric core is compared; a pre-release suffix makes a version
 * older than the same core without one. Build metadata is ignored.
 */

interface ParsedVersion {
  numbers: number[];
  prerelease: string | null;
}

export function parseVersionTag(input: string): ParsedVersion {
  const normalized = normalizeVersionTag(input);
  const withoutBuild = normalized.split("+")[0] ?? "";
  const [core, ...preParts] = withoutBuild.split("-");
  const numbers = (core ?? "")
    .trim()
    .replace(/^v/i, "")
    .split(".")
    .filter((part) => part.length > 0)
    .map((part) => {
      const n = Number.parseInt(part, 10);
      return Number.isNaN(n) ? 0 : n;
    });
  const prerelease = preParts.length > 0 ? preParts.join("-") : null;
  return { numbers, prerelease };
}

function compareNumbers(a: number[], b: number[]): number {
  const length = Math.max(a.length, b.length);
  for (let i = 0; i < length; i += 1) {
    const left = a[i] ?? 0;
    const right = b[i] ?? 0;
    if (left !== right) return left < right ? -1 : 1;
  }
  return 0;
}

/** Negative when a < b, positive when a > b, zero when equal. */
export function compareVersions(a: string, b: string): number {
  const left = parseVersionTag(a);
  const right = parseVersionTag(b);
  const order = compareNumbers(left.numbers, right.numbers);
  if (order !== 0) return order;
  if (left.prerelease === right.prerelease) return 0;
  // A release outranks the same core with a pre-release suffix.
  if (left.prerelease === null) return 1;
  if (right.prerelease === null) return -1;
  return left.prerelease < right.prerelease ? -1 : 1;
}

/** True when `latest` is a newer release than `current`. */
export function isNewerVersion(current: string, latest: string): boolean {
  if (!current.trim() || !latest.trim()) return false;
  return compareVersions(current, latest) < 0;
}

/** Strips prefixes like `v` or `ghn-v` and surrounding whitespace for display. */
export function normalizeVersionTag(tag: string): string {
  const trimmed = tag.trim();
  const match = trimmed.match(/\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?/);
  if (match?.[0]) return match[0];
  return trimmed.replace(/^v/i, "");
}
