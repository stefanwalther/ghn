import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL(".", import.meta.url));
const nodeDbClient = fileURLToPath(
  new URL("./tests/support/db-client.node.ts", import.meta.url)
);
const bunShim = fileURLToPath(
  new URL("./tests/support/bun-shim.ts", import.meta.url)
);

export default defineConfig({
  // The root tsconfig sets "jsx": "preserve" for Next.js, which Vite cannot
  // transform. The override applies to the test transform only.
  oxc: { jsx: { runtime: "automatic", importSource: "react" } },
  resolve: {
    // The order matters. A bare "@" alias is a prefix match, so it would
    // swallow "@/db/client" before the more specific alias ever ran.
    alias: [
      { find: "@/db/client", replacement: nodeDbClient },
      { find: "@", replacement: root },
      // The application reaches the local credential helper through
      // `await import("bun")`, which only resolves inside Bun.
      { find: /^bun$/, replacement: bunShim },
    ],
  },
  test: {
    projects: [
      {
        extends: true,
        test: {
          name: "unit",
          environment: "node",
          // The dataset's calendar filters are local-time based, so the
          // timezone is pinned to keep the counts identical everywhere.
          env: { TZ: "UTC" },
          include: ["tests/unit/**/*.test.{ts,tsx}"],
        },
      },
      {
        extends: true,
        test: {
          name: "integration",
          environment: "node",
          env: { TZ: "UTC" },
          include: ["tests/integration/**/*.test.{ts,tsx}"],
          setupFiles: ["./tests/support/integration-setup.ts"],
        },
      },
      {
        extends: true,
        test: {
          name: "component",
          environment: "happy-dom",
          env: { TZ: "UTC" },
          include: ["tests/component/**/*.test.{ts,tsx}"],
          setupFiles: ["./tests/support/dom-setup.ts"],
        },
      },
    ],
    coverage: {
      provider: "v8",
      // Report every source file, including the ones no check touches. The
      // remaining gap has to be visible, not omitted.
      include: [
        "app/**/*.{ts,tsx}",
        "lib/**/*.{ts,tsx}",
        "components/**/*.{ts,tsx}",
        "db/**/*.{ts,tsx}",
        "scripts/**/*.{ts,tsx}",
      ],
      exclude: ["**/*.test.{ts,tsx}", "tests/**", "next-env.d.ts"],
      reporter: ["text", "html", "lcov", "json-summary"],
      reportsDirectory: "coverage",
    },
  },
});
