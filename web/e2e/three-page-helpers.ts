import { expect, type Page } from "@playwright/test";

export async function expectMenuSettled(page: Page) {
  await expect
    .poll(() =>
      page
        .getByTestId("research-menu")
        .evaluate((element) => element.getBoundingClientRect().top),
    )
    .toBeCloseTo(0, 0);
  await expect(page.locator("[data-welcome-surface]")).toHaveAttribute(
    "data-collapsed",
    "true",
  );
}

export async function mockEntryBackend(page: Page, configured = true) {
  let apiKeyConfigured = configured;
  await page.route("**/api/v1/settings/deepseek", (route) => {
    if (route.request().method() === "PUT") apiKeyConfigured = true;
    return route.fulfill({
      json: {
        provider: "deepseek",
        default_model: "deepseek-v4-flash",
        api_key_required: true,
        api_key_configured: apiKeyConfigured,
      },
    });
  });
  await page.route("**/api/v1/research/tasks/active", (route) =>
    route.fulfill({ status: 204 }),
  );
  await page.route("**/api/v1/research/history*", (route) =>
    route.fulfill({ json: [] }),
  );
}

export async function expectSwissEntry(page: Page) {
  await expect(
    page.locator("h1:visible, #research-menu-title:visible").first(),
  ).toBeVisible();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
  await expect(page.locator("main")).toHaveCSS(
    "background-color",
    "rgb(250, 249, 244)",
  );
  await expect(
    page.locator(
      "[data-pet-state], [data-brand-media], [data-research-media], [data-design-text], video, canvas:not([data-welcome-wave-canvas])",
    ),
  ).toHaveCount(0);
  await expect(page.getByTestId("brand-robot")).toHaveCount(0);
  await expect(page.getByTestId("research-stage-robot")).toHaveCount(0);
  await expectNoHorizontalOverflow(page);
}

export async function expectNoHorizontalOverflow(page: Page) {
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
}
