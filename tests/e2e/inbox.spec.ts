import { expect, test } from "@playwright/test";

// Fixture-mode smoke: structural invariants only, no mutations, no live
// GitHub writes. Refresh may trigger a read-only sync where authenticated;
// without `gh` auth it short-circuits before any network call.
test.describe("live github sync smoke", () => {
  test("loads inbox with filters and a stable list or empty state", async ({
    page,
  }) => {
    await page.goto("/");
    await expect(page.getByRole("heading", { name: "Notifications" })).toBeVisible();
    await expect(page.getByText("Filters", { exact: true })).toBeVisible();
    await expect(page.getByLabel("Select all visible")).toBeVisible();
    const listOrEmpty = page.locator("ul, div:has-text('All caught up')").first();
    await expect(listOrEmpty).toBeVisible();
  });

  test("bulk selection clears without mutating", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByLabel("Select all visible")).toBeVisible();
    await page.getByLabel("Select all visible").check();
    await expect(page.getByRole("button", { name: "Done", exact: true })).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(page.getByText(/selected/)).toHaveCount(0);
  });

  test("item menu opens with triage actions and closes on escape", async ({
    page,
  }) => {
    await page.goto("/");
    const trigger = page.getByRole("button", { name: /Actions for / }).first();
    await expect(trigger).toBeVisible();
    await trigger.click();
    const menu = page.getByRole("menu");
    await expect(menu).toBeVisible();
    await expect(menu.getByRole("menuitem", { name: /Mark as done/ })).toBeVisible();
    await expect(menu.getByRole("menuitem", { name: /Open source/ })).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(menu).toHaveCount(0);
  });

  test("item drawer opens from menu and closes on escape", async ({
    page,
  }) => {
    await page.goto("/");
    const trigger = page.getByRole("button", { name: /Actions for / }).first();
    await expect(trigger).toBeVisible();
    await trigger.click();
    await page.getByRole("menuitem", { name: /Open in drawer/ }).click();
    const drawer = page.getByRole("dialog", { name: "Item details" });
    await expect(drawer).toBeVisible();
    await expect(drawer.getByRole("link", { name: /Open in new window/ })).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(drawer).toHaveCount(0);
  });

  test("repository list hides fully-empty repos", async ({ page }) => {
    await page.goto("/");
    const section = page.locator('section[aria-label="Repository filters"]');
    const buttons = section.getByRole("button", { name: /^Filter by / });
    await expect(buttons.first()).toBeVisible();
    const n = await buttons.count();
    expect(n).toBeGreaterThan(0);
    for (let i = 0; i < n; i++) {
      const button = buttons.nth(i);
      const text = (await button.innerText()).trim();
      const badge = text.split(/\s+/).pop();
      const active = await button.getAttribute("aria-current");
      if (active !== "true") expect(badge).not.toBe("0");
    }
  });

  test("refresh control keeps the inbox stable", async ({ page }) => {
    await page.goto("/");
    const refresh = page.getByRole("button", { name: /refresh inbox/i });
    await expect(refresh).toBeVisible();
    if (await refresh.isEnabled()) {
      await refresh.click();
    }
    await expect(page.getByRole("heading", { name: "Notifications" })).toBeVisible();
    await expect(page.getByLabel("Select all visible")).toBeVisible();
  });

  test("digest section collapses non-due repos when present", async ({
    page,
  }) => {
    await page.goto("/");
    const digest = page.getByLabel("Quiet digests");
    if ((await digest.count()) > 0) {
      await expect(digest.getByText(/pending/)).toBeVisible();
    }
  });

  test("repositories page exposes rhythm controls and persists filters", async ({
    page,
  }) => {
    await page.goto("/repos");
    await expect(page.getByRole("heading", { name: "Repositories" })).toBeVisible();
    const rhythms = page.getByLabel(/Digest rhythm for /);
    if ((await rhythms.count()) > 0) {
      await expect(rhythms.first()).toBeVisible();
    }
    await page.goto("/?state=done");
    await expect(page).toHaveURL(/state=done/);
    await page.reload();
    await expect(page).toHaveURL(/state=done/);
  });
});
