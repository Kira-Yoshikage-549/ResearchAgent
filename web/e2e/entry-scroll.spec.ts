import { expect, test } from "@playwright/test";
import { mockEntryBackend, expectMenuSettled } from "./three-page-helpers";

test.use({ viewport: { width: 1366, height: 768 } });
const surface = "[data-welcome-surface]";
const content = "[data-entry-action] > span";

test("welcome squeezes against the menu and restores without changing row geometry", async ({
  page,
}) => {
  await mockEntryBackend(page);
  await page.goto("/en");
  await page.evaluate(() => document.fonts.ready);
  const original = await page
    .locator("[data-entry-action]")
    .evaluateAll((rows) =>
      rows.map((row) => row.getBoundingClientRect().top + scrollY),
    );
  await page.evaluate(() => scrollTo(0, 384));
  await expect
    .poll(() =>
      page.locator(surface).evaluate((el) => el.getBoundingClientRect().height),
    )
    .toBeCloseTo(384, 0);
  await page.screenshot({ path: test.info().outputPath("squeeze-middle.png") });
  expect(
    await page
      .locator(surface)
      .evaluate((el) => el.getBoundingClientRect().top),
  ).toBeCloseTo(0, 0);
  expect(
    await page
      .getByTestId("research-menu")
      .evaluate((el) => el.getBoundingClientRect().top),
  ).toBeCloseTo(384, 0);
  await page.evaluate(() => scrollTo(0, 0));
  await expect
    .poll(() =>
      page.locator(surface).evaluate((el) => el.getBoundingClientRect().height),
    )
    .toBeCloseTo(768, 0);
  expect(
    await page
      .locator("[data-entry-action]")
      .evaluateAll((rows) =>
        rows.map((row) => row.getBoundingClientRect().top + scrollY),
      ),
  ).toEqual(original);
});

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

test("language preserves partial squeeze and menu position; brand returns to welcome", async ({
  page,
}) => {
  await mockEntryBackend(page);
  await page.goto("/en");
  await page.evaluate(() => scrollTo(0, 400));
  await page
    .locator('[data-entry-page="welcome"]')
    .getByRole("button", { name: "Languages", exact: true })
    .click();
  await expect(page).toHaveURL(/\/$/);
  await expect.poll(() => page.evaluate(() => scrollY)).toBe(400);
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

test("keyboard focus clears gray; reduced motion shows black without squeeze", async ({
  page,
}) => {
  await mockEntryBackend(page);
  await page.goto("/en");
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
});
