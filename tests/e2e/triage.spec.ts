import { expect, inboxNotificationIds, inboxRows, test } from "./fixtures";

/**
 * The write journey.
 *
 * Both actions write to the GitHub stand-in, so the state that shows up in
 * the application afterwards is real. The application only records a write as
 * applied when the remote call succeeded: a rejected write comes back as a
 * partial update with a queued writeback, and the item keeps its old state.
 * The responses below are therefore asserted exactly, because their shape
 * tells the two cases apart.
 */

/** The identifiers of the visible items from `first` to `last`, in list order. */
const idsFrom = (first: number, last: number) =>
  Array.from(
    { length: last - first + 1 },
    (_, index) => `n_${String(first + index).padStart(3, "0")}`
  );

test.describe("triage writes", () => {
  test("marks an item as done and the stand-in acknowledges it", async ({ page }) => {
    await page.goto("/");

    await page.getByRole("button", { name: "Actions for Fix flaky login redirect" }).first().click();
    const menu = page.getByRole("menu");
    await expect(menu).toBeVisible();

    const bulkResponse = page.waitForResponse(
      (response) =>
        response.url().endsWith("/api/notifications/bulk") &&
        response.request().method() === "POST"
    );
    await menu.getByRole("menuitem", { name: /^Mark as done/ }).click();

    // No "remote": "partial" and no "queued": the stand-in accepted the
    // delete, so the application applied the change locally as well.
    const response = await bulkResponse;
    expect(response.status()).toBe(200);
    expect(await response.json()).toEqual({ updated: 1, action: "done" });

    await expect(inboxRows(page)).toHaveCount(29);
    await expect(page.getByText("29 items", { exact: true })).toBeVisible();
    await expect(page.locator("#notification-n_001")).toHaveCount(0);
    expect(await inboxNotificationIds(page)).toEqual(idsFrom(2, 30));
  });

  test("unsubscribes an item and the stand-in acknowledges it", async ({ page }) => {
    await page.goto("/");

    await page.getByRole("button", { name: "Actions for Bump dependency range" }).first().click();
    const menu = page.getByRole("menu");
    await expect(menu).toBeVisible();

    const bulkResponse = page.waitForResponse(
      (response) =>
        response.url().endsWith("/api/notifications/bulk") &&
        response.request().method() === "POST"
    );
    await menu.getByRole("menuitem", { name: /^Unsubscribe and mute/ }).click();

    // Unsubscribe asks for confirmation: the shift slip (u vs Shift+U) is
    // the one mis-triage that cannot be undone from here.
    const confirm = page.getByRole("alertdialog", { name: /Unsubscribe from/ });
    await expect(confirm).toBeVisible();
    await confirm.getByRole("button", { name: "Unsubscribe", exact: true }).click();

    // The subscription write reached the stand-in, so nothing was queued.
    const response = await bulkResponse;
    expect(response.status()).toBe(200);
    expect(await response.json()).toEqual({ updated: 1, action: "unsubscribe" });

    await expect(inboxRows(page)).toHaveCount(29);
    await expect(page.getByText("29 items", { exact: true })).toBeVisible();
    await expect(page.locator("#notification-n_002")).toHaveCount(0);
    expect(await inboxNotificationIds(page)).toEqual(["n_001", ...idsFrom(3, 30)]);
  });

  test("shows the triaged items under the done filter afterwards", async ({ page }) => {
    await page.goto("/");

    await page.getByRole("button", { name: "Actions for Fix flaky login redirect" }).first().click();
    await page.getByRole("menu").getByRole("menuitem", { name: /^Mark as done/ }).click();
    await expect(inboxRows(page)).toHaveCount(29);

    await page.getByRole("button", { name: "Actions for Bump dependency range" }).first().click();
    await page
      .getByRole("menu")
      .getByRole("menuitem", { name: /^Unsubscribe and mute/ })
      .click();
    const confirm = page.getByRole("alertdialog", { name: /Unsubscribe from/ });
    await expect(confirm).toBeVisible();
    await confirm.getByRole("button", { name: "Unsubscribe", exact: true }).click();
    await expect(inboxRows(page)).toHaveCount(28);
    await expect(page.getByText("28 items", { exact: true })).toBeVisible();

    // The state survives in the application: both items are done now.
    await page.getByLabel("Filter by state", { exact: true }).selectOption("done");
    await expect(page).toHaveURL(/\?state=done/);
    await expect(inboxRows(page)).toHaveCount(2);
    expect(await inboxNotificationIds(page)).toEqual(["n_001", "n_002"]);
  });
});
