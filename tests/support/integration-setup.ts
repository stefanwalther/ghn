import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll } from "vitest";

/**
 * Per-file setup for the integration layer.
 *
 * Every test file gets its own database file and its own frozen clock, so
 * the checks in one file cannot see the leftovers of another and the
 * dataset is identical on every run.
 */
const dir = mkdtempSync(join(tmpdir(), "ghn-integration-"));

process.env.GHN_DB_PATH = join(dir, "integration.db");
process.env.GHN_NOW = "2026-01-15T12:00:00Z";
process.env.GHN_TOKEN = "";
delete process.env.GHN_API_BASE;

afterAll(() => {
  rmSync(dir, { recursive: true, force: true });
});
