import { expect, test } from "@playwright/test";
import { expectMenuSettled, mockEntryBackend } from "./three-page-helpers";

test.use({ viewport: { width: 1366, height: 768 } });
test.setTimeout(45_000);

for (const locale of ["en", "zh-CN"] as const) {
  test(
    "menu returns defer waves until welcome is visible and reuse text caches (" +
      locale +
      ")",
    async ({ page }) => {
      await mockEntryBackend(page);
      await page.addInitScript(() => {
        const observed = window as typeof window & {
          waveStarts: number;
          textReads: number;
        };
        observed.waveStarts = 0;
        observed.textReads = 0;
        const define = customElements.define;
        customElements.define = function (name, constructor, options) {
          if (name === "a-waves") {
            const prototype = constructor.prototype;
            const start = prototype.startWaves;
            prototype.startWaves = function (...args: unknown[]) {
              observed.waveStarts++;
              return start.apply(this, args);
            };
          }
          return define.call(this, name, constructor, options);
        };
        const read = CanvasRenderingContext2D.prototype.getImageData;
        CanvasRenderingContext2D.prototype.getImageData = function (...args) {
          observed.textReads++;
          return read.apply(this, args);
        };
      });
      const prefix = locale === "en" ? "/en" : "";
      const counts = () =>
        page.evaluate(() => {
          const observed = window as typeof window & {
            waveStarts: number;
            textReads: number;
          };
          return { starts: observed.waveStarts, reads: observed.textReads };
        });
      await page.goto(prefix + "/workspace");
      await expectMenuSettled(page);
      await page.waitForTimeout(150);
      expect(await counts()).toEqual({ starts: 0, reads: 0 });
      await page.goto(prefix + "/history");
      await page.getByRole("link", { name: /Back to menu|返回菜单/ }).click();
      await expect(page.getByTestId("entry-transition")).toHaveAttribute(
        "data-phase",
        "covering",
      );
      await expect(page.getByTestId("entry-transition")).toHaveCount(0, {
        timeout: 15_000,
      });
      await expectMenuSettled(page);
      expect(await counts()).toEqual({ starts: 0, reads: 0 });
      await page
        .getByRole("button", { name: "Research Agent", exact: true })
        .click();
      const waves = page.getByTestId("welcome-waves");
      await expect(waves).toHaveAttribute("data-intro", "complete");
      await expect(
        page.locator('[data-entry-page="welcome"] h1'),
      ).toHaveAttribute("data-title-render", "canvas");
      await expect(
        page.locator('[data-entry-page="welcome"] aside'),
      ).toHaveAttribute("data-title-render", "canvas");
      const initialized = await counts();
      expect(initialized.starts).toBe(1);
      expect(initialized.reads).toBeGreaterThan(0);
      await page.evaluate(() => {
        for (let i = 0; i < 3; i++) window.dispatchEvent(new Event("resize"));
      });
      await page.waitForTimeout(150);
      expect(await counts()).toEqual(initialized);
      await page.evaluate(() => scrollTo(0, 768));
      await expect(waves).toHaveAttribute("data-motion", "still");
      await page.evaluate(() => scrollTo(0, 0));
      await expect(waves).toHaveAttribute("data-motion", "running");
      expect(await counts()).toEqual(initialized);
      await page.setViewportSize({ width: 1300, height: 768 });
      await expect
        .poll(async () => (await counts()).reads)
        .toBeGreaterThan(initialized.reads);
    },
  );
}
