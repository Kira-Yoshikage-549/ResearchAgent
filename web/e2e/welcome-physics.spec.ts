import { expect, test } from "@playwright/test";
import { mkdirSync } from "node:fs";
import { resolve } from "node:path";
import { expectSwissEntry, mockEntryBackend } from "./three-page-helpers";

test.use({ viewport: { width: 1366, height: 768 } });

for (const locale of ["en", "zh-CN"] as const) {
  test(`Swiss entry composition and local typography at 1366 × 768 (${locale})`, async ({
    page,
  }) => {
    await mockEntryBackend(page);
    const retiredMedia: string[] = [];
    page.on("request", (request) => {
      if (/\/(?:brand-robot|design-text|research-robot)\//.test(request.url()))
        retiredMedia.push(request.url());
    });
    const directory = test.info().outputDir;
    mkdirSync(directory, { recursive: true });
    const prefix = locale === "en" ? "/en" : "";
    for (const [name, route] of [
      ["welcome", ""],
      ["menu", "/workspace"],
      ["question", "/research/new"],
    ] as const) {
      await page.goto(`${prefix}${route}` || "/");
      const control =
        name === "welcome"
          ? page.getByRole("button", { name: /NEXT|下一步/ })
          : name === "menu"
            ? page.getByRole("link", { name: /NEW RESEARCH|新建研究/ })
            : page.getByRole("button", { name: /SEND TO AGENT|发送给 Agent/i });
      await expect(control).toBeVisible();
      await page.evaluate(() => document.fonts.ready);
      await expectSwissEntry(page);
      const grid = page
        .locator(
          name === "welcome"
            ? "[data-entry-canvas]"
            : name === "menu"
              ? '[data-testid="research-menu"] > div'
              : "main > div",
        )
        .first();
      const bounds = await grid.boundingBox();
      expect(bounds?.x).toBe(48);
      expect(bounds?.width).toBe(1270);
      await expect(grid).toHaveCSS("column-gap", "24px");
      const columns = await grid.evaluate((element) =>
        getComputedStyle(element).gridTemplateColumns.split(" "),
      );
      expect(columns).toHaveLength(12);
      await expect(control).toBeInViewport();
      const actionBounds = await control.boundingBox();
      expect(actionBounds!.height).toBeGreaterThanOrEqual(44);
      expect(actionBounds!.y + actionBounds!.height).toBeLessThanOrEqual(768);
      const heading = page.getByRole("heading", {
        level: name === "menu" ? 2 : 1,
      });
      await expect(heading).toHaveCSS(
        "font-size",
        name === "welcome" ? "144px" : "96px",
      );
      await expect(heading).toHaveCSS("font-weight", "700");
      await expect(heading).toHaveCSS("text-align", "left");
      const weights = await page
        .locator("main")
        .evaluate((main) =>
          [
            ...main.querySelectorAll(
              "h1,h2,p,a,button,label,textarea,summary,span",
            ),
          ].map((element) => getComputedStyle(element).fontWeight),
        );
      expect(
        [...new Set(weights)].every(
          (weight) => weight === "400" || weight === "700",
        ),
      ).toBe(true);
      if (name === "question") {
        const input = page.getByRole("textbox");
        await expect(input).toHaveCSS("font-size", "14px");
        await expect(input).toHaveCSS("border-radius", "0px");
        const inputBounds = await input.boundingBox();
        expect(inputBounds!.x).toBe(48);
        expect(inputBounds!.y + inputBounds!.height).toBeLessThan(
          actionBounds!.y,
        );
      }
      await page.screenshot({
        path: resolve(directory, `${name}-${locale}.png`),
        animations: "disabled",
      });
    }
    expect(retiredMedia).toEqual([]);
  });
}
