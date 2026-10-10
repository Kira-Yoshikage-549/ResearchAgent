import { expect, test } from "@playwright/test";
import {
  expectSwissEntry,
  expectMenuSettled,
  mockEntryBackend,
} from "./three-page-helpers";

test("NEXT scrolls into the mounted menu and preserves tab-scoped memory", async ({
  page,
  context,
}) => {
  await mockEntryBackend(page);
  const api: string[] = [];
  page.on("request", (request) => {
    if (request.url().includes("/api/v1/")) api.push(request.url());
  });
  await page.goto("/en");
  await expectSwissEntry(page);
  expect(api).toEqual([]);
  const canvas = await page.getByTestId("welcome-waves").elementHandle();
  await page.getByRole("button", { name: "NEXT", exact: true }).click();
  await expectMenuSettled(page);
  await expect(page).toHaveURL(/\/en$/);
  await expectSwissEntry(page);
  expect(await canvas!.evaluate((element) => element.isConnected)).toBe(true);
  await expect(page.getByTestId("welcome-waves")).toHaveAttribute(
    "data-motion",
    "still",
  );
  await page.goto("/en");
  await expectMenuSettled(page);
  await expect(page).toHaveURL(/\/en$/);
  const tab = await context.newPage();
  await tab.goto("/en");
  expect(await tab.evaluate(() => scrollY)).toBe(0);
  await expect(
    tab.getByRole("button", { name: "NEXT", exact: true }),
  ).toBeVisible();
  await tab.close();
});

test("numbered menu retains question, history and settings destinations", async ({
  page,
}) => {
  await mockEntryBackend(page);
  await page.goto("/en/workspace");
  await expectMenuSettled(page);
  await expectSwissEntry(page);
  const menu = page.getByTestId("research-menu");
  await menu.getByRole("link", { name: /NEW RESEARCH/ }).click();
  await expect(page).toHaveURL(/\/en\/research\/new$/);
  await expect(page.getByLabel("Research question")).toBeVisible();
  await expectSwissEntry(page);
  await page.goto("/en/workspace");
  await menu.getByRole("link", { name: /history/i }).click();
  await expect(page).toHaveURL(/\/en\/history$/);
  await expect(
    page.getByRole("heading", { name: "Research history", exact: true }),
  ).toBeVisible();
  await page.goto("/en/workspace");
  const settings = menu.getByRole("link", { name: /Settings/ });
  expect((await settings.boundingBox())?.height).toBeGreaterThanOrEqual(44);
  await settings.click();
  await expect(page).toHaveURL(/\/en\/settings$/);
});

test("overlay setup waits for the menu and preserves its canvas and position", async ({
  page,
}) => {
  await mockEntryBackend(page, false);
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/en");
  await expect(page.getByRole("dialog")).toHaveCount(0);
  const canvas = await page.getByTestId("welcome-waves").elementHandle();
  await page.getByRole("button", { name: "NEXT", exact: true }).focus();
  await page.keyboard.press("Enter");
  const dialog = page.getByRole("dialog");
  await expect(dialog).toContainText("Configure a DeepSeek API key");
  await expectMenuSettled(page);
  const position = await page.evaluate(() => scrollY);
  await dialog.getByLabel("DeepSeek API key").fill("sk-entry-fixture");
  await dialog.getByRole("button", { name: "Save and continue" }).click();
  await expect(dialog).not.toBeVisible();
  expect(await page.evaluate(() => scrollY)).toBe(position);
  expect(await canvas!.evaluate((element) => element.isConnected)).toBe(true);
  await page.getByRole("link", { name: /NEW RESEARCH/ }).focus();
  await page.keyboard.press("Enter");
  await expect(page.getByLabel("Research question")).toBeVisible();
});

test("restricted storage keeps scrolling entry usable", async ({ page }) => {
  await mockEntryBackend(page);
  await page.addInitScript(() =>
    Object.defineProperty(window, "sessionStorage", {
      get() {
        throw new Error("Storage blocked");
      },
    }),
  );
  await page.goto("/en");
  await page.getByRole("button", { name: "NEXT", exact: true }).click();
  await expectMenuSettled(page);
  await page.getByRole("link", { name: /NEW RESEARCH/ }).click();
  await expect(page.getByLabel("Research question")).toBeVisible();
});

test("backend-offline welcome uses local typography and makes no settings request", async ({
  page,
}) => {
  const api: string[] = [];
  await page.route("**/api/v1/**", (route) => {
    api.push(route.request().url());
    return route.abort();
  });
  await page.goto("/en");
  await page.evaluate(() => document.fonts.ready);
  await expectSwissEntry(page);
  await expect(
    page.getByRole("button", { name: "NEXT", exact: true }),
  ).toBeVisible();
  expect(
    await page
      .getByRole("heading", { level: 1 })
      .evaluate((element) => getComputedStyle(element).fontFamily),
  ).toContain("Inter");
  expect(api).toEqual([]);
});
