import path from "node:path";
import { expect, test, type Page } from "@playwright/test";
import { expectMenuSettled, mockEntryBackend } from "./three-page-helpers";

test.use({
  viewport: { width: 1366, height: 768 },
  video: { mode: "on", size: { width: 1366, height: 768 } },
});
test.setTimeout(90_000);
const evidence = path.resolve(process.cwd(), "../docs/frontend-swiss");
const overlaySelector = '[data-testid="entry-transition"]';

async function settled(page: Page) {
  await expect(page.getByTestId("entry-transition")).toHaveCount(0, {
    timeout: 15_000,
  });
  await expect(page.locator("[inert]")).toHaveCount(0);
}
async function navigate(page: Page, name: RegExp, destination: string) {
  await page.getByRole("link", { name }).click();
  await expect(page).toHaveURL(new RegExp(destination + "$"));
  await settled(page);
}
async function waitPhase(page: Page, phase: string) {
  await expect
    .poll(
      () => page.getByTestId("entry-transition").getAttribute("data-phase"),
      {
        intervals: [20],
        timeout: 10_000,
      },
    )
    .toBe(phase);
}
async function observe(page: Page) {
  await page.evaluate((selector) => {
    const observed = window as typeof window & {
      maskPhases: string[];
      maskCount: number;
    };
    observed.maskPhases = [];
    observed.maskCount = 0;
    new MutationObserver((records) => {
      for (const record of records) {
        for (const node of record.addedNodes) {
          if (node instanceof Element && node.matches(selector))
            observed.maskCount++;
        }
        const phase = document
          .querySelector(selector)
          ?.getAttribute("data-phase");
        if (phase && observed.maskPhases.at(-1) !== phase)
          observed.maskPhases.push(phase);
      }
    }).observe(document.body, {
      subtree: true,
      childList: true,
      attributes: true,
      attributeFilter: ["data-phase"],
    });
  }, overlaySelector);
}

test.afterEach(async ({ page }) => {
  const match = test.info().title.match(/^full sequence.*\((en|zh-CN)\)$/);
  if (match && test.info().status === "passed") {
    const video = page.video();
    await page.close();
    await video?.saveAs(
      path.join(evidence, "videos", "entry-transition-" + match[1] + ".webm"),
    );
  }
});

for (const locale of ["en", "zh-CN"] as const) {
  const prefix = locale === "en" ? "/en" : "";
  test(
    "full sequence preserves embedded menu and title geometry (" + locale + ")",
    async ({ page }) => {
      await mockEntryBackend(page);
      await page.goto(prefix + "/research/new");
      await page.evaluate(() => document.fonts.ready);
      const baseline = await page.locator("#new-research-title").boundingBox();
      await page.goto(prefix || "/");
      await page.getByRole("button", { name: /NEXT|下一步/ }).focus();
      await page.keyboard.press("Enter");
      await expectMenuSettled(page);
      await settled(page);
      await observe(page);
      const sourceUrl = page.url();
      await page.getByRole("link", { name: /NEW RESEARCH|新建研究/ }).click();
      await expect(page.getByTestId("entry-transition")).toHaveAttribute(
        "data-phase",
        "covering",
      );
      await page.waitForTimeout(450);
      expect(page.url()).toBe(sourceUrl);
      await page.screenshot({
        path: path.join(
          evidence,
          "screenshots",
          "transition-cover-" + locale + ".png",
        ),
      });
      await waitPhase(page, "holding");
      await page.screenshot({
        path: path.join(
          evidence,
          "screenshots",
          "transition-center-" + locale + ".png",
        ),
      });
      const center = page.getByTestId("entry-transition-center");
      await expect(center).toHaveText(
        locale === "en" ? "New Research" : "新建研究",
      );
      await expect(center).toHaveCSS("font-size", "144px");
      await expect(center).toHaveCSS("font-weight", "700");
      await waitPhase(page, "uncovering");
      const heading = page.locator("#new-research-title");
      expect(await heading.boundingBox()).toEqual(baseline);
      await page.screenshot({
        path: path.join(
          evidence,
          "screenshots",
          "transition-title-" + locale + ".png",
        ),
      });
      await page.waitForTimeout(350);
      await page.screenshot({
        path: path.join(
          evidence,
          "screenshots",
          "transition-uncover-" + locale + ".png",
        ),
      });
      await settled(page);
      expect(await heading.boundingBox()).toEqual(baseline);
      await expect(heading).toBeFocused();
      await page.screenshot({
        path: path.join(
          evidence,
          "screenshots",
          "transition-complete-" + locale + ".png",
        ),
      });
      const phases = await page.evaluate(
        () => (window as typeof window & { maskPhases: string[] }).maskPhases,
      );
      expect(phases).toEqual([
        "covering",
        "center-in",
        "holding",
        "center-out",
        "title-in",
        "uncovering",
      ]);
      await page
        .getByRole("textbox")
        .fill("Transition leaves the research form usable");
      await navigate(page, /Back to menu|返回菜单/, prefix + "/workspace");
      await expectMenuSettled(page);
    },
  );

  test(
    "all entry links animate and same-page links stay put (" + locale + ")",
    async ({ page }) => {
      await mockEntryBackend(page);
      await page.goto(prefix + "/workspace");
      await observe(page);
      await navigate(page, /^history$|^历史记录$/, prefix + "/history");
      await navigate(page, /^Settings$|^设置$/, prefix + "/settings");
      const count = await page.evaluate(
        () => (window as typeof window & { maskCount: number }).maskCount,
      );
      await page.getByRole("link", { name: /^Settings$|^设置$/ }).click();
      await settled(page);
      expect(
        await page.evaluate(
          () => (window as typeof window & { maskCount: number }).maskCount,
        ),
      ).toBe(count);
      await navigate(page, /^History$|^历史记录$/, prefix + "/history");
      await navigate(
        page,
        /^New research$|^新建研究$/,
        prefix + "/research/new",
      );
      await navigate(page, /Back to menu|返回菜单/, prefix + "/workspace");
      await expectMenuSettled(page);
      await navigate(page, /^Settings$|^设置$/, prefix + "/settings");
      await navigate(page, /Back to menu|返回菜单/, prefix + "/workspace");
      await navigate(page, /^history$|^历史记录$/, prefix + "/history");
      await navigate(page, /Back to menu|返回菜单/, prefix + "/workspace");
      expect(
        await page.evaluate(
          () => (window as typeof window & { maskCount: number }).maskCount,
        ),
      ).toBe(9);
    },
  );
}

