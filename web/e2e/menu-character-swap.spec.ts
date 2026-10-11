import path from "node:path";
import { writeFile } from "node:fs/promises";
import sharp from "sharp";
import { expect, test, type Page } from "@playwright/test";
import { expectMenuSettled, mockEntryBackend } from "./three-page-helpers";

test.use({
  viewport: { width: 1366, height: 768 },
  video: { mode: "on", size: { width: 1366, height: 768 } },
});
test.setTimeout(60_000);
const evidence = path.resolve(process.cwd(), "../docs/frontend-swiss");
const hostSelector = "[data-menu-character-swap]";
const movingSelector = `${hostSelector} [data-swap-direction]`;
const activeRoundSelector = `${hostSelector}[data-swap-count]`;

type Character = {
  index: number;
  direction: string;
  startedAt: number;
  endedAt?: number;
};
type Round = { id: string; characters: Character[] };

async function openMenu(page: Page, locale = "en") {
  await mockEntryBackend(page);
  await page.goto(locale === "en" ? "/en/workspace" : "/workspace");
  await page.evaluate(() => document.fonts.ready);
  await expectMenuSettled(page);
  await expect(page.locator(hostSelector)).toHaveAttribute(
    "data-swap-ready",
    "true",
  );
}

async function expectPlaying(page: Page, timeout = 6000) {
  await expect(page.locator(activeRoundSelector)).toHaveCount(1, { timeout });
  const count = await page.locator(movingSelector).count();
  expect(count).toBeGreaterThanOrEqual(1);
  expect(count).toBeLessThanOrEqual(4);
  return count;
}

async function expectFreshWait(page: Page) {
  await page.waitForTimeout(1700);
  await expect(page.locator(movingSelector)).toHaveCount(0);
  await expectPlaying(page, 3600);
}

test.afterEach(async ({ page }) => {
  const locale = test
    .info()
    .title.match(/^natural playback.*\((en|zh-CN)\)$/)?.[1];
  if (locale && test.info().status === "passed") {
    const video = page.video();
    await page.close();
    await video?.saveAs(
      path.join(evidence, "videos", `menu-character-swap-${locale}.webm`),
    );
  }
});

