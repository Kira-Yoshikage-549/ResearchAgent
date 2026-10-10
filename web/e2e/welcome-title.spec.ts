import { expect, test, type Page } from "@playwright/test";
import { resolve } from "node:path";
import { mockEntryBackend, expectMenuSettled } from "./three-page-helpers";

test.use({ viewport: { width: 1366, height: 768 } });

async function glyphSnapshot(page: Page) {
  return page.locator("[data-welcome-wave-canvas]").evaluate((element) => {
    const canvas = element as HTMLCanvasElement;
    const ctx = canvas.getContext("2d")!;
    const ratio = canvas.width / canvas.getBoundingClientRect().width;
    const image = ctx.getImageData(
      Math.round(30 * ratio),
      Math.round(70 * ratio),
      Math.round(660 * ratio),
      Math.round(300 * ratio),
    );
    let hash = 2166136261;
    let count = 0;
    for (let index = 0; index < image.data.length; index += 4) {
      // Ignore gray background lines and hash only the opaque black glyphs.
      if (
        image.data[index + 3] === 255 &&
        image.data[index] === 0 &&
        image.data[index + 1] === 0
      ) {
        hash = Math.imul(hash ^ index, 16777619);
        count++;
      }
    }
    return { hash: hash >>> 0, count };
  });
}

for (const locale of ["en", "zh-CN"] as const) {
  test(`title deforms locally, recovers, remains selectable and returns from menu (${locale})`, async ({
    page,
  }) => {
    await mockEntryBackend(page);
    await page.addInitScript(() => {
      Math.random = () => 0.5;
    });
    const errors: string[] = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await page.goto(locale === "en" ? "/en" : "/");
    await page.evaluate(() => document.fonts.ready);
    const heading = page.getByRole("heading", {
      name: "Research Agent",
      level: 1,
    });
    const waves = page.getByTestId("welcome-waves");
    await expect(heading).toHaveAttribute("data-title-render", "canvas");
    await expect(waves).toHaveAttribute("data-intro", "complete");
    await expect(heading).toHaveCSS("font-size", "144px");
    const box = (await heading.boundingBox())!;
    const still = await glyphSnapshot(page);
    expect(still.count).toBeGreaterThan(20000);
    await page.screenshot({
      path: resolve(test.info().outputDir, `title-static-${locale}.png`),
    });
    await page.mouse.move(1130, 490);
    await page.mouse.move(1230, 510, { steps: 10 });
    await page.waitForTimeout(200);
    expect(await glyphSnapshot(page)).toEqual(still);
    await page.mouse.move(160, 245);
    for (let index = 0; index < 18; index++) {
      await page.mouse.move(
        240 + 135 * Math.sin(index * 0.75),
        270 + 45 * Math.cos(index * 0.8),
      );
      await page.waitForTimeout(12);
    }
    const disturbed = await glyphSnapshot(page);
    expect(disturbed.hash).not.toBe(still.hash);
    expect(disturbed.count).toBeGreaterThan(20000);
    expect(await heading.boundingBox()).toEqual(box);
    await page.screenshot({
      path: resolve(test.info().outputDir, `title-disturbed-${locale}.png`),
    });
    await page.mouse.move(1365, 767);
    await expect
      .poll(() => glyphSnapshot(page), { timeout: 12000 })
      .toEqual(still);
    await page.screenshot({
      path: resolve(test.info().outputDir, `title-returned-${locale}.png`),
    });
    await heading.evaluate((element) => {
      const range = document.createRange();
      range.selectNodeContents(element);
      window.getSelection()!.removeAllRanges();
      window.getSelection()!.addRange(range);
    });
    await expect(heading).toHaveAttribute("data-title-render", "native");
    expect(
      await page.evaluate(() =>
        window.getSelection()?.toString().replace(/\s/g, ""),
      ),
    ).toBe("ResearchAgent");
    expect((await glyphSnapshot(page)).count).toBe(0);
    await page.evaluate(() => window.getSelection()!.removeAllRanges());
    await expect(heading).toHaveAttribute("data-title-render", "canvas");
    await page
      .getByRole("button", { name: /NEXT|下一步/, exact: true })
      .focus();
    await page.keyboard.press("Enter");
    await expectMenuSettled(page);
    await expect(waves).toHaveAttribute("data-motion", "still");
    await page.evaluate(() => window.scrollTo({ top: 0, behavior: "instant" }));
    await expect(waves).toHaveAttribute("data-motion", "running");
    await expect(heading).toHaveAttribute("data-title-render", "canvas");
    expect(await heading.boundingBox()).toEqual(box);
    expect(errors).toEqual([]);
  });
}

