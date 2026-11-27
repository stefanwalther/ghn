import { expect, test } from "./fixtures";

/**
 * Filter memory: the last explicit inbox filter set is remembered in
 * localStorage and restored on the next bare visit. Explicit URLs win.
 */
test.describe("inbox filter persistence", () => {
  test("restores the last filters on the next bare visit", async ({ page }) => {
    await page.goto("/?repo=acme--web&age=7d");
    await expect(page.getByRole("button", { name: "Age: Last 7 days" })).toBeVisible();
    await expect(page).toHaveURL(/repo=acme--web/);

    const stored = await page.evaluate(() => localStorage.getItem("ghn:inbox-filters"));
    expect(stored).toContain("acme--web");

    await page.goto("/");
    await expect(page).toHaveURL(/repo=acme--web/);
    await expect(page).toHaveURL(/age=7d/);
    await page.getByRole("button", { name: "Age: Last 7 days" }).click();
    await expect(page.getByRole("radio", { name: "Filter by age Last 7 days" })).toBeChecked();
  });

  test("an explicit URL wins and becomes the new memory", async ({ page }) => {
    await page.goto("/");
    await page.evaluate(() => {
      localStorage.setItem(
        "ghn:inbox-filters",
        JSON.stringify({
          version: 2,
          filters: {
            repos: ["acme--web"],
            states: ["unread"],
            types: [],
            ages: ["7d"],
          },
        })
      );
    });
    await page.goto("/?repo=acme--api&state=all");
    await expect(page).toHaveURL(/repo=acme--api/);
    await expect(page.getByRole("button", { name: "State: Unread, Done" })).toBeVisible();

    await page.goto("/");
    await expect(page).toHaveURL(/repo=acme--api/);
    await page.getByRole("button", { name: "State: Unread, Done" }).click();
    await expect(page.getByRole("checkbox", { name: "Filter by state Done" })).toBeChecked();
    await expect(page.getByRole("checkbox", { name: "Filter by state Unread" })).toBeChecked();
  });

  test("restores multi-select defaults", async ({ page }) => {
    await page.goto("/?repo=acme--web&repo=acme--api&type=mention&type=release&age=7d");
    await expect(page).toHaveURL(/repo=acme--web/);
    await expect(page).toHaveURL(/repo=acme--api/);

    await page.goto("/");
    await expect(page).toHaveURL(/repo=acme--web/);
    await expect(page).toHaveURL(/repo=acme--api/);
    await expect(page).toHaveURL(/type=mention/);
    await expect(page).toHaveURL(/type=release/);
    await expect(page).toHaveURL(/age=7d/);
    await page.getByRole("button", { name: "Age: Last 7 days" }).click();
    await expect(page.getByRole("radio", { name: "Filter by age Last 7 days" })).toBeChecked();
  });

  test("corrupt memory falls back to defaults", async ({ page }) => {
    await page.addInitScript(() => {
      localStorage.setItem("ghn:inbox-filters", "{oops");
    });
    await page.goto("/");
    await expect(page).not.toHaveURL(/repo=/);
    await expect(page).not.toHaveURL(/age=/);
    await expect(page.getByRole("button", { name: "Age: All time" })).toBeVisible();
    await page.getByRole("button", { name: "State: Unread" }).click();
    await expect(page.getByRole("checkbox", { name: "Filter by state Unread" })).toBeChecked();
    await expect(page.getByRole("checkbox", { name: "Filter by state Done" })).not.toBeChecked();
    await expect(page.getByRole("heading", { name: "Notifications", level: 1 })).toBeVisible();
  });
});
