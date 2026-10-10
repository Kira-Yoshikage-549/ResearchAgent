import { expect, test } from "@playwright/test";
import { mkdirSync } from "node:fs";
import { resolve } from "node:path";
import {
  expectSwissEntry,
  expectMenuSettled,
  mockEntryBackend,
} from "./three-page-helpers";

test.use({ viewport: { width: 1366, height: 768 } });

for (const locale of ["en", "zh-CN"] as const) {
  test(`gray waves fill the divider band with black homepage copy (${locale})`, async ({
    page,
  }) => {
    await mockEntryBackend(page);
    const errors: string[] = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await page.goto(locale === "en" ? "/en" : "/");
    await page.evaluate(() => document.fonts.ready);
    await expectSwissEntry(page);
    const waves = page.getByTestId("welcome-waves");
    await expect(waves).toHaveAttribute("data-motion", "running");
    await expect(waves).toHaveCSS("pointer-events", "none");
    const header = (await page
      .locator('[data-entry-page="welcome"] header')
      .boundingBox())!;
    const footer = (await page
      .locator('[data-entry-page="welcome"] footer')
      .boundingBox())!;
    const bounds = (await waves.boundingBox())!;
    expect(bounds).toEqual({ x: 0, y: 96, width: 1366, height: 608 });
    expect(bounds.y).toBe(header.y + header.height);
    expect(bounds.y + bounds.height).toBe(footer.y);
    await expect(page.locator("main aside")).toHaveCSS("color", "rgb(0, 0, 0)");
    const dot = waves;
    await expect(waves).toHaveAttribute("data-intro", "complete");
    expect(await waves.evaluate((element) => element.tagName)).toBe("A-WAVES");
    expect(
      await waves.evaluate((element) => {
        const style = getComputedStyle(element, "::before");
        return {
          color: style.backgroundColor,
          width: style.width,
          height: style.height,
        };
      }),
    ).toEqual({ color: "rgb(0, 0, 0)", width: "8px", height: "8px" });
    await page.mouse.move(700, 520);
    await expect(dot).toHaveAttribute("data-pointer", "visible");
    await page.mouse.move(950, 520);
    await expect
      .poll(
        async () =>
          await dot.evaluate((element) =>
            parseFloat((element as HTMLElement).style.getPropertyValue("--x")),
          ),
      )
      .toBeGreaterThan(700);
    await expect
      .poll(
        async () =>
          await dot.evaluate((element) =>
            parseFloat((element as HTMLElement).style.getPropertyValue("--x")),
          ),
      )
      .toBeCloseTo(950, 0);
    await page.mouse.move(700, 50);
    await expect(dot).toHaveAttribute("data-pointer", "hidden");
    await page.mouse.move(300, 380);
    await expect(dot).toHaveAttribute("data-pointer", "visible");
    await page.mouse.move(700, 740);
    await expect(dot).toHaveAttribute("data-pointer", "hidden");
    const canvas = waves.locator("canvas");
    await expect(canvas).toHaveCount(1);
    await expect(waves.locator("svg, path")).toHaveCount(0);
    expect(
      await canvas.evaluate((element) => {
        const surface = element as HTMLCanvasElement;
        const ctx = surface.getContext("2d")!;
        const pixels = ctx.getImageData(
          0,
          0,
          surface.width,
          surface.height,
        ).data;
        let visiblePixels = 0;
        let accentPixels = 0;
        for (let i = 0; i < pixels.length; i += 4) {
          if (pixels[i + 3] > 200) {
            visiblePixels++;
            if (pixels[i] > pixels[i + 1] + 20) accentPixels++;
          }
        }
        return {
          color: ctx.strokeStyle,
          width: ctx.lineWidth,
          visible: visiblePixels > 1000,
          accentPixels,
        };
      }),
    ).toEqual({ color: "#aaa9a3", width: 1, visible: true, accentPixels: 0 });
    await expect(
      page.getByRole("button", {
        name: /Pause waves|Resume waves|暂停波纹|继续波纹/,
      }),
    ).toHaveCount(0);
    const snapshot = () =>
      canvas.evaluate((element) => (element as HTMLCanvasElement).toDataURL());
    const initial = await snapshot();
    await expect.poll(snapshot).not.toBe(initial);

    const paragraph = page.locator("main aside p").first();
    const copy = (await paragraph.boundingBox())!;
    await page.mouse.move(copy.x + 4, copy.y + 12);
    await page.mouse.down();
    await page.mouse.move(copy.x + copy.width - 4, copy.y + 12, { steps: 12 });
    await page.mouse.up();
    await expect(dot).toHaveAttribute("data-pointer", "visible");
    expect(
      await page.evaluate(() => window.getSelection()?.toString().length),
    ).toBeGreaterThan(0);
    const next = page.getByRole("button", { name: /NEXT|下一步/, exact: true });
    await expect(next).toHaveCSS("background-color", "rgb(218, 41, 28)");
    const button = (await next.boundingBox())!;
    await page.mouse.move(button.x + 4, button.y + 20);
    await page.mouse.move(button.x + button.width - 4, button.y + 20, {
      steps: 12,
    });
    await expect(dot).toHaveAttribute("data-pointer", "visible");
    // Clear the selection and leave the page before the review screenshot.
    await paragraph.click();
    await page.mouse.move(1365, 767);
    const directory = test.info().outputDir;
    mkdirSync(directory, { recursive: true });
    await page.screenshot({
      path: resolve(directory, `welcome-waves-${locale}.png`),
    });
    await page.mouse.move(800, 500);
    await expect(dot).toHaveAttribute("data-pointer", "visible");
    await page.screenshot({
      path: resolve(directory, `welcome-waves-pointer-${locale}.png`),
    });
    await next.click();
    await expectMenuSettled(page);
    await expect(waves).toHaveAttribute("data-motion", "still");
    expect(errors).toEqual([]);
  });
}

