import { execFileSync } from "node:child_process";

import { defineConfig } from "@playwright/test";

function resolveRuntimePort(): string {
  // Explicit env wins (CI, manual override). Otherwise ask the bg-style
  // resolver for this checkout's stable per-workspace port.
  if (process.env.E2E_BASE_URL ?? process.env.PLAYWRIGHT_BASE_URL) {
    try {
      const url = new URL(
        (process.env.E2E_BASE_URL ?? process.env.PLAYWRIGHT_BASE_URL) as string,
      );
      if (url.port) return url.port;
    } catch {
      // fall through to resolver
    }
  }
  if (
    (process.env.WEB_PORT ?? process.env.PORT) &&
    !process.env.E2E_BASE_URL &&
    !process.env.PLAYWRIGHT_BASE_URL
  ) {
    return (process.env.WEB_PORT ?? process.env.PORT) as string;
  }
  try {
    const out = execFileSync("./scripts/resolve-dev-runtime.sh", {
      encoding: "utf8",
      env: process.env,
    });
    for (const line of out.split("\n")) {
      const match = line.match(/^export WEB_PORT=(.+)$/);
      if (match?.[1]) return match[1].replace(/^['"]|['"]$/g, "");
    }
  } catch {
    // resolver unavailable (e.g. no git); fall back to legacy default
  }
  return "21120";
}

const webPort = resolveRuntimePort();
const baseURL =
  process.env.E2E_BASE_URL ??
  process.env.PLAYWRIGHT_BASE_URL ??
  `http://localhost:${webPort}`;

export default defineConfig({
  testDir: "./tests/e2e",
  use: { baseURL },
  webServer: {
    command: `PORT=${webPort} bun run dev`,
    port: Number(webPort),
    reuseExistingServer: true,
    timeout: 120000,
  },
});
