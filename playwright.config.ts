import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./tests/e2e",
  use: { baseURL: "http://localhost:3000" },
  webServer: {
    command: "bun run dev",
    port: 3000,
    reuseExistingServer: true,
    timeout: 120000,
  },
});
