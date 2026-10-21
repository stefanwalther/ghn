import { expect, test } from "./fixtures";

/**
 * The two views next to the inbox: the repository view and the rate-limit
 * view. Both read the same frozen dataset and the same stand-in, so their
 * numbers are exact.
 */

test.describe("repository view", () => {
  test("lists every seeded repository with its rhythm and pending count", async ({ page }) => {
    await page.goto("/repos");

    await expect(page.getByRole("heading", { name: "Repositories", level: 1 })).toBeVisible();
    await expect(page.getByText("10 of 10", { exact: true })).toBeVisible();

    // The rhythm control is the per-row marker, so it counts the rows.
    const rhythms = page.getByLabel(/^Digest rhythm for /);
    await expect(rhythms).toHaveCount(10);
    expect(
      await rhythms.evaluateAll((elements) =>
        elements.map((element) => element.getAttribute("aria-label"))
      )
    ).toEqual([
      "Digest rhythm for acme/web",
      "Digest rhythm for acme/api",
      "Digest rhythm for acme/mobile",
      "Digest rhythm for vendor/slow-dep",
      "Digest rhythm for vendor/ui-kit",
      "Digest rhythm for oss/router",
      "Digest rhythm for oss/bundler",
      "Digest rhythm for oss/linter",
      "Digest rhythm for vendor/analytics",
      "Digest rhythm for oss/docs",
    ]);
    expect(
      await rhythms.evaluateAll((elements) =>
        elements.map((element) => (element as HTMLSelectElement).value)
      )
    ).toEqual([
      "immediate",
      "immediate",
      "immediate",
      "weekly",
      "weekly",
      "weekly",
      "biweekly",
      "biweekly",
      "monthly",
      "monthly",
    ]);

    // The three immediate repositories hold ten items each, the two weekly
    // ones with twenty-five, the rest with twenty-four.
    await expect(page.getByText("10 pending", { exact: true })).toHaveCount(3);
    await expect(page.getByText("25 pending", { exact: true })).toHaveCount(2);
    await expect(page.getByText("24 pending", { exact: true })).toHaveCount(5);

    await expect(page.getByText("owned", { exact: true })).toHaveCount(3);
    await expect(page.getByText("watched", { exact: true })).toHaveCount(7);
  });

  test("filters the repository list by name", async ({ page }) => {
    await page.goto("/repos");
    await expect(page.getByText("10 of 10", { exact: true })).toBeVisible();

    await page.getByLabel("Filter repositories by name").fill("acme");

    await expect(page.getByText("3 of 10", { exact: true })).toBeVisible();
    await expect(page.getByLabel(/^Digest rhythm for /)).toHaveCount(3);
    expect(
      await page
        .getByLabel(/^Digest rhythm for /)
        .evaluateAll((elements) =>
          elements.map((element) => element.getAttribute("aria-label"))
        )
    ).toEqual([
      "Digest rhythm for acme/web",
      "Digest rhythm for acme/api",
      "Digest rhythm for acme/mobile",
    ]);

    await page.getByRole("button", { name: "Clear", exact: true }).click();

    await expect(page.getByText("10 of 10", { exact: true })).toBeVisible();
    await expect(page.getByLabel(/^Digest rhythm for /)).toHaveCount(10);
  });
});

test.describe("rate-limit view", () => {
  test("shows the buckets the stand-in reports", async ({ page }) => {
    await page.goto("/rate-limits");

    await expect(page.getByRole("heading", { name: "Rate limits", level: 1 })).toBeVisible();

    // The stand-in answers every probe with the same headers, so all three
    // buckets show the same numbers.
    const bars = page.getByRole("progressbar");
    await expect(bars).toHaveCount(3);
    expect(
      await bars.evaluateAll((elements) =>
        elements.map((element) => [
          element.getAttribute("aria-label"),
          element.getAttribute("aria-valuenow"),
        ])
      )
    ).toEqual([
      ["Core (REST) usage", "24.7"],
      ["GraphQL usage", "24.7"],
      ["Search usage", "24.7"],
    ]);

    await expect(page.getByLabel("24.7% used")).toHaveCount(3);
    await expect(
      page.getByText("1,234 / 5,000 used · 3,766 left", { exact: true })
    ).toHaveCount(3);
    await expect(page.getByText("resets unknown", { exact: true })).toHaveCount(3);

    // The fetch instant is the frozen one.
    await expect(page.getByText(/^Fetched 12:00:00 PM/)).toBeVisible();
  });

  test("reads the same buckets again when it refreshes", async ({ page }) => {
    // Every probe of the rate-limit endpoint is counted, so the refresh has
    // to produce a second request. Without the count, a dead refresh button
    // would still leave three progress bars on the page.
    const probes: string[] = [];
    page.on("request", (request) => {
      if (request.url().endsWith("/api/rate-limits")) probes.push(request.url());
    });

    await page.goto("/rate-limits");
    await expect(page.getByRole("progressbar")).toHaveCount(3);
    const before = probes.length;

    const refreshed = page.waitForResponse(
      (response) => response.url().endsWith("/api/rate-limits"),
      { timeout: 10_000 }
    );
    await page.getByRole("button", { name: "Refresh rate limits from GitHub" }).click();
    await refreshed;

    expect(probes.length).toBe(before + 1);
    await expect(page.getByRole("progressbar")).toHaveCount(3);
    expect(
      await page
        .getByRole("progressbar")
        .evaluateAll((elements) =>
          elements.map((element) => element.getAttribute("aria-valuenow"))
        )
    ).toEqual(["24.7", "24.7", "24.7"]);
  });
});
