import { expect, test, type Page } from "@playwright/test";
import { resolve } from "node:path";
import sharp from "sharp";
import { mockEntryBackend, expectMenuSettled } from "./three-page-helpers";

test.use({ viewport: { width: 1366, height: 768 } });

async function copySnapshot(page: Page) {
  return page.locator("[data-welcome-wave-canvas]").evaluate((element) => {
    const canvas = element as HTMLCanvasElement;
    const bounds = canvas.getBoundingClientRect();
    const copy = document
      .querySelector('[data-entry-page="welcome"] aside')!
      .getBoundingClientRect();
    const ratio = canvas.width / bounds.width;
    const data = canvas
      .getContext("2d")!
      .getImageData(
        Math.floor((copy.left - bounds.left - 5) * ratio),
        Math.floor((copy.top - bounds.top - 5) * ratio),
        Math.ceil((copy.width + 10) * ratio),
        Math.ceil((copy.height + 10) * ratio),
      ).data;
    let hash = 2166136261;
    let count = 0;
    for (let i = 0; i < data.length; i += 4) {
      if (data[i + 3] === 255 && data[i] === 0 && data[i + 1] === 0) {
        hash = Math.imul(hash ^ i, 16777619);
        count++;
      }
    }
    return { hash: hash >>> 0, count };
  });
}

for (const locale of ["en", "zh-CN"] as const) {
  test(`wrapped description deforms, recovers, stays selectable and survives navigation (${locale})`, async ({
    page,
  }) => {
    await mockEntryBackend(page);
    const errors: string[] = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await page.goto(locale === "en" ? "/en" : "/");
    await page.evaluate(() => document.fonts.ready);
    const copy = page.locator('[data-entry-page="welcome"] aside');
    const heading = page.getByRole("heading", {
      name: "Research Agent",
      level: 1,
    });
    await expect(copy).toHaveAttribute("data-title-render", "canvas");
    await expect(page.getByTestId("welcome-waves")).toHaveAttribute(
      "data-intro",
      "complete",
    );
    const box = (await copy.boundingBox())!;
    const text = await copy.innerText();
    const still = await copySnapshot(page);
    expect(still.count).toBeGreaterThan(300);
    await page.screenshot({
      path: resolve(test.info().outputDir, `copy-static-${locale}.png`),
    });
    const cached = await sharp(await copy.screenshot())
      .raw()
      .toBuffer({ resolveWithObject: true });
    await page.emulateMedia({ reducedMotion: "reduce" });
    await expect(copy).toHaveAttribute("data-title-render", "native");
    const native = await sharp(await copy.screenshot())
      .raw()
      .toBuffer({ resolveWithObject: true });
    expect(cached.info).toEqual(native.info);
    let union = 0;
    let difference = 0;
    const dark = (data: Buffer, index: number) =>
      data[index] < 60 && data[index + 1] < 60 && data[index + 2] < 60;
    for (let i = 0; i < cached.data.length; i += cached.info.channels) {
      const a = dark(cached.data, i),
        b = dark(native.data, i);
      if (a || b) union++;
      if (a !== b) difference++;
    }
    // Preserve native wrapping, baseline and thin strokes at fractional column positions.
    expect(difference / union).toBeLessThan(0.01);
    await page.emulateMedia({ reducedMotion: "no-preference" });
    await expect(copy).toHaveAttribute("data-title-render", "canvas");
    await page.mouse.move(100, 260);
    await page.mouse.move(400, 300, { steps: 15 });
    expect(await copySnapshot(page)).toEqual(still);
    // Exercise both paragraphs, including immediate direction reversals.
    for (const paragraph of await copy.locator("p").all()) {
      const line = (await paragraph.boundingBox())!;
      for (let i = 0; i < 18; i++) {
        await page.mouse.move(
          line.x + 130 + 100 * Math.sin(i * 0.75),
          line.y + line.height / 2 + 15 * Math.cos(i),
        );
        await page.waitForTimeout(12);
      }
      expect((await copySnapshot(page)).hash).not.toBe(still.hash);
    }
    await page.screenshot({
      path: resolve(test.info().outputDir, `copy-disturbed-${locale}.png`),
    });
    expect(await copy.boundingBox()).toEqual(box);
    await page.mouse.move(1365, 767);
    await expect
      .poll(() => copySnapshot(page), { timeout: 12000 })
      .toEqual(still);
    await page.screenshot({
      path: resolve(test.info().outputDir, `copy-returned-${locale}.png`),
    });
    await copy.evaluate((element) => {
      const range = document.createRange();
      range.selectNodeContents(element);
      window.getSelection()!.removeAllRanges();
      window.getSelection()!.addRange(range);
    });
    await expect(copy).toHaveAttribute("data-title-render", "native");
    await expect(heading).toHaveAttribute("data-title-render", "canvas");
    expect(
      await page.evaluate(() =>
        window.getSelection()!.toString().replace(/\s/g, ""),
      ),
    ).toBe(text.replace(/\s/g, ""));
    expect((await copySnapshot(page)).count).toBe(0);
    await page.evaluate(() => window.getSelection()!.removeAllRanges());
    await expect(copy).toHaveAttribute("data-title-render", "canvas");
    await page
      .getByRole("button", { name: /NEXT|下一步/, exact: true })
      .focus();
    await page.keyboard.press("Enter");
    await expectMenuSettled(page);
    await page.evaluate(() => window.scrollTo({ top: 0, behavior: "instant" }));
    await expect(copy).toHaveAttribute("data-title-render", "canvas");
    await expect(page.getByTestId("welcome-waves")).toHaveAttribute(
      "data-motion",
      "running",
    );
    expect(await copy.boundingBox()).toEqual(box);
    expect(errors).toEqual([]);
  });
}

