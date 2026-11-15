import { expect, test } from "./fixtures";

/**
 * Filter memory: the last explicit inbox filter set is remembered in
 * localStorage and restored on the next bare visit. Explicit URLs win.
 */
test.describe("inbox filter persistence", () => {
  test("restores the last filters on the next bare visit", async ({ page }) => {
    await page.goto("/?repo=acme--web&age=7d");
    await expect(page.getByLabel("Filter by age")).toHaveValue("7d");
    await expect(page).toHaveURL(/repo=acme--web/);

    const stored = await page.evaluate(() => localStorage.getItem("ghn:inbox-filters"));
    expect(stored).toContain("acme--web");

    await page.goto("/");
    await expect(page).toHaveURL(/repo=acme--web/);
    await expect(page).toHaveURL(/age=7d/);
    await expect(page.getByLabel("Filter by age")).toHaveValue("7d");
  });

  test("an explicit URL wins and becomes the new memory", async ({ page }) => {
    await page.goto("/");
    await page.evaluate(() => {
      localStorage.setItem(
        "ghn:inbox-filters",
        JSON.stringify({
          version: 1,
          filters: { repo: "acme--web", state: "unread", type: "all", age: "7d" },
        })
      );
    });
    await page.goto("/?repo=acme--api&state=all");
    await expect(page).toHaveURL(/repo=acme--api/);
    await expect(page.getByLabel("Filter by state", { exact: true })).toHaveValue("all");

    await page.goto("/");
    await expect(page).toHaveURL(/repo=acme--api/);
    await expect(page.getByLabel("Filter by state", { exact: true })).toHaveValue("all");
  });

  test("corrupt memory falls back to defaults", async ({ page }) => {
    await page.addInitScript(() => {
      localStorage.setItem("ghn:inbox-filters", "{oops");
    });
    await page.goto("/");
    await expect(page).not.toHaveURL(/repo=/);
    await expect(page).not.toHaveURL(/age=/);
    await expect(page.getByLabel("Filter by age")).toHaveValue("all");
    await expect(page.getByRole("heading", { name: "Notifications", level: 1 })).toBeVisible();
  });
});
