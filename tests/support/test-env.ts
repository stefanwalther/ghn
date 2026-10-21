import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

/**
 * Sets environment variables for the duration of one check and restores the
 * previous values afterwards.
 *
 * The seams are ambient by design, so every check that changes one has to
 * put it back, or the next check in the same file inherits it.
 */
export function withEnv(vars: Record<string, string | undefined>): () => void {
  const prior = new Map<string, string | undefined>();
  for (const [key, value] of Object.entries(vars)) {
    prior.set(key, process.env[key]);
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
  return () => {
    for (const [key, value] of prior) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  };
}

/** Pins the application's clock to a fixed instant for the duration. */
export function pinnedNow(ms: number): () => void {
  return withEnv({ GHN_NOW: String(ms) });
}

/**
 * A database path in a fresh temporary directory.
 *
 * Always outside the repository, so a check can never open or delete the
 * maintainer's own data.
 */
export function tempDbPath(label: string): string {
  const dir = mkdtempSync(join(tmpdir(), "ghn-test-"));
  return join(dir, `${label}.db`);
}

/** Removes a directory created by `tempDbPath`. */
export function removeTempDir(path: string): void {
  const dir = path.slice(0, path.lastIndexOf("/"));
  rmSync(dir, { recursive: true, force: true });
}
