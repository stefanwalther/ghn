import {
  expect,
  inboxNotificationIds,
  inboxRows,
  test,
} from "./fixtures";
import { APP_URL, E2E_NOW } from "../../playwright.config";

/**
 * The five core journeys of the inbox: load, filter, select, inspect, triage.
 *
 * Every assertion is exact. The dataset is deterministic, the server clock is
 * frozen, and the counts below are the ones the frozen dataset produces. The
 * browser clock is not frozen, so nothing here asserts on a rendered
 * relative time such as "3d ago"; the checks assert on counts, labels and
 * URLs instead.
 */

/** The identifiers of the thirty visible items, in list order. */
const VISIBLE_IDS = Array.from(
  { length: 30 },
  (_, index) => `n_${String(index + 1).padStart(3, "0")}`
);

/** The identifiers of the first `last` visible items, in list order. */
const idsUpTo = (last: number) =>
  Array.from({ length: last }, (_, index) => `n_${String(index + 1).padStart(3, "0")}`);

/**
 * The identifiers each age filter leaves in the list.
 *
 * The dataset's ages are a ladder of bands, so each filter keeps a prefix of
 * the visible items.
 *
 * "This year" is the exception worth naming. The instant the contract pins
 * (`2026-01-15T12:00:00Z`) is only two weeks into the year, so "This year"
 * covers the same rows as "Last 14 days" here. The dataset's own frozen
 * epoch (`lib/seed-data.ts` FROZEN_EPOCH, `2026-06-15T12:00:00Z`) would put
 * 26 rows in this bucket instead of 19, and would leave no item in the gap
 * between "This year" and "Older than a year".
 */
const AGE_CASES = [
  { value: "24h", label: "Last 24 hours", ids: idsUpTo(7) },
  { value: "48h", label: "Last 48 hours", ids: idsUpTo(11) },
  { value: "7d", label: "Last 7 days", ids: idsUpTo(16) },
  { value: "14d", label: "Last 14 days", ids: idsUpTo(19) },
  { value: "30d", label: "Last 30 days", ids: idsUpTo(23) },
  { value: "year", label: "This year", ids: idsUpTo(19) },
  { value: "older", label: "Older than a year", ids: ["n_027", "n_028", "n_029", "n_030"] },
];

/** The identifiers each type filter leaves in the list. */
const TYPE_CASES = [
  {
    label: "Filter by Pull requests",
    value: "pull_request",
    ids: ["n_001", "n_004", "n_007", "n_010", "n_013", "n_016", "n_019", "n_022", "n_025", "n_028"],
  },
  { label: "Filter by Merged", value: "merged", ids: ["n_001", "n_007", "n_013", "n_019", "n_025"] },
  { label: "Filter by Closed", value: "closed", ids: ["n_004", "n_010", "n_016", "n_022", "n_028"] },
  { label: "Filter by Release", value: "release", ids: ["n_005", "n_012", "n_019", "n_026"] },
];

