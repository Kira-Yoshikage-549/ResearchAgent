import { expect, test } from "@playwright/test";
import { mockEntryBackend } from "./three-page-helpers";

const THEME_STORAGE_KEY = "research-agent.theme.v1";

test("legacy dark storage and a system dark preference remain fixed to paper on navigation and reload", async ({
  page,
}) => {
  await mockEntryBackend(page);
  await page.emulateMedia({ colorScheme: "dark" });
  await page.addInitScript(
    (key) => localStorage.setItem(key, "dark"),
    THEME_STORAGE_KEY,
  );
  for (const route of [
    "/en/workspace",
    "/en/research/new",
    "/en/history",
    "/en/settings",
  ]) {
    await page.goto(route);
    await expect(
      page.locator("h1:visible, #research-menu-title:visible").first(),
    ).toBeVisible();
    await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
    await expect(page.locator("html")).toHaveCSS("color-scheme", "light");
    await expect(page.locator("body")).toHaveCSS(
      "background-color",
      "rgb(250, 249, 244)",
    );
    await expect(
      page.getByRole("button", { name: /Switch to (dark|light) theme/ }),
    ).toHaveCount(0);
  }
  await page.reload();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
  await expect(page.locator("body")).toHaveCSS(
    "background-color",
    "rgb(250, 249, 244)",
  );
});

test("primary controls use the red paper palette, square edges and visible keyboard focus", async ({
  page,
}) => {
  await mockEntryBackend(page);
  await page.goto("/en/settings");
  const save = page.getByRole("button", { name: "Save settings", exact: true });
  await expect(save).toHaveCSS("background-color", "rgb(218, 41, 28)");
  await expect(save).toHaveCSS("color", "rgb(250, 249, 244)");
  await expect(save).toHaveCSS("border-radius", "0px");
  await expect(save).toHaveCSS("box-shadow", "none");
  await page.getByLabel("Maximum papers").focus();
  await page.keyboard.press("Tab");
  await page.keyboard.press("Shift+Tab");
  const input = page.getByLabel("Maximum papers");
  await expect(input).toBeFocused();
  await expect(input).toHaveCSS("outline-color", "rgb(218, 41, 28)");
  const focus = await input.evaluate((element) => {
    const style = getComputedStyle(element);
    return {
      color: style.outlineColor,
      width: parseFloat(style.outlineWidth),
      style: style.outlineStyle,
      shadow: style.boxShadow,
    };
  });
  expect(focus.color).toBe("rgb(218, 41, 28)");
  expect(focus.width).toBeGreaterThanOrEqual(2);
  expect(focus.style).toBe("solid");
  expect(focus.shadow).toBe("none");
});

test("API setup remains usable and fixed to paper with dark browser and legacy preferences", async ({
  page,
}) => {
  await mockEntryBackend(page, false);
  await page.emulateMedia({ colorScheme: "dark" });
  await page.addInitScript(
    (key) => localStorage.setItem(key, "dark"),
    THEME_STORAGE_KEY,
  );
  await page.goto("/en/research/new");
  const dialog = page.getByRole("dialog");
  await expect(dialog).toContainText("Configure a DeepSeek API key");
  await expect(dialog).toHaveCSS("background-color", "rgb(250, 249, 244)");
  await expect(dialog).toHaveCSS("box-shadow", "none");
  await expect(dialog.getByRole("button", { name: /theme/i })).toHaveCount(0);
  await dialog.getByLabel("DeepSeek API key").fill("sk-swiss-fixture");
  await dialog.getByRole("button", { name: "Save and continue" }).click();
  await expect(dialog).not.toBeVisible();
  await expect(page.getByLabel("Research question")).toBeVisible();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
});