test("description rebuilds for line wrapping, fonts, locale and DPR; falls back for motion, touch and Canvas", async ({
  page,
}) => {
  await mockEntryBackend(page);
  await page.goto("/en");
  const copy = page.locator('[data-entry-page="welcome"] aside');
  await expect(copy).toHaveAttribute("data-title-render", "canvas");
  await page.setViewportSize({ width: 1280, height: 720 });
  await page.evaluate(() =>
    document.fonts.dispatchEvent(new Event("loadingdone")),
  );
  await expect(copy).toHaveAttribute("data-title-render", "canvas");
  expect((await copySnapshot(page)).count).toBeGreaterThan(300);
  await page
    .locator('[data-entry-page="welcome"]')
    .getByRole("button", { name: "Languages", exact: true })
    .click();
  await expect(page.locator("html")).toHaveAttribute("lang", "zh-CN");
  await expect(copy).toHaveAttribute("data-title-render", "canvas");
  expect((await copySnapshot(page)).count).toBeGreaterThan(300);
  const session = await page.context().newCDPSession(page);
  await session.send("Emulation.setDeviceMetricsOverride", {
    width: 1366,
    height: 768,
    deviceScaleFactor: 2,
    mobile: false,
  });
  await page.evaluate(() => window.dispatchEvent(new Event("resize")));
  await expect
    .poll(() =>
      page
        .locator("[data-welcome-wave-canvas]")
        .evaluate((element) => (element as HTMLCanvasElement).width),
    )
    .toBe(2732);
  expect((await copySnapshot(page)).count).toBeGreaterThan(1200);
  await session.send("Emulation.clearDeviceMetricsOverride");
  await page.emulateMedia({ reducedMotion: "reduce" });
  await expect(copy).toHaveAttribute("data-title-render", "native");
  expect((await copySnapshot(page)).count).toBe(0);
  await expect(copy).toHaveCSS("-webkit-text-fill-color", "rgb(0, 0, 0)");
  await page.emulateMedia({ reducedMotion: "no-preference" });
  await expect(copy).toHaveAttribute("data-title-render", "canvas");
  await page
    .locator('[data-entry-page="welcome"]')
    .dispatchEvent("pointermove", {
      pointerType: "touch",
      clientX: 1100,
      clientY: 220,
    });
  await expect(copy).toHaveAttribute("data-title-render", "native");
  await page.mouse.move(1100, 220);
  await expect(copy).toHaveAttribute("data-title-render", "canvas");
  await page.addInitScript(() => {
    HTMLCanvasElement.prototype.getContext = (() =>
      null) as typeof HTMLCanvasElement.prototype.getContext;
  });
  await page.reload();
  await expect(copy).toBeVisible();
  await expect(copy).not.toHaveAttribute("data-title-render", "canvas");
  await expect(copy).toHaveCSS("-webkit-text-fill-color", "rgb(0, 0, 0)");
});