test.describe("inbox load", () => {
  test("shows exactly the thirty visible items of the frozen dataset", async ({ page }) => {
    await page.goto("/");

    await expect(page.getByRole("heading", { name: "Notifications", level: 1 })).toBeVisible();
    await expect(page.getByText("30 items", { exact: true })).toBeVisible();
    await expect(inboxRows(page)).toHaveCount(30);
    expect(await inboxNotificationIds(page)).toEqual(VISIBLE_IDS);

    // The first row is the most recent item, and it carries the badges the
    // dataset gives it: a pull request, merged, in an immediate repository.
    const first = page.locator("#notification-n_001");
    await expect(first).toBeVisible();
    await expect(first.getByText("acme/web", { exact: true })).toBeVisible();
    await expect(first.getByText("PR", { exact: true })).toBeVisible();
    await expect(first.getByText("merged", { exact: true })).toBeVisible();
  });

  test("collapses the quiet repositories into seven digest groups", async ({ page }) => {
    await page.goto("/");

    const digests = page.locator('section[aria-label="Quiet digests"]');
    await expect(digests).toBeVisible();
    await expect(digests.getByText("Quiet until due (170 pending)", { exact: true })).toBeVisible();
    await expect(digests.getByRole("button")).toHaveCount(7);

    // The pending counts of the seven groups: two repositories with 25, five
    // with 24.
    await expect(digests.getByText("25 pending", { exact: true })).toHaveCount(2);
    await expect(digests.getByText("24 pending", { exact: true })).toHaveCount(5);

    for (const repo of [
      "vendor/slow-dep",
      "vendor/ui-kit",
      "oss/router",
      "oss/bundler",
      "oss/linter",
      "vendor/analytics",
      "oss/docs",
    ]) {
      await expect(digests.getByRole("button", { name: new RegExp(`^${repo}\\b`) })).toBeVisible();
    }
  });

  test("lists every repository that has pending items", async ({ page }) => {
    await page.goto("/");

    const repositories = page.locator('section[aria-label="Repository filters"]');
    const entries = repositories.getByRole("button", { name: /^Filter by / });
    // The three immediate repositories have visible items and the other seven
    // are waiting for their digest. All ten are listed, and the count on each
    // says which is which.
    await expect(entries).toHaveCount(10);
    expect(
      await entries.evaluateAll((elements) =>
        elements.map((element) => element.getAttribute("aria-label"))
      )
    ).toEqual([
      "Filter by acme/web",
      "Filter by acme/api",
      "Filter by acme/mobile",
      "Filter by vendor/slow-dep",
      "Filter by vendor/ui-kit",
      "Filter by oss/router",
      "Filter by oss/bundler",
      "Filter by oss/linter",
      "Filter by vendor/analytics",
      "Filter by oss/docs",
    ]);

    const all = repositories.getByRole("button", { name: "Show all repositories" });
    await expect(all).toBeVisible();
    await expect(all).toContainText("30");
  });

  test("keeps every browser request on the application origin", async ({ page }) => {
    const origins = new Set<string>();
    page.on("request", (request) => {
      origins.add(new URL(request.url()).origin);
    });

    await page.goto("/");
    await expect(inboxRows(page)).toHaveCount(30);

    // The preview is fetched from the stand-in, through the application.
    await page
      .locator("#notification-n_002")
      .getByText("Bump dependency range", { exact: true })
      .click();
    const drawer = page.getByRole("dialog", { name: "Preview drawer" });
    await expect(drawer.getByText("1 comment", { exact: true })).toBeVisible();

    expect([...origins]).toEqual([APP_URL]);
  });

  test("cannot reseed through the button in a production build", async ({ page }) => {
    await page.goto("/");

    const reseed = page.getByRole("button", { name: "Reseed demo data" });
    await expect(reseed).toBeVisible();

    const reseedResponse = page.waitForResponse(
      (response) =>
        response.url().endsWith("/api/notifications/seed") &&
        response.request().method() === "POST"
    );
    await reseed.click();

    // The seed route is disabled in a production build, which is what proves
    // this suite runs against one. The script based reset is the only way in.
    const response = await reseedResponse;
    expect(response.status()).toBe(403);

    await expect(inboxRows(page)).toHaveCount(30);
    expect(await inboxNotificationIds(page)).toEqual(VISIBLE_IDS);
  });

  test("reports the stand-in as connected and the data as demo data", async ({ page }) => {
    // The connection probe answers after the page has loaded, so the wait
    // has to come first.
    const probe = page.waitForResponse((response) =>
      response.url().endsWith("/api/connection")
    );
    await page.goto("/");
    await probe;

    // A count of zero is true before the application has even applied the
    // answer, so asserting the absence has to wait for the banner to show up
    // and require that it never does.
    const disconnected = await page
      .waitForSelector("text=GitHub disconnected.", { timeout: 2000 })
      .then(() => true, () => false);
    expect(disconnected).toBe(false);

    // The data is the seeded demo data.
    await expect(
      page.getByText("Demo data shown. Sync to load live GitHub notifications.", { exact: true })
    ).toBeVisible();
  });

  test("refreshes from the stand-in and reports the sync", async ({ page }) => {
    await page.goto("/");

    const refresh = page.getByRole("button", { name: "Refresh inbox from GitHub" });
    await expect(refresh).toBeEnabled();

    const syncResponse = page.waitForResponse(
      (response) =>
        response.url().endsWith("/api/sync") && response.request().method() === "POST"
    );
    await refresh.click();

    // The application really talked to the stand-in: it took all two hundred
    // threads, marked nothing done and queued no writeback.
    const response = await syncResponse;
    expect(response.status()).toBe(200);
    expect(await response.json()).toEqual({
      now: Date.parse(E2E_NOW),
      lastSyncAt: Date.parse(E2E_NOW),
      fresh: true,
      pollIntervalSecs: 60,
      upserted: 200,
      markedDone: 0,
      discoveredRepos: 10,
      queueDepth: 0,
    });

    // The application reports the sync with the frozen instant.
    await expect(page.getByText("Synced 12:00 PM", { exact: true })).toBeVisible();
    await expect(page.getByRole("button", { name: "Reseed demo data" })).toHaveCount(0);

    // The sync leaves the seeded dataset alone. The stand-in serves the same
    // threads the database was seeded with, and the seeded repositories keep
    // their rhythm, so the inbox still shows the same rows afterwards.
    await expect(inboxRows(page)).toHaveCount(30);
    expect(await inboxNotificationIds(page)).toEqual(VISIBLE_IDS);
  });
});

