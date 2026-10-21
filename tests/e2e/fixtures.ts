import { execFileSync } from "node:child_process";
import { expect, test as base, type Locator, type Page } from "@playwright/test";
import { E2E_DB_PATH, E2E_NOW, E2E_REPO_ROOT } from "../../playwright.config";

/**
 * The shared setup for the end-to-end layer.
 *
 * Every check starts from the same dataset. The reset drops and recreates
 * the tables in the isolated database in place, because the running server
 * holds an open handle to that file and unlinking it would leave the server
 * reading the old inode. The file itself is never deleted.
 */
export function resetDatabase(): void {
  execFileSync("bun", ["run", "scripts/e2e-reset.ts"], {
    cwd: E2E_REPO_ROOT,
    env: {
      ...process.env,
      GHN_DB_PATH: E2E_DB_PATH,
      GHN_NOW: E2E_NOW,
      TZ: "UTC",
    },
    stdio: "pipe",
  });
}

/**
 * The reset runs as an automatic fixture rather than as a shared
 * `beforeEach` hook.
 *
 * A top level `test.beforeEach` is registered on the root suite of the file
 * that evaluates this module first, so a hook registered here does not reach
 * every spec file. A fixture travels with the exported `test` object, so
 * every check that uses it gets the reset.
 */
export const test = base.extend<{ freshDatabase: void }>({
  freshDatabase: [
    async ({}, use) => {
      resetDatabase();
      await use();
    },
    { auto: true },
  ],
});

export { expect };

/**
 * The notification rows.
 *
 * The list renders one `li` per item, and the application gives each one the
 * id `notification-<notification id>`. That id is the same one the
 * application uses for its own keyboard focus handling, so it is part of the
 * rendered contract rather than a test-only hook.
 */
export function inboxRows(page: Page): Locator {
  return page.locator('li[id^="notification-"]');
}

/** The ids of the notification rows, in the order the list renders them. */
export async function inboxRowIds(page: Page): Promise<string[]> {
  return inboxRows(page).evaluateAll((elements) =>
    elements.map((element) => element.id)
  );
}

/** The notification ids the list renders, without the `notification-` prefix. */
export async function inboxNotificationIds(page: Page): Promise<string[]> {
  const ids = await inboxRowIds(page);
  return ids.map((id) => id.replace(/^notification-/, ""));
}