test("reduced motion keeps static contours and a keyboard usable homepage", async ({
  page,
}) => {
  await mockEntryBackend(page);
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/en");
  const waves = page.getByTestId("welcome-waves");
  await expect(waves).toHaveAttribute("data-motion", "still");
  const canvas = waves.locator("canvas");
  const snapshot = () =>
    canvas.evaluate((element) => (element as HTMLCanvasElement).toDataURL());
  const dot = waves;
  const still = await snapshot();
  await page.mouse.move(1100, 500);
  await page.mouse.move(1200, 520, { steps: 8 });
  await page.waitForTimeout(120);
  expect(await snapshot()).toBe(still);
  await expect(dot).toHaveAttribute("data-pointer", "hidden");
  await expect(
    page.locator('[data-entry-page="welcome"]').getByRole("button"),
  ).toHaveCount(2);
  await page.emulateMedia({ reducedMotion: "no-preference" });
  await expect(waves).toHaveAttribute("data-motion", "running");
  await expect.poll(snapshot).not.toBe(still);
  await page.keyboard.press("Tab");
  await expect(
    page
      .locator('[data-entry-page="welcome"]')
      .getByRole("button", { name: "Languages", exact: true }),
  ).toBeFocused();
  await page.keyboard.press("Tab");
  await expect(
    page.getByRole("button", { name: "NEXT", exact: true }),
  ).toBeFocused();
  await page.keyboard.press("Enter");
  await expectMenuSettled(page);
});

test("wave bounds follow desktop resizing and a live language change", async ({
  page,
}) => {
  await mockEntryBackend(page);
  await page.goto("/en");
  const waves = page.getByTestId("welcome-waves");
  async function aligned() {
    const box = (await waves.boundingBox())!;
    const header = (await page
      .locator('[data-entry-page="welcome"] header')
      .boundingBox())!;
    const footer = (await page
      .locator('[data-entry-page="welcome"] footer')
      .boundingBox())!;
    return (
      box.y === header.y + header.height &&
      box.y + box.height === footer.y &&
      box.x === 0
    );
  }
  await page.setViewportSize({ width: 1280, height: 720 });
  await expect.poll(aligned).toBe(true);
  await page
    .locator('[data-entry-page="welcome"]')
    .getByRole("button", { name: "Languages", exact: true })
    .click();
  await expect(page.locator("html")).toHaveAttribute("lang", "zh-CN");
  await expect.poll(aligned).toBe(true);
  await page.setViewportSize({ width: 1366, height: 768 });
  await expect.poll(aligned).toBe(true);
  await expect.poll(async () => (await waves.boundingBox())?.width).toBe(1366);
});
