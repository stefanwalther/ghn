import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./tests/e2e",
  use: { baseURL: "http://localhost:21120" },
  webServer: {
    command: "bun run dev",
    port: 21120,
    reuseExistingServer: true,
    timeout: 120000,
  },
});