test("title falls back to native text for reduced motion, touch, and unavailable Canvas", async ({
  page,
}) => {
  await mockEntryBackend(page);
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/en");
  const heading = page.getByRole("heading", {
    name: "Research Agent",
    level: 1,
  });
  await expect(heading).toHaveAttribute("data-title-render", "native");
  expect((await glyphSnapshot(page)).count).toBe(0);
  await page.evaluate(() => document.fonts.ready);
  const separation = await page
    .locator("[data-welcome-wave-canvas]")
    .evaluate((element) => {
      const canvas = element as HTMLCanvasElement;
      const ctx = canvas.getContext("2d")!;
      const alphaAt = (x: number, y: number, width: number, height: number) => {
        const data = ctx.getImageData(x, y, width, height).data;
        let max = 0;
        for (let i = 3; i < data.length; i += 4) max = Math.max(max, data[i]);
        return max;
      };
      return {
        near: alphaAt(80, 105, 480, 70),
        far: alphaAt(750, 105, 200, 70),
      };
    });
  expect(separation.near).toBeGreaterThan(40);
  expect(separation.near).toBeLessThanOrEqual(78);
  expect(separation.far).toBeGreaterThan(200);
  await page.emulateMedia({ reducedMotion: "no-preference" });
  await expect(heading).toHaveAttribute("data-title-render", "canvas");
  await page
    .locator('[data-entry-page="welcome"]')
    .dispatchEvent("pointermove", {
      pointerType: "touch",
      clientX: 200,
      clientY: 240,
    });
  await expect(heading).toHaveAttribute("data-title-render", "native");
  expect((await glyphSnapshot(page)).count).toBe(0);
  await page.mouse.move(220, 260);
  await expect(heading).toHaveAttribute("data-title-render", "canvas");
  await page.addInitScript(() => {
    HTMLCanvasElement.prototype.getContext = (() =>
      null) as typeof HTMLCanvasElement.prototype.getContext;
  });
  await page.reload();
  await expect(heading).toBeVisible();
  await expect(heading).not.toHaveAttribute("data-title-render", "canvas");
  await expect(heading).toHaveCSS("-webkit-text-fill-color", "rgb(0, 0, 0)");
  await page.getByRole("button", { name: "NEXT", exact: true }).click();
  await expectMenuSettled(page);
});

test("cached glyphs rebuild after desktop resize, font events, locale changes and DPR", async ({
  page,
}) => {
  await mockEntryBackend(page);
  await page.goto("/en");
  const heading = page.getByRole("heading", {
    name: "Research Agent",
    level: 1,
  });
  await expect(heading).toHaveAttribute("data-title-render", "canvas");
  await page.setViewportSize({ width: 1280, height: 720 });
  await expect(heading).toHaveAttribute("data-title-render", "canvas");
  expect((await glyphSnapshot(page)).count).toBeGreaterThan(20000);
  await page.evaluate(() =>
    document.fonts.dispatchEvent(new Event("loadingdone")),
  );
  await expect(heading).toHaveAttribute("data-title-render", "canvas");
  await page
    .locator('[data-entry-page="welcome"]')
    .getByRole("button", { name: "Languages", exact: true })
    .click();
  await expect(page.locator("html")).toHaveAttribute("lang", "zh-CN");
  await expect(heading).toHaveAttribute("data-title-render", "canvas");
  await page.setViewportSize({ width: 1366, height: 768 });
  const session = await page.context().newCDPSession(page);
  await session.send("Emulation.setDeviceMetricsOverride", {
    width: 1366,
    height: 768,
    deviceScaleFactor: 3,
    mobile: false,
  });
  // CDP changes DPR without delivering the resolution event emitted by the OS.
  await page.evaluate(() => window.dispatchEvent(new Event("resize")));
  await expect
    .poll(() =>
      page
        .locator("[data-welcome-wave-canvas]")
        .evaluate((element) => (element as HTMLCanvasElement).width),
    )
    .toBe(2732);
  await expect(heading).toHaveAttribute("data-title-render", "canvas");
  expect((await glyphSnapshot(page)).count).toBeGreaterThan(80000);
  await session.send("Emulation.clearDeviceMetricsOverride");
});
