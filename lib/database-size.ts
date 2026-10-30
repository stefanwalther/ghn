import fs from "node:fs";

/**
 * Total on-disk size of the SQLite database, including WAL sidecar files
 * (`-wal`/`-shm`) when present. Returns null when no database file exists yet.
 *
 * Lives here instead of the settings route module: Next.js route files may
 * only export request handlers and route config, so a helper exported from
 * `app/api/settings/route.ts` fails `next build` route validation.
 */
export function getDatabaseSizeBytes(databasePath: string): number | null {
  let total = 0;
  let found = false;
  for (const suffix of ["", "-wal", "-shm"]) {
    try {
      const stat = fs.statSync(`${databasePath}${suffix}`);
      if (stat.isFile()) {
        total += stat.size;
        found = true;
      }
    } catch {
      // Missing sidecar files are normal; ignore.
    }
  }
  return found ? total : null;
}
