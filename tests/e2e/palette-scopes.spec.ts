import type { Page } from "@playwright/test";
import { expect, inboxNotificationIds, inboxRows, test } from "./fixtures";

/**
 * The universal search matrix: scopes, qualifiers, dimensions, and the
 * handoff to the inbox repository list.
 *
 * Every assertion is exact. The dataset is deterministic, the server clock
 * is frozen, and the repository, type, and age populations below are the
 * ones the frozen dataset produces (see tests/e2e/inbox.spec.ts for the
 * same ground truths asserted through the sidebar).
 */

const WEB_IDS = ["n_001", "n_004", "n_007", "n_010", "n_013", "n_016", "n_019", "n_022", "n_025", "n_028"];
const MOBILE_IDS = ["n_003", "n_006", "n_009", "n_012", "n_015", "n_018", "n_021", "n_024", "n_027", "n_030"];
const RELEASE_IDS = ["n_005", "n_012", "n_019", "n_026"];
const DAY_IDS = ["n_001", "n_002", "n_003", "n_004", "n_005", "n_006", "n_007"];

/** Opens the palette the power-user way and returns the search box. */
async function openPalette(page: Page) {
  const box = page.getByRole("combobox", { name: /Search threads/ });
  // A keypress that lands before React hydrates and attaches the
  // shortcut listener is silently dropped, which reads as a hang on
  // loaded CI runners. Retry the chord until the dialog answers.
  for (let attempt = 0; attempt < 3; attempt++) {
    await page.keyboard.press("ControlOrMeta+k");
    try {
      await expect(box).toBeVisible({ timeout: 2000 });
      return box;
    } catch {
      // Not open yet; press again once listeners are attached.
    }
  }
  await expect(box).toBeVisible();
  return box;
}

/**
 * The palette dialog itself. All option and tab queries go through it so
 * page content behind the modal (native selects, quick-select buttons)
 * can never satisfy them instead.
 */
function palette(page: Page) {
  return page.getByRole("dialog", { name: "Search and commands" });
}