test("browser history interrupts masks without replay and restores direct forward navigation", async ({
  page,
}) => {
  await mockEntryBackend(page);
  await page.goto("/en/workspace");
  await navigate(page, /NEW RESEARCH/, "/en/research/new");
  await observe(page);
  await page.getByRole("link", { name: "Back to menu" }).click();
  await page.goBack();
  await expect(page).toHaveURL(/\/en\/workspace$/);
  await settled(page);
  await page.goForward();
  await expect(page).toHaveURL(/\/en\/research\/new$/);
  await settled(page);
  await page.waitForTimeout(1100);
  await expect(page).toHaveURL(/\/en\/research\/new$/);
  expect(
    await page.evaluate(
      () => (window as typeof window & { maskCount: number }).maskCount,
    ),
  ).toBe(1);
});

test("language switches and reduced motion stay direct", async ({ page }) => {
  await mockEntryBackend(page);
  await page.goto("/en/workspace");
  await observe(page);
  await page.getByRole("button", { name: "Languages", exact: true }).click();
  await expect(page).toHaveURL(/\/workspace$/);
  await settled(page);
  expect(
    await page.evaluate(
      () => (window as typeof window & { maskCount: number }).maskCount,
    ),
  ).toBe(0);
  await navigate(page, /新建研究/, "/research/new");
  await page.getByRole("button", { name: "语言选项", exact: true }).click();
  await expect(page).toHaveURL(/\/en\/research\/new$/);
  await settled(page);
  await page.emulateMedia({ reducedMotion: "reduce" });
  await observe(page);
  await navigate(page, /Back to menu/, "/en/workspace");
  await navigate(page, /NEW RESEARCH/, "/en/research/new");
  expect(
    await page.evaluate(
      () => (window as typeof window & { maskCount: number }).maskCount,
    ),
  ).toBe(0);
});

test("the real active task heading participates without changing the active view", async ({
  page,
}) => {
  await mockEntryBackend(page);
  await page.route("**/api/v1/research/tasks/active", (route) =>
    route.fulfill({
      json: {
        id: "active-one",
        title: "A running research question",
        query: "Keep the active research",
        status: "running",
        client_request_id: "transition-active",
        effective_locale: "en",
        last_sequence: 0,
        created_at: "2026-10-11T00:00:00Z",
      },
    }),
  );
  await page.goto("/en/workspace");
  await page.getByRole("link", { name: /NEW RESEARCH/ }).click();
  await waitPhase(page, "uncovering");
  await expect(page.locator('[data-entry-title-active="true"]')).toHaveText(
    "A running research question",
  );
  await settled(page);
  await expect(
    page.getByRole("heading", { name: "A running research question" }),
  ).toBeFocused();
  await expect(page.locator('a[href="/en/research/active-one"]')).toBeVisible();
});

test("a missing destination title times out and a late response leaves the form usable", async ({
  page,
}) => {
  await mockEntryBackend(page);
  let release: (() => Promise<void>) | undefined;
  await page.route("**/api/v1/research/tasks/active", (route) => {
    release = () => route.fulfill({ status: 204 });
  });
  await page.goto("/en/workspace");
  await page.getByRole("link", { name: /NEW RESEARCH/ }).click();
  await waitPhase(page, "holding");
  await settled(page);
  await release?.();
  await expect(page.getByRole("textbox")).toBeVisible();
  await page
    .getByRole("textbox")
    .fill("Late readiness recovers without a stuck mask");
  await expect(page.getByRole("textbox")).toHaveValue(
    "Late readiness recovers without a stuck mask",
  );
});
