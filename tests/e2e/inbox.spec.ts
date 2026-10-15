import { expect, test } from "@playwright/test";

test.describe("quiet notifications inbox", () => {
  test("loads inbox, applies bulk done, keeps digest collapsed, persists filter", async ({
    page,
  }) => {
    await page.goto("/");
    await expect(page.getByRole("heading", { name: "Notifications" })).toBeVisible();
    await expect(page.getByLabel("Filter by repository")).toBeVisible();

    const firstCheckbox = page.getByLabel("Select all visible");
    await expect(firstCheckbox).toBeVisible();
    await firstCheckbox.check();
    await expect(page.getByRole("button", { name: "Mark done" })).toBeVisible();
    await page.getByRole("button", { name: "Mark done" }).click();
    await expect(page.getByText(/selected/)).toHaveCount(0);

    await expect(page.getByLabel("Quiet digests")).toBeVisible();

    await page.getByLabel("Filter by state").selectOption("done");
    await expect(page).toHaveURL(/state=done/);
    await page.reload();
    await expect(page).toHaveURL(/state=done/);
  });
});