test.describe("inbox filter", () => {
  test("narrows the list to the exact rows of every age filter", async ({ page }) => {
    await page.goto("/");

    for (const age of AGE_CASES) {
      await page.getByLabel("Filter by age").selectOption(age.value);

      await expect(page).toHaveURL(new RegExp(`\\?age=${age.value}`));
      await expect(inboxRows(page)).toHaveCount(age.ids.length);
      expect(await inboxNotificationIds(page)).toEqual(age.ids);
    }

    await page.getByLabel("Filter by age").selectOption("all");
    await expect(page).not.toHaveURL(/age=/);
    await expect(inboxRows(page)).toHaveCount(30);
    expect(await inboxNotificationIds(page)).toEqual(VISIBLE_IDS);
  });

  test("narrows the list to the exact rows of every type filter", async ({ page }) => {
    await page.goto("/");

    for (const type of TYPE_CASES) {
      await page.getByRole("button", { name: type.label }).click();

      await expect(page).toHaveURL(new RegExp(`\\?type=${type.value}`));
      await expect(inboxRows(page)).toHaveCount(type.ids.length);
      expect(await inboxNotificationIds(page)).toEqual(type.ids);
    }
  });

  test("narrows the list to the exact rows of every repository filter", async ({ page }) => {
    await page.goto("/");

    const cases = [
      {
        label: "Filter by acme/web",
        id: "acme--web",
        ids: ["n_001", "n_004", "n_007", "n_010", "n_013", "n_016", "n_019", "n_022", "n_025", "n_028"],
      },
      {
        label: "Filter by acme/api",
        id: "acme--api",
        ids: ["n_002", "n_005", "n_008", "n_011", "n_014", "n_017", "n_020", "n_023", "n_026", "n_029"],
      },
      {
        label: "Filter by acme/mobile",
        id: "acme--mobile",
        ids: ["n_003", "n_006", "n_009", "n_012", "n_015", "n_018", "n_021", "n_024", "n_027", "n_030"],
      },
    ];

    for (const repo of cases) {
      await page.getByRole("button", { name: repo.label }).click();

      await expect(page).toHaveURL(new RegExp(`\\?repo=${repo.id}`));
      await expect(inboxRows(page)).toHaveCount(repo.ids.length);
      expect(await inboxNotificationIds(page)).toEqual(repo.ids);
    }
  });

  test("switches the state filter between the open items and the done items", async ({ page }) => {
    await page.goto("/");

    await page.getByLabel("Filter by state", { exact: true }).selectOption("done");
    await expect(page).toHaveURL(/\?state=done/);
    await expect(inboxRows(page)).toHaveCount(0);
    await expect(page.getByRole("heading", { name: "All caught up" })).toBeVisible();

    await page.getByLabel("Filter by state", { exact: true }).selectOption("all");
    await expect(page).toHaveURL(/\?state=all/);
    await expect(inboxRows(page)).toHaveCount(30);

    await page.getByLabel("Filter by state", { exact: true }).selectOption("unread");
    await expect(page).not.toHaveURL(/state=/);
    await expect(inboxRows(page)).toHaveCount(30);
  });
});

test.describe("inbox select", () => {
  test("selects a single item and offers the bulk actions", async ({ page }) => {
    await page.goto("/");

    const checkbox = page.locator("#notification-n_002").getByRole("checkbox");
    await expect(checkbox).not.toBeChecked();
    await checkbox.click();

    await expect(checkbox).toBeChecked();
    await expect(page.getByText("1 selected", { exact: true })).toBeVisible();
    await expect(page.getByRole("button", { name: "Done", exact: true })).toBeVisible();
    await expect(page.getByRole("button", { name: "Unsubscribe", exact: true })).toBeVisible();
    await expect(page.getByRole("button", { name: "Mark as read", exact: true })).toBeVisible();
    await expect(page.getByRole("button", { name: "Mark as unread", exact: true })).toBeVisible();
    await expect(page.getByRole("button", { name: "Clear", exact: true })).toBeVisible();
  });

  test("selects every visible item with the select-all control", async ({ page }) => {
    await page.goto("/");

    await page.getByLabel("Select all visible").check();

    await expect(page.getByText("30 selected", { exact: true })).toBeVisible();
    const checked = await inboxRows(page)
      .getByRole("checkbox")
      .evaluateAll((elements) =>
        elements.map((element) => (element as HTMLInputElement).checked)
      );
    expect(checked).toEqual(Array.from({ length: 30 }, () => true));
  });

  test("clears the selection with the escape key", async ({ page }) => {
    await page.goto("/");

    await page.getByLabel("Select all visible").check();
    await expect(page.getByText("30 selected", { exact: true })).toBeVisible();

    await page.keyboard.press("Escape");

    await expect(page.getByText(/\d+ selected/)).toHaveCount(0);
    await expect(
      page.getByText("Select items to triage them in bulk", { exact: true })
    ).toBeVisible();
  });
});

