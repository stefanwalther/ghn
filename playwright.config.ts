import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { defineConfig } from "@playwright/test";

/**
 * The end-to-end layer runs the assembled application against a local GitHub
 * stand-in. Nothing in the suite reaches the real GitHub, the maintainer's
 * database, or the maintainer's dev server.
 *
 * The ports sit a hundred above the workspace's dev port. The dev range is
 * 21120-21219, so the end-to-end pair never lands on a dev port, and two
 * worktrees never land on each other.
 */
const E2E_PORT_OFFSET = 100;

function resolveDevPort(): number {
  try {
    const out = execFileSync("./scripts/resolve-dev-runtime.sh", {
      encoding: "utf8",
      env: process.env,
    });
    for (const line of out.split("\n")) {
      const match = line.match(/^export WEB_PORT=(.+)$/);
      if (match?.[1]) return Number(match[1].replace(/^['"]|['"]$/g, ""));
    }
  } catch {
    // The resolver is unavailable without git. The legacy default is fine.
  }
  return 21120;
}

const devPort = resolveDevPort();

/** The application under test. */
export const APP_PORT = devPort + E2E_PORT_OFFSET;

/** The GitHub stand-in. */
export const STANDIN_PORT = devPort + E2E_PORT_OFFSET + 1;

export const APP_URL = `http://127.0.0.1:${APP_PORT}`;
export const STANDIN_URL = `http://127.0.0.1:${STANDIN_PORT}`;

/**
 * The instant the server reads as "now".
 *
 * The dataset, the age filters and the digest due dates are all relative to
 * it, so pinning it is what makes every count in the suite exact. The
 * timezone is pinned as well, because the "This year" filter is computed
 * against the local start of the year.
 */
export const E2E_NOW = "2026-01-15T12:00:00Z";

/** The credential the stand-in accepts. Any other value is rejected with 401. */
export const E2E_TOKEN = "e2e-stand-in-token";

/**
 * The isolated database, always outside the repository.
 *
 * The path is fixed so the server and every worker agree on it without
 * having to share state. The file is never deleted: the running server holds
 * an open handle, and unlinking it would leave the server reading the old
 * inode. `scripts/e2e-reset.ts` drops and recreates the tables in place
 * instead.
 */
export const E2E_DB_PATH = join(tmpdir(), "ghn-e2e", "e2e.db");

const isCI = !!process.env.CI;

export default defineConfig({
  testDir: "./tests/e2e",
  // The database is shared, so the checks run one at a time. A parallel
  // worker would reset the data another worker is reading.
  fullyParallel: false,
  workers: 1,
  forbidOnly: isCI,
  retries: isCI ? 1 : 0,
  timeout: 60_000,
  expect: { timeout: 10_000 },
  reporter: isCI ? [["list"], ["html", { open: "never" }]] : [["list"]],
  use: {
    baseURL: APP_URL,
    // The browser clock is not frozen, so nothing may assert on a rendered
    // relative time. The timezone and the locale are pinned anyway, so the
    // absolute timestamps the application renders are exact.
    timezoneId: "UTC",
    locale: "en-US",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  webServer: [
    {
      // The stand-in serves the same dataset the database is seeded with, so
      // a sync against it cannot change the dataset.
      command: "bun run tests/support/stand-in-server.ts",
      url: `${STANDIN_URL}/health`,
      env: {
        STANDIN_PORT: String(STANDIN_PORT),
        STANDIN_TOKEN: E2E_TOKEN,
        GHN_NOW: E2E_NOW,
        TZ: "UTC",
      },
      reuseExistingServer: !isCI,
      timeout: 60_000,
    },
    {
      // The reset seeds the isolated database, then the production server
      // starts against it. The build has to exist already: `make build`
      // before `make test-e2e`.
      command: `bun run scripts/e2e-reset.ts && PORT=${APP_PORT} bun run start`,
      url: APP_URL,
      env: {
        PORT: String(APP_PORT),
        GHN_DB_PATH: E2E_DB_PATH,
        GHN_NOW: E2E_NOW,
        GHN_TOKEN: E2E_TOKEN,
        GHN_API_BASE: STANDIN_URL,
        TZ: "UTC",
      },
      reuseExistingServer: !isCI,
      timeout: 120_000,
    },
  ],
});

/** The repository root, found by walking up from the working directory. */
export const E2E_REPO_ROOT = (() => {
  let dir = process.cwd();
  for (;;) {
    if (existsSync(join(dir, "scripts", "e2e-reset.ts"))) return dir;
    const parent = join(dir, "..");
    if (parent === dir) return process.cwd();
    dir = parent;
  }
})();
