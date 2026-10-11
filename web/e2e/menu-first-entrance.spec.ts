import path from "node:path";
import { writeFile } from "node:fs/promises";
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

type EntranceTrace = {
  buttonEnds: { index: number; pseudo: string; endedAt: number }[];
  rounds: { startedAt: number; count: number }[];
};

async function trace(page: Page): Promise<EntranceTrace> {
  return page.evaluate(() =>
    JSON.parse(document.body.dataset.menuEntranceTrace!),
  );
}

async function observeEntrance(page: Page) {
  await page.evaluate(() => {
    const trace: EntranceTrace = { buttonEnds: [], rounds: [] };
    let lastHost: HTMLElement | null = null;
    let lastRound: string | undefined;
    const save = () => {
      document.body.dataset.menuEntranceTrace = JSON.stringify(trace);
    };
    document.addEventListener("transitionend", (event) => {
      if (event.propertyName !== "transform") return;
      const target = event.target as HTMLElement;
      const row = target.closest("[data-entry-action]");
      if (!row) return;
      trace.buttonEnds.push({
        index: Array.from(
          document.querySelectorAll("[data-entry-action]"),
        ).indexOf(row),
        pseudo: event.pseudoElement,
        endedAt: performance.now(),
      });
      save();
    });
    document.addEventListener("animationstart", (event) => {
      const host = (event.target as HTMLElement).closest<HTMLElement>(
        "[data-menu-character-swap]",
      );
      if (!host) return;
      if (host !== lastHost || host.dataset.swapRound !== lastRound) {
        trace.rounds.push({
          startedAt: performance.now(),
          count: Number(host.dataset.swapCount),
        });
        lastHost = host;
        lastRound = host.dataset.swapRound;
        save();
      }
    });
    save();
  });
}

test.afterEach(async ({ page }) => {
  const locale = test
    .info()
    .title.match(/^first descent.*\((en|zh-CN)\)$/)?.[1];
  if (locale && test.info().status === "passed") {
    const video = page.video();
    await page.close();
    await video?.saveAs(
      path.join(evidence, "videos", `menu-first-entrance-${locale}.webm`),
    );
  }
});

for (const locale of ["en", "zh-CN"]) {
  test(`first descent follows the buttons immediately, then uses normal waits on return (${locale})`, async ({
    page,
  }) => {
    await mockEntryBackend(page);
    await page.goto(locale === "en" ? "/en" : "/");
    await page.evaluate(() => document.fonts.ready);
    await expect(page.getByTestId("welcome-waves")).toHaveAttribute(
      "data-intro",
      "complete",
    );
    await observeEntrance(page);
    if (locale === "en")
      await page.getByRole("button", { name: "NEXT", exact: true }).click();
    else await page.mouse.wheel(0, 900);
    await expectMenuSettled(page);
    await expect(page.locator(`${hostSelector}[data-swap-count]`)).toHaveCount(
      1,
    );
    const first = await trace(page);
    expect(
      new Set(
        first.buttonEnds
          .filter((end) => end.pseudo === "::after")
          .map((end) => end.index),
      ).size,
    ).toBe(3);
    const lastButtonEnd = Math.max(
      ...first.buttonEnds.map((end) => end.endedAt),
    );
    const immediateDelay = first.rounds[0].startedAt - lastButtonEnd;
    expect(immediateDelay).toBeGreaterThanOrEqual(-20);
    expect(immediateDelay).toBeLessThan(150);
    expect(first.rounds[0].count).toBeGreaterThanOrEqual(1);
    expect(first.rounds[0].count).toBeLessThanOrEqual(4);
    await page.screenshot({
      path: path.join(
        evidence,
        "screenshots",
        `menu-first-entrance-${locale}.png`,
      ),
    });
    await expect
      .poll(async () => (await trace(page)).rounds.length, { timeout: 6000 })
      .toBe(2);
    const ordinary = await trace(page);
    const nextInterval =
      ordinary.rounds[1].startedAt - ordinary.rounds[0].startedAt;
    expect(nextInterval).toBeGreaterThanOrEqual(1950);
    expect(nextInterval).toBeLessThanOrEqual(5150);

    await page
      .getByRole("link", {
        name: locale === "en" ? /NEW RESEARCH/ : /新建研究/,
      })
      .click();
    await expect(page.getByTestId("entry-transition")).toHaveCount(0, {
      timeout: 15_000,
    });
    await expect(page.locator(hostSelector)).toHaveCount(0);
    await page
      .getByRole("link", {
        name: locale === "en" ? /Back to menu/ : /返回菜单/,
      })
      .click();
    await expect(page.getByTestId("entry-transition")).toHaveCount(0, {
      timeout: 15_000,
    });
    await expectMenuSettled(page);
    await expect(page.locator("#research-menu-title")).toBeFocused();
    await expect(page.locator(hostSelector)).toHaveAttribute(
      "data-swap-ready",
      "true",
    );
    const returnedAt = await page.evaluate(() => performance.now());
    const roundsBeforeReturn = (await trace(page)).rounds.length;
    await page.waitForTimeout(1700);
    await expect(page.locator(movingSelector)).toHaveCount(0);
    expect((await trace(page)).rounds).toHaveLength(roundsBeforeReturn);
    await expect
      .poll(async () => (await trace(page)).rounds.length, {
        timeout: 6000,
        intervals: [100],
      })
      .toBe(roundsBeforeReturn + 1);
    const returned = await trace(page);
    const returnWait = returned.rounds.at(-1)!.startedAt - returnedAt;
    expect(returnWait).toBeGreaterThanOrEqual(1700);
    expect(returnWait).toBeLessThanOrEqual(5150);
    await writeFile(
      path.join(evidence, `menu-first-entrance-timing-${locale}.json`),
      JSON.stringify(
        { immediateDelay, nextInterval, returnWait, ...returned },
        null,
        2,
      ) + "\n",
    );
  });
}

test("an occluded first entrance is skipped and resumes with the ordinary wait", async ({
  page,
}) => {
  await mockEntryBackend(page, false);
  await page.goto("/en");
  await page.getByRole("button", { name: "NEXT", exact: true }).click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await page.waitForTimeout(1800);
  await expect(page.locator(movingSelector)).toHaveCount(0);
  await page.getByRole("textbox").fill("first-entrance-fixture-key");
  await page.getByRole("button", { name: /Save|保存/ }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await page.waitForTimeout(1700);
  await expect(page.locator(movingSelector)).toHaveCount(0);
  await expect(page.locator(`${hostSelector}[data-swap-count]`)).toHaveCount(
    1,
    { timeout: 3600 },
  );
});