for (const locale of ["en", "zh-CN"]) {
  test(`native geometry, copying and simultaneous vertical windows (${locale})`, async ({
    page,
  }) => {
    await openMenu(page, locale);
    // Capture the original title without a timing race against the shorter idle wait.
    await page.emulateMedia({ reducedMotion: "reduce" });
    await expect(page.locator(movingSelector)).toHaveCount(0);
    const title = page.locator("#research-menu-title");
    const text = locale === "en" ? "Choose your next step" : "选择下一步";
    const baseline = await title.boundingBox();
    await expect(title).toHaveAccessibleName(text);
    await expect(title).toHaveText(text);
    await expect(title).toHaveCSS("font-size", "96px");
    await expect(title).toHaveCSS("letter-spacing", "-3.84px");
    await expect(title).toHaveCSS("line-height", "96px");
    const native = await title.screenshot({
      path: test.info().outputPath("native-title.png"),
    });
    await page.screenshot({
      path: path.join(
        evidence,
        "screenshots",
        `menu-character-static-${locale}.png`,
      ),
    });
    await page.emulateMedia({ reducedMotion: "no-preference" });
    const count = await expectPlaying(page);
    const shapes = await page.locator(hostSelector).evaluate((element) => {
      element.getAnimations({ subtree: true }).forEach((animation) => {
        animation.pause();
        animation.currentTime = 0;
      });
      return Array.from(
        element.querySelectorAll<HTMLElement>("[data-swap-direction]"),
      ).map((window) => ({
        index: window.dataset.swapIndex,
        direction: window.dataset.swapDirection,
        duration: window.getAnimations({ subtree: true })[0].effect!.getTiming()
          .duration,
        easing: getComputedStyle(window.firstElementChild!)
          .animationTimingFunction,
        rect: window.getBoundingClientRect().toJSON(),
      }));
    });
    expect(new Set(shapes.map((shape) => shape.index)).size).toBe(count);
    for (const shape of shapes) {
      expect(shape.duration).toBe(1000);
      expect(shape.easing).toBe("cubic-bezier(0.86, 0, 0.07, 1)");
      expect(shape.rect.height).toBeGreaterThanOrEqual(96);
    }
    expect(await title.boundingBox()).toEqual(baseline);
    const duplicate = await title.screenshot();
    const [nativePixels, duplicatePixels] = await Promise.all([
      sharp(native).raw().toBuffer(),
      sharp(duplicate).raw().toBuffer(),
    ]);
    let differingPixels = 0;
    for (let i = 0; i < nativePixels.length; i += 3) {
      if (
        !nativePixels
          .subarray(i, i + 3)
          .equals(duplicatePixels.subarray(i, i + 3))
      )
        differingPixels++;
    }
    // Only transient highlight antialiasing may differ; static recovery is exact.
    expect(differingPixels).toBeLessThanOrEqual(60 * count);
    const selected = await title.evaluate((element) => {
      const selection = getSelection()!;
      const range = document.createRange();
      range.selectNodeContents(
        element.querySelector("[data-menu-title-source]")!,
      );
      selection.removeAllRanges();
      selection.addRange(range);
      return selection.toString();
    });
    expect(selected).toBe(text);
    await page
      .context()
      .grantPermissions(["clipboard-read", "clipboard-write"]);
    await page.keyboard.press("Control+c");
    expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(
      text,
    );
    await page.evaluate(() => getSelection()?.removeAllRanges());
    for (const direction of ["up", "down"]) {
      const sampled = await page
        .locator(hostSelector)
        .evaluate((element, direction) => {
          const windows = Array.from(
            element.querySelectorAll<HTMLElement>("[data-swap-direction]"),
          );
          windows.forEach((window) => {
            window.dataset.swapDirection = direction;
          });
          element.getAnimations({ subtree: true }).forEach((animation) => {
            animation.pause();
            animation.currentTime = 500;
          });
          return windows.map((window) => {
            const matrix = new DOMMatrix(
              getComputedStyle(window.firstElementChild!).transform,
            );
            return { x: matrix.m41, y: matrix.m42 };
          });
        }, direction);
      expect(sampled).toHaveLength(count);
      for (const sample of sampled) {
        expect(sample.x).toBe(0);
        expect(Math.sign(sample.y)).toBe(direction === "up" ? -1 : 1);
      }
      await page.screenshot({
        path: path.join(
          evidence,
          "screenshots",
          `menu-character-${direction}-${locale}.png`,
        ),
      });
    }
    await page
      .locator(hostSelector)
      .evaluate((element) =>
        element
          .getAnimations({ subtree: true })
          .forEach((animation) => animation.finish()),
      );
    await expect(page.locator(movingSelector)).toHaveCount(0);
    const restored = await title.screenshot();
    expect((await sharp(restored).raw().toBuffer()).equals(nativePixels)).toBe(
      true,
    );
    expect(await title.boundingBox()).toEqual(baseline);
  });

  test(`natural playback records three untouched simultaneous rounds (${locale})`, async ({
    page,
  }) => {
    await openMenu(page, locale);
    await page.locator(hostSelector).evaluate((element) => {
      const host = element as HTMLElement;
      const rounds: {
        id: string;
        characters: {
          index: number;
          direction: string;
          startedAt: number;
          endedAt?: number;
        }[];
      }[] = [];
      const tracks = new WeakMap<
        EventTarget,
        {
          index: number;
          direction: string;
          startedAt: number;
          endedAt?: number;
        }
      >();
      const record = () => {
        host.dataset.playback = JSON.stringify(rounds);
      };
      host.addEventListener("animationstart", (event) => {
        const window = (event.target as HTMLElement).closest<HTMLElement>(
          "[data-menu-character-window]",
        )!;
        let round = rounds.find((round) => round.id === host.dataset.swapRound);
        if (!round) {
          round = { id: host.dataset.swapRound!, characters: [] };
          rounds.push(round);
        }
        const character = {
          index: Number(window.dataset.swapIndex),
          direction: window.dataset.swapDirection!,
          startedAt: performance.now(),
        };
        round.characters.push(character);
        tracks.set(event.target!, character);
        record();
      });
      host.addEventListener("animationend", (event) => {
        const character = tracks.get(event.target!);
        if (character) character.endedAt = performance.now();
        record();
      });
      record();
    });
    await expect
      .poll(
        async () =>
          (
            JSON.parse(
              (await page.locator(hostSelector).getAttribute("data-playback"))!,
            ) as Round[]
          ).filter((round) =>
            round.characters.every(
              (character) => character.endedAt !== undefined,
            ),
          ).length,
        { timeout: 17_500, intervals: [50] },
      )
      .toBeGreaterThanOrEqual(3);
    const rounds: Round[] = JSON.parse(
      (await page.locator(hostSelector).getAttribute("data-playback"))!,
    );
    for (let i = 0; i < 3; i++) {
      const characters = rounds[i].characters;
      expect(characters.length).toBeGreaterThanOrEqual(1);
      expect(characters.length).toBeLessThanOrEqual(4);
      expect(new Set(characters.map((character) => character.index)).size).toBe(
        characters.length,
      );
      expect(
        Math.max(...characters.map((c) => c.startedAt)) -
          Math.min(...characters.map((c) => c.startedAt)),
      ).toBeLessThan(20);
      for (const character of characters) {
        expect(["up", "down"]).toContain(character.direction);
        expect(character.endedAt! - character.startedAt).toBeGreaterThanOrEqual(
          950,
        );
        expect(character.endedAt! - character.startedAt).toBeLessThanOrEqual(
          1150,
        );
      }
      if (i > 0) {
        const previous = rounds[i - 1].characters;
        const gap = characters[0].startedAt - previous[0].startedAt;
        expect(gap).toBeGreaterThanOrEqual(1950);
        expect(gap).toBeLessThanOrEqual(5150);
        const freshCount = characters.filter(
          (c) => !previous.some((p) => p.index === c.index),
        ).length;
        expect(freshCount).toBe(
          Math.min(
            characters.length,
            (locale === "en" ? 18 : 5) - previous.length,
          ),
        );
      }
    }
    await writeFile(
      path.join(evidence, `menu-character-timing-${locale}.json`),
      JSON.stringify(rounds, null, 2) + "\n",
    );
  });
}

