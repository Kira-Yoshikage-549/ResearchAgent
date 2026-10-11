import { expect, test } from "@playwright/test";
import { mockEntryBackend, expectMenuSettled } from "./three-page-helpers";

test.use({ viewport: { width: 1366, height: 768 } });
const surface = "[data-welcome-surface]";
const content = "[data-entry-action] > span";

for (const locale of ["en", "zh-CN"] as const) {
  test(`welcome darkens with parallax and restores without changing geometry (${locale})`, async ({
    page,
  }) => {
    await mockEntryBackend(page);
    await page.goto(locale === "en" ? "/en" : "/");
    await page.evaluate(() => document.fonts.ready);
    await expect(page.getByTestId("welcome-waves")).toHaveAttribute(
      "data-intro",
      "complete",
    );
    const welcome = page.locator(surface);
    const heading = page.getByRole("heading", {
      name: "Research Agent",
      level: 1,
    });
    const titleHeight = await heading.evaluate(
      (el) => el.getBoundingClientRect().height,
    );
    const canvasSize = await page
      .locator("[data-welcome-wave-canvas]")
      .evaluate((el) => [
        (el as HTMLCanvasElement).width,
        (el as HTMLCanvasElement).height,
      ]);
    const original = await page
      .locator("[data-entry-action]")
      .evaluateAll((rows) =>
        rows.map((row) => row.getBoundingClientRect().top + scrollY),
      );
    await page.screenshot({
      path: test.info().outputPath(`welcome-top-${locale}.png`),
    });
    await page.evaluate(() => scrollTo(0, 192));
    await expect(welcome).toHaveCSS("opacity", "0.6875");
    await page.evaluate(() => scrollTo(0, 384));
    await expect(welcome).toHaveCSS("opacity", "0.375");
    await expect
      .poll(() =>
        page
          .locator(surface)
          .evaluate((el) => el.getBoundingClientRect().height),
      )
      .toBeCloseTo(768, 0);
    await page.screenshot({
      path: test.info().outputPath(`welcome-dark-middle-${locale}.png`),
    });
    expect(
      await page
        .locator(surface)
        .evaluate((el) => el.getBoundingClientRect().top),
    ).toBeCloseTo(-307.2, 0);
    expect(
      await page
        .getByTestId("research-menu")
        .evaluate((el) => el.getBoundingClientRect().top),
    ).toBeCloseTo(384, 0);
    expect(
      await heading.evaluate((el) => el.getBoundingClientRect().height),
    ).toBeCloseTo(titleHeight, 1);
    await expect(heading).toHaveCSS("font-size", "144px");
    expect(
      await page
        .locator("[data-welcome-wave-canvas]")
        .evaluate((el) => [
          (el as HTMLCanvasElement).width,
          (el as HTMLCanvasElement).height,
        ]),
    ).toEqual(canvasSize);
    const waves = page.getByTestId("welcome-waves");
    const bounds = (await waves.boundingBox())!;
    await page.mouse.move(bounds.x + 700, bounds.y + 400);
    await expect(waves).toHaveAttribute("data-pointer", "visible");
    for (const [property, value] of [
      ["--x", 700],
      ["--y", 400],
    ] as const) {
      await expect
        .poll(() =>
          waves.evaluate(
            (el, name) =>
              parseFloat((el as HTMLElement).style.getPropertyValue(name)),
            property,
          ),
        )
        .toBeCloseTo(value, 0);
    }
    await expect(welcome).toHaveCSS("opacity", "0.375");
    await page.evaluate(() => scrollTo(0, 615));
    await expect(welcome).toHaveCSS("opacity", "0");
    await expect(welcome).toHaveCSS("pointer-events", "none");
    expect(
      await welcome.evaluate((el) =>
        el.contains(document.elementFromPoint(100, 50)),
      ),
    ).toBe(false);
    await page.mouse.click(100, 50);
    expect(await page.evaluate(() => scrollY)).toBe(615);
    await page.screenshot({
      path: test.info().outputPath(`welcome-black-${locale}.png`),
    });
    await page.evaluate(() => scrollTo(0, 768));
    await expectMenuSettled(page);
    await expect(waves).toHaveAttribute("data-motion", "still");
    for (const row of await page.locator(content).all()) {
      await expect
        .poll(() =>
          row.evaluate(
            (el) => new DOMMatrix(getComputedStyle(el, "::after").transform).a,
          ),
        )
        .toBe(0);
    }
    await page.screenshot({
      path: test.info().outputPath(`menu-settled-${locale}.png`),
    });
    await page.evaluate(() => scrollTo(0, 384));
    await expect(welcome).toHaveCSS("opacity", "0.375");
    await expect(waves).toHaveAttribute("data-motion", "running");
    await page.screenshot({
      path: test.info().outputPath(`welcome-reverse-${locale}.png`),
    });
    for (const position of [0, 768, 300, 615, 192, 768, 0])
      await page.evaluate((y) => scrollTo(0, y), position);
    await page.evaluate(() => scrollTo(0, 0));
    await expect(welcome).toHaveCSS("opacity", "1");
    await expect(welcome).toHaveCSS("pointer-events", "auto");
    await expect(welcome).toHaveCSS("transform", "matrix(1, 0, 0, 1, 0, 0)");
    await expect
      .poll(() =>
        page
          .locator(surface)
          .evaluate((el) => el.getBoundingClientRect().height),
      )
      .toBeCloseTo(768, 0);
    expect(
      await page
        .locator("[data-entry-action]")
        .evaluateAll((rows) =>
          rows.map((row) => row.getBoundingClientRect().top + scrollY),
        ),
    ).toEqual(original);
    await page.screenshot({
      path: test.info().outputPath(`welcome-restored-${locale}.png`),
    });
  });
}

