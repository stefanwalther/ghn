import { expect, inboxRows, test } from "./fixtures";

/**
 * The sidebar multi-select journey.
 *
 * Selection gestures fan out through the existing per-repository mutations,
 * so the PATCH and bulk responses below are asserted exactly like the
 * single-repo journeys in triage.spec.ts.
 */
test.describe("sidebar multi-select", () => {
  // macOS browsers turn Ctrl-click into a right-click; the implementation
  // treats Ctrl and Cmd as interchangeable toggles.
  const toggle = process.platform === "darwin" ? "Meta" : "Control";

  test("snoozes every selected repository from one menu", async ({ page }) => {
    await page.goto("/");

    const sidebar = page.locator('section[aria-label="Repository filters"]');
    const web = sidebar.getByRole("button", { name: "Filter by acme/web" });
    const mobile = sidebar.getByRole("button", { name: "Filter by acme/mobile" });
    await web.click({ modifiers: [toggle] });
    await mobile.click({ modifiers: [toggle] });
    await expect(web).toHaveAttribute("aria-pressed", "true");
    await expect(mobile).toHaveAttribute("aria-pressed", "true");

    const patchResponses: string[] = [];
    page.on("response", (response) => {
      if (
        response.url().includes("/api/repositories/") &&
        response.request().method() === "PATCH"
      ) {
        patchResponses.push(response.url());
      }
    });
    await web.click({ button: "right" });
    const menu = page.getByRole("menu", { name: "Actions for 2 repositories" });
    await expect(menu).toBeVisible();
    await menu.getByRole("menuitem", { name: /^In 1 hour/ }).click();

    await expect(page.getByText("2 repositories snoozed.")).toBeVisible();
    await expect(patchResponses).toHaveLength(2);
    await expect(page.getByRole("button", { name: /snoozed repositories/i })).toContainText(
      "Snoozed (2)"
    );
  });

  test("combined done above the threshold confirms once, cancel keeps state", async ({
    page,
  }) => {
    await page.goto("/");

    const sidebar = page.locator('section[aria-label="Repository filters"]');
    for (const repo of ["acme/web", "acme/api", "acme/mobile"]) {
      await sidebar
        .getByRole("button", { name: `Filter by ${repo}` })
        .click({ modifiers: [toggle] });
    }

    const before = await inboxRows(page).count();
    await sidebar
      .getByRole("button", { name: "Filter by acme/web" })
      .click({ button: "right" });
    const menu = page.getByRole("menu", { name: "Actions for 3 repositories" });
    await expect(menu).toBeVisible();
    await menu.getByRole("menuitem", { name: /^Mark all as done/ }).click();

    // One combined confirmation naming the totals, not three per-repo ones.
    const confirm = page.getByRole("alertdialog", { name: /Mark \d+ as done/ });
    await expect(confirm).toBeVisible();
    await expect(confirm.getByText(/3 repositor/)).toBeVisible();
    await confirm.getByRole("button", { name: "Cancel" }).click();

    await expect(inboxRows(page)).toHaveCount(before);
  });
});