test("pauses on departure, restarts after language and mask changes, and respects reduced motion", async ({
  page,
}) => {
  await openMenu(page);
  await expectPlaying(page);
  await page.emulateMedia({ reducedMotion: "reduce" });
  await expect(page.locator(movingSelector)).toHaveCount(0);
  expect(await page.evaluate(() => CSS.highlights.size)).toBe(0);
  await page.waitForTimeout(5200);
  await expect(page.locator(movingSelector)).toHaveCount(0);
  await page.emulateMedia({ reducedMotion: "no-preference" });
  await expectFreshWait(page);
  await page
    .getByRole("button", { name: "Research Agent", exact: true })
    .click();
  await expect(page.locator(movingSelector)).toHaveCount(0);
  await expect(page.locator(hostSelector)).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "NEXT", exact: true }),
  ).toBeFocused();
  await page.keyboard.press("Enter");
  await expectMenuSettled(page);
  await expect(page.locator("#research-menu-title")).toBeFocused();
  await page.getByRole("button", { name: "Languages", exact: true }).click();
  await expect(page.locator("#research-menu-title")).toHaveAccessibleName(
    "选择下一步",
  );
  await expectFreshWait(page);
  await page.getByRole("link", { name: /新建研究/ }).click();
  await expect(page.getByTestId("entry-transition")).toBeVisible();
  await expect(page.locator(movingSelector)).toHaveCount(0);
  await expect(page.locator("[data-entry-word]")).not.toHaveCount(0);
  await expect(page.getByTestId("entry-transition")).toHaveCount(0, {
    timeout: 15_000,
  });
  await expect(page.locator(hostSelector)).toHaveCount(0);
  await page.getByRole("link", { name: /返回菜单/ }).click();
  await expect(page.getByTestId("entry-transition")).toHaveCount(0, {
    timeout: 15_000,
  });
  await expect(page.locator("#research-menu-title")).toBeFocused();
  await expectMenuSettled(page);
  await expectFreshWait(page);
});

test("a setup dialog keeps the complete title static until dismissed", async ({
  page,
}) => {
  await mockEntryBackend(page, false);
  await page.goto("/en/workspace");
  await expect(page.getByRole("dialog")).toBeVisible();
  await page.waitForTimeout(5500);
  await expect(page.locator(movingSelector)).toHaveCount(0);
  expect(await page.evaluate(() => CSS.highlights.size)).toBe(0);
  await page.getByRole("textbox").fill("menu-animation-fixture-key");
  await page.getByRole("button", { name: /Save|保存/ }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(page.locator("#research-menu-title")).toBeFocused();
  await expectFreshWait(page);
});