test("left-to-right cover continues after stopping and reverses from its current position", async ({
  page,
}) => {
  await mockEntryBackend(page);
  await page.goto("/en");
  const first = page.locator(content).first();
  const scale = () =>
    first.evaluate(
      (el) => new DOMMatrix(getComputedStyle(el, "::after").transform).a,
    );
  expect(await scale()).toBe(1);
  const top = await page
    .locator("[data-entry-action]")
    .first()
    .evaluate((el) => el.getBoundingClientRect().top + scrollY);
  await page.evaluate((y) => scrollTo(0, y), top - 768 * 0.85 - 4);
  await page.screenshot({ path: test.info().outputPath("reveal-before.png") });
  await page.evaluate((y) => scrollTo(0, y), top - 768 * 0.85 + 4);
  await expect.poll(scale, { intervals: [30] }).toBeLessThan(0.7);
  // Freeze this transition frame for capture; resume before testing interruption.
  await first.evaluate((el) =>
    el
      .getAnimations({ subtree: true })
      .forEach((animation) => animation.pause()),
  );
  await page.screenshot({ path: test.info().outputPath("reveal-middle.png") });
  await first.evaluate((el) =>
    el
      .getAnimations({ subtree: true })
      .forEach((animation) => animation.play()),
  );
  const middle = await scale();
  expect(middle).toBeGreaterThan(0);
  const y = await page.evaluate(() => scrollY);
  await page.evaluate((y) => scrollTo(0, y), top - 768 * 0.85 - 4);
  const reverse = await scale();
  expect(Math.abs(reverse - middle)).toBeLessThan(0.4);
  await expect.poll(scale).toBe(1);
  await page.evaluate((y) => scrollTo(0, y), y);
  await expect.poll(scale).toBe(0);
  await expect(first).toHaveCSS("transform", "matrix(1, 0, 0, 1, 0, 0)");
  await page.screenshot({
    path: test.info().outputPath("reveal-complete.png"),
  });
  expect(await page.evaluate(() => scrollY)).toBe(y);
  await page.evaluate((y) => scrollTo(0, y), top - 768 * 0.85 - 4);
  await expect.poll(scale, { intervals: [30] }).toBeGreaterThan(0.4);
  await first.evaluate((el) =>
    el
      .getAnimations({ subtree: true })
      .forEach((animation) => animation.pause()),
  );
  await page.screenshot({ path: test.info().outputPath("reverse-middle.png") });
  await first.evaluate((el) =>
    el
      .getAnimations({ subtree: true })
      .forEach((animation) => animation.play()),
  );
  await expect.poll(scale).toBe(1);
  for (const position of [0, 768, 300, 768, 0])
    await page.evaluate((y) => scrollTo(0, y), position);
  await expect.poll(scale).toBe(1);
});