test.describe("inbox inspect", () => {
  test("opens the preview drawer with the thread content", async ({ page }) => {
    await page.goto("/");

    await page
      .locator("#notification-n_002")
      .getByText("Bump dependency range", { exact: true })
      .click();

    const drawer = page.getByRole("dialog", { name: "Preview drawer" });
    await expect(drawer).toBeVisible();

    // The source link is the item's own GitHub URL.
    const source = drawer.getByRole("link", { name: "Open source for Bump dependency range" });
    await expect(source).toBeVisible();
    await expect(source).toHaveAttribute("href", "https://github.com/acme/api/issues/1");
    await expect(source).toHaveAttribute("target", "_blank");

    // The creation instant is the frozen one, rendered in the pinned
    // timezone and locale.
    await expect(drawer).toContainText("unread · 1/15/2026, 10:00:00 AM");

    // The triage panel.
    await expect(drawer.getByRole("heading", { name: "Triage" })).toBeVisible();
    await expect(drawer.getByRole("button", { name: "Done", exact: true })).toBeVisible();
    await expect(drawer.getByRole("button", { name: "Mark as read", exact: true })).toBeVisible();
    await expect(drawer.getByRole("button", { name: "Unsubscribe", exact: true })).toBeVisible();

    // The preview, fetched from the stand-in. The payload is the item's
    // own, so the author is the item's author and not the viewer's login.
    await expect(drawer.getByText("octo · open", { exact: true })).toBeVisible();
    await expect(
      drawer.getByText("The redirect races the session load.", { exact: true })
    ).toBeVisible();
    await expect(drawer.getByText("1 comment", { exact: true })).toBeVisible();
    await expect(drawer.getByText("Looks good to me.", { exact: true })).toBeVisible();
  });

  test("closes the preview drawer with the escape key", async ({ page }) => {
    await page.goto("/");

    await page
      .locator("#notification-n_002")
      .getByText("Bump dependency range", { exact: true })
      .click();
    await expect(page.getByRole("dialog", { name: "Preview drawer" })).toBeVisible();

    await page.keyboard.press("Escape");

    await expect(page.getByRole("dialog", { name: "Preview drawer" })).toHaveCount(0);
  });
});

test.describe("inbox triage", () => {
  test("offers the triage actions in the item menu", async ({ page }) => {
    await page.goto("/");

    await page.getByRole("button", { name: "Actions for Fix flaky login redirect" }).first().click();

    const menu = page.getByRole("menu");
    await expect(menu).toBeVisible();

    // The menu offers the triage actions, each with its shortcut hint.
    const items = menu.getByRole("menuitem");
    await expect(items).toHaveCount(7);
    expect(
      await items.evaluateAll((elements) =>
        elements.map((element) => element.querySelector("span")?.textContent ?? "")
      )
    ).toEqual([
      "Open source",
      "Open details",
      "Copy link",
      "Sync this item",
      "Mark as done",
      "Mark as unread",
      "Unsubscribe and mute",
    ]);
  });

  test("marks a selected item as read and the stand-in acknowledges it", async ({ page }) => {
    await page.goto("/");

    const row = page.locator("#notification-n_002");
    await expect(row.getByText("unread", { exact: true })).toHaveCount(1);

    await row.getByRole("checkbox").click();
    await expect(page.getByText("1 selected", { exact: true })).toBeVisible();

    const bulkResponse = page.waitForResponse(
      (response) =>
        response.url().endsWith("/api/notifications/bulk") &&
        response.request().method() === "POST"
    );
    await page.getByRole("button", { name: "Mark as read", exact: true }).click();

    // The application only marks the item as read when the stand-in accepted
    // the write. A rejected write comes back as a partial update with a
    // queued writeback, and the read marker would not move.
    const response = await bulkResponse;
    expect(response.status()).toBe(200);
    expect(await response.json()).toEqual({ updated: 1, action: "read" });

    await expect(row.getByText("read", { exact: true })).toHaveCount(1);
    await expect(row.getByText("unread", { exact: true })).toHaveCount(0);
  });
});
