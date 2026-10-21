import { expect, test } from "@playwright/test";

// Theme switcher + version footer smoke: structural invariants only, no
// mutations, no live GitHub writes.
test.describe("theme switcher", () => {
  test("dropdown lists light, dark and system with system checked", async ({
    page,
  }) => {
    await page.goto("/");
    const trigger = page.getByRole("button", { name: "Theme", exact: true });
    await expect(trigger).toBeVisible();
    await expect(trigger).toHaveAttribute("title", "Theme (Cmd+F12)");
    await trigger.click();
    const menu = page.getByRole("menu", { name: "Theme" });
    await expect(menu).toBeVisible();
    await expect(menu.getByRole("menuitemradio", { name: "Light" })).toBeVisible();
    await expect(menu.getByRole("menuitemradio", { name: "Dark" })).toBeVisible();
    const system = menu.getByRole("menuitemradio", { name: "System" });
    await expect(system).toBeVisible();
    await expect(system).toHaveAttribute("aria-checked", "true");
    await page.keyboard.press("Escape");
    await expect(menu).toHaveCount(0);
  });

  test("Cmd+F12 cycles the mode and persists across reload", async ({
    page,
  }) => {
    await page.goto("/");
    const trigger = page.getByRole("button", { name: "Theme", exact: true });
    await trigger.click();
    const menu = page.getByRole("menu", { name: "Theme" });
    await expect(
      menu.getByRole("menuitemradio", { name: "System" })
    ).toHaveAttribute("aria-checked", "true");
    await page.keyboard.press("Escape");

    await page.keyboard.press("Meta+F12");
    await trigger.click();
    await expect(
      menu.getByRole("menuitemradio", { name: "Light" })
    ).toHaveAttribute("aria-checked", "true");
    await page.keyboard.press("Escape");

    await page.reload();
    await trigger.click();
    await expect(
      menu.getByRole("menuitemradio", { name: "Light" })
    ).toHaveAttribute("aria-checked", "true");
  });

  test("sidebar footer shows the version with a repo link", async ({
    page,
  }) => {
    await page.goto("/");
    const footer = page.locator("aside").getByText(/^v\d+\.\d+\.\d+$/);
    await expect(footer).toBeVisible();
    const repoLink = page.locator("aside").getByRole("link", {
      name: "GitHub repository",
    });
    await expect(repoLink).toBeVisible();
    await expect(repoLink).toHaveAttribute(
      "href",
      "https://github.com/stefanwalther/ghn"
    );
  });
});