test("language preserves partial darkening and menu position; brand returns to welcome", async ({
  page,
}) => {
  await mockEntryBackend(page);
  await page.goto("/en");
  await page.evaluate(() => scrollTo(0, 400));
  await page
    .getByTestId("research-menu")
    .getByRole("button", { name: "Languages", exact: true })
    .click();
  await expect(page).toHaveURL(/\/$/);
  await expect.poll(() => page.evaluate(() => scrollY)).toBe(400);
  await expect
    .poll(() =>
      page
        .locator(surface)
        .evaluate((el) => Number(getComputedStyle(el).opacity)),
    )
    .toBeCloseTo(1 - (400 / 768) * 1.25, 5);
  expect(
    await page
      .locator(surface)
      .evaluate((el) => el.getBoundingClientRect().height),
  ).toBe(768);
  await page.getByRole("button", { name: "下一步", exact: true }).click();
  await expectMenuSettled(page);
  await page
    .getByTestId("research-menu")
    .getByRole("button", { name: "语言选项", exact: true })
    .click();
  await expect(page).toHaveURL(/\/en$/);
  await expectMenuSettled(page);
  await page
    .getByRole("button", { name: "Research Agent", exact: true })
    .click();
  await expect.poll(() => page.evaluate(() => scrollY)).toBe(0);
});

test("keyboard restores a fully dark welcome; reduced motion keeps full brightness and clears menu covers", async ({
  page,
}) => {
  await mockEntryBackend(page);
  await page.goto("/en");
  await page.evaluate(() => scrollTo(0, 615));
  await expect(page.locator(surface)).toHaveCSS("opacity", "0");
  await page.keyboard.press("Tab");
  await expect.poll(() => page.evaluate(() => scrollY)).toBe(0);
  await expect(page.locator(surface)).toHaveCSS("opacity", "1");
  await page.locator("[data-entry-action]").first().focus();
  await page.keyboard.press("Tab");
  await expect(page.locator(content).nth(1)).toHaveCSS(
    "transform",
    "matrix(1, 0, 0, 1, 0, 0)",
  );
  expect(
    await page
      .locator(content)
      .nth(1)
      .evaluate(
        (el) => new DOMMatrix(getComputedStyle(el, "::after").transform).a,
      ),
  ).toBe(0);
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.evaluate(() => scrollTo(0, 384));
  await expect(page.locator(surface)).toHaveCSS("transform", "none");
  await expect(page.locator(surface)).toHaveCSS("opacity", "1");
  await expect(page.locator(surface)).toHaveCSS("pointer-events", "auto");
  for (const row of await page.locator(content).all()) {
    // The global reduced-motion reset uses a near-zero duration with !important.
    expect(
      await row.evaluate((el) =>
        parseFloat(getComputedStyle(el).transitionDuration),
      ),
    ).toBeLessThanOrEqual(0.001);
    expect(
      await row.evaluate(
        (el) => new DOMMatrix(getComputedStyle(el, "::after").transform).a,
      ),
    ).toBe(0);
  }
  await page.emulateMedia({ reducedMotion: "no-preference" });
  await expect(page.locator(surface)).toHaveCSS("opacity", "0.375");
  await page.evaluate(() => scrollTo(0, 615));
  await expect(page.locator(surface)).toHaveCSS("pointer-events", "none");
  await page.emulateMedia({ reducedMotion: "reduce" });
  await expect(page.locator(surface)).toHaveCSS("opacity", "1");
  await expect(page.locator(surface)).toHaveCSS("transform", "none");
  await expect(page.locator(surface)).toHaveCSS("pointer-events", "auto");
});