test.describe("palette search scopes", () => {
  test("empty palette shows commands, threads, repos, and scope tabs", async ({ page }) => {
    await page.goto("/");
    const box = await openPalette(page);
    const dialog = palette(page);

    await expect(box).toHaveValue("");
    await expect(dialog.getByRole("option", { name: /Refresh from GitHub/ })).toBeVisible();
    await expect(dialog.getByRole("option", { name: /Fix flaky login redirect/ })).toBeVisible();
    await expect(dialog.getByRole("option", { name: /^acme\/web/ })).toBeVisible();
    await expect(dialog.getByRole("button", { name: /^All/ })).toHaveAttribute("aria-pressed", "true");
    await expect(page.getByText(/the scopes above narrow the list/)).toBeVisible();
  });

  test("Enter on a thread opens it in the drawer", async ({ page }) => {
    await page.goto("/");
    const box = await openPalette(page);
    await box.fill("flaky");

    await page.keyboard.press("Enter");

    const drawer = page.getByRole("dialog", { name: "Preview drawer" });
    await expect(drawer).toBeVisible();
    await expect(drawer).toContainText("Fix flaky login redirect");

    await page.keyboard.press("Escape");
    await expect(drawer).not.toBeVisible();
  });

  test("Enter on a thread outside the current filter still opens the drawer", async ({ page }) => {
    await page.goto("/?type=release");
    await expect(page.getByRole("option", { name: /Fix flaky login redirect/ })).toHaveCount(0);

    const box = await openPalette(page);
    await box.fill("flaky");
    await palette(page).getByRole("option", { name: /Fix flaky login redirect/ }).first().click();

    const drawer = page.getByRole("dialog", { name: "Preview drawer" });
    await expect(drawer).toBeVisible();
    await expect(drawer).toContainText("Fix flaky login redirect");
    await expect(page).toHaveURL(/type=release/);
  });

  test("Shift+Enter on a thread filters the inbox to its repository", async ({ page }) => {
    await page.goto("/");
    const box = await openPalette(page);
    await box.fill("flaky");

    await page.keyboard.press("Shift+Enter");

    await expect(page).toHaveURL(/\?repo=acme--web$/);
    await expect(inboxRows(page)).toHaveCount(10);
    expect(await inboxNotificationIds(page)).toEqual(WEB_IDS);
  });

  test("repo rows filter the inbox to it; threads sharing the name rank first", async ({
    page,
  }) => {
    await page.goto("/");
    const box = await openPalette(page);
    await box.fill("mobile");

    // The thread whose subtitle names the repo ties with the repo row and
    // keeps the top hit; arrows or a click still reach the repo in one move.
    const dialog = palette(page);
    await expect(dialog.getByRole("option").first()).toContainText("Add empty state for inbox");
    await dialog.getByRole("option", { name: /^acme\/mobile/ }).click();

    await expect(page).toHaveURL(/\?repo=acme--mobile$/);
    await expect(inboxRows(page)).toHaveCount(10);
    expect(await inboxNotificationIds(page)).toEqual(MOBILE_IDS);
  });

  test("repo: scopes to repositories only", async ({ page }) => {
    await page.goto("/");
    const box = await openPalette(page);
    await box.fill("repo:acme");
    const dialog = palette(page);

    await expect(dialog.getByRole("option", { name: /^acme\/web/ })).toBeVisible();
    await expect(dialog.getByRole("option", { name: /^acme\/api/ })).toBeVisible();
    await expect(dialog.getByRole("option", { name: /^acme\/mobile/ })).toBeVisible();
    await expect(dialog.getByRole("option", { name: /Fix flaky/ })).toHaveCount(0);
    await expect(page.getByText("repo: repos only")).toBeVisible();
    await expect(dialog.getByRole("button", { name: /^Repos/ })).toHaveAttribute("aria-pressed", "true");
  });

  test("qualifier completion fills repo: and keeps the palette open", async ({ page }) => {
    await page.goto("/");
    const box = await openPalette(page);
    await box.fill("r");

    await page.keyboard.press("Enter");

    await expect(box).toHaveValue("repo:");
    await expect(page.getByRole("dialog", { name: "Search and commands" })).toBeVisible();
  });

  test("qualifier completion fills type: too", async ({ page }) => {
    await page.goto("/");
    const box = await openPalette(page);
    await box.fill("t");
    const dialog = palette(page);

    await expect(dialog.getByRole("option", { name: /^type:/ })).toBeVisible();
    await page.keyboard.press("Enter");

    await expect(box).toHaveValue("type:");
    await expect(dialog.getByRole("option", { name: /^Release/ })).toBeVisible();
  });

  test("scope tabs rewrite the query and stay in sync with typing", async ({ page }) => {
    await page.goto("/");
    const box = await openPalette(page);
    const dialog = palette(page);

    await dialog.getByRole("button", { name: /^Types/ }).click();
    await expect(box).toHaveValue("type:");
    await expect(dialog.getByRole("option", { name: /^Release/ })).toBeVisible();

    await dialog.getByRole("button", { name: /^All/ }).click();
    await expect(box).toHaveValue("");

    await box.fill("acme");
    await dialog.getByRole("button", { name: /^Repos/ }).click();
    await expect(box).toHaveValue("repo:acme");
  });

  test("filter shows the four dimensions with current values; Repository drills in", async ({
    page,
  }) => {
    await page.goto("/");
    const box = await openPalette(page);
    await box.fill("filter");
    const dialog = palette(page);

    const repo = dialog.getByRole("option", { name: /^Repository/ });
    await expect(repo).toContainText("Currently: All repositories");
    await expect(dialog.getByRole("option", { name: /^Type/ })).toContainText("Currently: All types");
    await expect(dialog.getByRole("option", { name: /^State/ })).toContainText("Currently: Unread");
    await expect(dialog.getByRole("option", { name: /^Age/ })).toContainText("Currently: All time");

    await repo.click();
    await expect(box).toHaveValue("repo:");
  });

  test("type: lists server types and filters the inbox", async ({ page }) => {
    await page.goto("/");
    const box = await openPalette(page);
    await box.fill("type:rel");

    await palette(page).getByRole("option", { name: /^Release/ }).click();

    await expect(page).toHaveURL(/\?type=release$/);
    expect(await inboxNotificationIds(page)).toEqual(RELEASE_IDS);
  });

  test("state: and age: filter the inbox too", async ({ page }) => {
    await page.goto("/");
    const box = await openPalette(page);
    await box.fill("state:don");

    await palette(page).getByRole("option", { name: /^Done/ }).click();
    await expect(page).toHaveURL(/\?state=done$/);

    // Fresh inbox so the age assertion reads exact rows, not an intersection.
    await page.goto("/");
    await openPalette(page);
    const fresh = page.getByRole("combobox", { name: /Search threads/ });
    await fresh.fill("age:24");

    await palette(page).getByRole("option", { name: /Last 24 hours/ }).click();
    await expect(page).toHaveURL(/age=24h/);
    expect(await inboxNotificationIds(page)).toEqual(DAY_IDS);
  });

  test("filter values preserve the other active filters", async ({ page }) => {
    await page.goto("/?type=release");
    const box = await openPalette(page);
    await box.fill("state:don");

    await palette(page).getByRole("option", { name: /^Done/ }).click();

    await expect(page).toHaveURL(/type=release/);
    await expect(page).toHaveURL(/state=done/);
  });

  test("sidebar handoff narrows the repository list without filtering the inbox", async ({
    page,
  }) => {
    await page.goto("/");
    const box = await openPalette(page);
    await box.fill("acme");

    await palette(page).getByRole("option", { name: /Filter repository list to/ }).click();

    await expect(page.getByRole("dialog", { name: "Search and commands" })).toHaveCount(0);
    const sidebar = page.getByRole("searchbox", { name: "Filter repositories" });
    await expect(sidebar).toHaveValue("acme");
    await expect(page.getByRole("button", { name: "Filter by acme/web" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Filter by acme/api" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Filter by vendor/slow-dep" })).toHaveCount(0);
    await expect(page).not.toHaveURL(/repo=/);
  });

  test("sidebar filter narrows the list and strips qualifiers", async ({ page }) => {
    await page.goto("/");
    const sidebar = page.getByRole("searchbox", { name: "Filter repositories" });

    await sidebar.fill("mobile");
    await expect(page.getByRole("button", { name: "Filter by acme/mobile" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Filter by acme/web" })).toHaveCount(0);

    await sidebar.fill("repo:api");
    await expect(page.getByRole("button", { name: "Filter by acme/api" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Filter by acme/mobile" })).toHaveCount(0);

    await page.keyboard.press("Escape");
    await expect(sidebar).toHaveValue("");
    await expect(page.getByRole("button", { name: "Filter by acme/web" })).toBeVisible();
  });

  test("PR numbers stay searchable: 818 finds its thread", async ({ page }) => {
    await page.goto("/");
    const box = await openPalette(page);
    await box.fill("818");
    const dialog = palette(page);

    // The number belongs to two threads (the subject cycles twice through
    // the visible items); the first one opens.
    const hit = dialog.getByRole("option", { name: /\(#818\)/ }).first();
    await expect(hit).toBeVisible();
    await expect(hit).toContainText("acme/web");
    await expect(page.getByText(/repos only/)).toHaveCount(0);

    await page.keyboard.press("Enter");
    await expect(page.getByRole("dialog", { name: "Preview drawer" })).toContainText("bump sonner");
  });

  test("no matches explain themselves with the qualifier tip", async ({ page }) => {
    await page.goto("/");
    const box = await openPalette(page);
    await box.fill("zzz-no-such-thing");

    await expect(page.getByText(/No matches for/)).toBeVisible();
    await expect(page.getByText(/searches only repos/)).toBeVisible();
  });

  test("Syntax tips closes the palette and opens help", async ({ page }) => {
    await page.goto("/");
    await openPalette(page);

    await palette(page).getByRole("button", { name: "Syntax tips" }).click();

    await expect(page.getByRole("dialog", { name: "Search and commands" })).toHaveCount(0);
    await expect(page.getByRole("dialog", { name: "Keyboard shortcuts" })).toBeVisible();
    await expect(page.getByRole("dialog", { name: "Keyboard shortcuts" })).toContainText("repo:");
  });

  test("thread rows name both actions", async ({ page }) => {
    await page.goto("/");
    const box = await openPalette(page);
    await box.fill("flaky");

    const hit = palette(page).getByRole("option", { name: /Fix flaky login redirect/ }).first();
    await expect(hit).toContainText("Open");
    await expect(hit).toContainText("Filter");
  });
});
