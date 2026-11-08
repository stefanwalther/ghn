import { execFileSync } from "node:child_process";
import { expect, test } from "./fixtures";
import { E2E_DB_PATH, E2E_NOW, E2E_REPO_ROOT } from "../../playwright.config";

/**
 * The release triage journey: read a pre-release with assets and triage it
 * without opening a browser.
 *
 * The row is scripted per test (see scripts/e2e-release-row.ts) because the
 * frozen dataset has no Release subject rows. The stand-in serves the
 * release payload from tests/support/stand-in-server.ts.
 */
function releaseRow(mode: "add" | "remove"): void {
  execFileSync("bun", ["run", "scripts/e2e-release-row.ts", mode], {
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

test.describe("release preview", () => {
  test.beforeEach(() => {
    releaseRow("add");
  });

  test.afterEach(() => {
    releaseRow("remove");
  });

  test("reads and triages a release without leaving the app", async ({ page }) => {
    await page.goto("/");

    const row = page.locator("#notification-n_rel_e2e");
    await expect(row).toBeVisible();
    await row.getByText("E2E nightly v9.9.9-e2e", { exact: true }).click();

    const drawer = page.getByRole("dialog", { name: "Preview drawer" });
    await expect(drawer).toBeVisible();
    await expect(drawer.getByText("v9.9.9-e2e", { exact: true })).toBeVisible();
    await expect(drawer.getByText("pre-release", { exact: true })).toBeVisible();
    await expect(drawer.getByText("github-actions", { exact: true })).toBeVisible();
    await expect(drawer.getByText("Highlights", { exact: true })).toBeVisible();
    await expect(drawer.getByText("Assets (2)", { exact: true })).toBeVisible();
    await drawer.getByRole("button", { name: "Expand assets" }).click();
    await expect(drawer.getByText("nightly-mac.yml", { exact: true })).toBeVisible();
    await expect(drawer.getByText("786 Bytes", { exact: true })).toBeVisible();

    await drawer.getByRole("button", { name: "Done", exact: true }).click();
    await expect(row).toHaveCount(0);
  });
});
