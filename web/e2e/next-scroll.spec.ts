import { expect, test } from "@playwright/test";
import { expectMenuSettled, mockEntryBackend } from "./three-page-helpers";

test.use({ viewport: { width: 1366, height: 768 }, video: "on" });

for (const locale of ["en", "zh-CN"] as const) {
  test(`NEXT follows the reference's slow 1.5-second scroll (${locale})`, async ({
    page,
  }) => {
    await mockEntryBackend(page);
    await page.goto(locale === "en" ? "/en" : "/");
    await page.evaluate(() => document.fonts.ready);
    await expect(page.getByTestId("welcome-waves")).toHaveAttribute(
      "data-intro",
      "complete",
    );
    const next = page.getByRole("button", {
      name: locale === "en" ? "NEXT" : "下一步",
      exact: true,
      includeHidden: true,
    });
    const destination = await page
      .getByTestId("research-menu")
      .evaluate((element) => (element as HTMLElement).offsetTop);
    await next.evaluate((button) => {
      button.addEventListener(
        "click",
        () => {
          const startedAt = performance.now();
          const samples: { elapsed: number; y: number }[] = [];
          const sample = () => {
            const elapsed = performance.now() - startedAt;
            samples.push({ elapsed, y: scrollY });
            if (elapsed < 1750) requestAnimationFrame(sample);
            else
              (button as HTMLElement).dataset.scrollSamples =
                JSON.stringify(samples);
          };
          sample();
        },
        { once: true },
      );
    });
    await next.click();
    await expect.poll(() => page.evaluate(() => scrollY)).toBeGreaterThan(300);
    await page.screenshot({
      path: test.info().outputPath(`next-scroll-middle-${locale}.png`),
    });
    await expect(next).toHaveAttribute("data-scroll-samples", /\[/);
    const samples: { elapsed: number; y: number }[] = JSON.parse(
      (await next.getAttribute("data-scroll-samples"))!,
    );
    await test.info().attach(`next-scroll-samples-${locale}`, {
      body: JSON.stringify(samples, null, 2),
      contentType: "application/json",
    });
    const progressAt = (elapsed: number) =>
      samples.reduce((nearest, sample) =>
        Math.abs(sample.elapsed - elapsed) < Math.abs(nearest.elapsed - elapsed)
          ? sample
          : nearest,
      ).y / destination;
    expect(samples[0].y).toBe(0);
    expect(progressAt(375)).toBeGreaterThan(0);
    expect(progressAt(375)).toBeLessThan(0.08);
    expect(progressAt(750)).toBeGreaterThan(0.3);
    expect(progressAt(750)).toBeLessThan(0.7);
    expect(progressAt(1125)).toBeGreaterThan(0.93);
    expect(
      samples.find((sample) => sample.y === destination)!.elapsed,
    ).toBeGreaterThan(1200);
    expect(samples.at(-1)!.y).toBe(destination);
    await expectMenuSettled(page);
    await expect(page.locator("#research-menu-title")).toBeFocused();
    await expect(page).toHaveURL(locale === "en" ? /\/en$/ : /\/$/);
  });
}

test("manual scroll input stops NEXT and does not steal focus", async ({
  page,
}) => {
  await mockEntryBackend(page);
  await page.goto("/en");
  const next = page.getByRole("button", { name: "NEXT", exact: true });
  for (const input of ["wheel", "keyboard", "touch", "scrollbar"] as const) {
    await page.evaluate(() => scrollTo(0, 0));
    await next.click();
    await expect
      .poll(() => page.evaluate(() => scrollY), { intervals: [20] })
      .toBeGreaterThan(40);
    if (input === "wheel") await page.mouse.wheel(0, -80);
    if (input === "keyboard") await page.keyboard.press("ArrowUp");
    if (input === "touch")
      await page.evaluate(() => window.dispatchEvent(new Event("touchstart")));
    if (input === "scrollbar")
      await page.evaluate(() => scrollTo(0, scrollY + 100));
    // Allow native wheel/key movement to settle, then outlast the original tween.
    await page.waitForTimeout(250);
    const interruptedY = await page.evaluate(() => scrollY);
    await page.waitForTimeout(1500);
    expect(await page.evaluate(() => scrollY)).toBe(interruptedY);
    await expect(page.locator("#research-menu-title")).not.toBeFocused();
  }
  await page.evaluate(() => scrollTo(0, 0));
  await next.click();
  await expectMenuSettled(page);
  await expect(page.locator("#research-menu-title")).toBeFocused();
});

test("repeated NEXT clicks keep one scroll; reduced motion arrives immediately", async ({
  page,
}) => {
  await mockEntryBackend(page);
  await page.goto("/en");
  const next = page.getByRole("button", { name: "NEXT", exact: true });
  await next.dblclick();
  await expectMenuSettled(page);
  await expect(page.locator("#research-menu-title")).toBeFocused();
  await page.evaluate(() => scrollTo(0, 0));
  await next.click();
  await expect
    .poll(() => page.evaluate(() => scrollY), { intervals: [20] })
    .toBeGreaterThan(40);
  await page.emulateMedia({ reducedMotion: "reduce" });
  await expectMenuSettled(page);
  await expect(page.locator("[data-welcome-surface]")).toHaveCSS(
    "opacity",
    "1",
  );
  await page.evaluate(() => scrollTo(0, 0));
  await next.focus();
  await page.keyboard.press("Enter");
  expect(await page.evaluate(() => scrollY)).toBe(768);
  await expect(page.locator("#research-menu-title")).toBeFocused();
});
