import { expect, test, type Page } from "@playwright/test";
import { expectMenuSettled, mockEntryBackend } from "./three-page-helpers";

test.use({ viewport: { width: 1366, height: 768 } });

async function watchTransitions(page: Page) {
  await page.evaluate(() => {
    const observed = window as typeof window & {
      entryTransitionsSeen: number;
      entrySnapshotsSeen: number;
    };
    observed.entryTransitionsSeen = 0;
    observed.entrySnapshotsSeen = 0;
    Object.defineProperty(document, "startViewTransition", {
      configurable: true,
      value: () => {
        observed.entrySnapshotsSeen++;
        throw new Error("Swiss navigation must not capture a page snapshot");
      },
    });
    new MutationObserver((records) => {
      for (const record of records)
        for (const node of record.addedNodes) {
          if (
            node instanceof Element &&
            (node.matches('[data-testid="entry-transition"]') ||
              node.querySelector('[data-testid="entry-transition"]'))
          )
            observed.entryTransitionsSeen++;
        }
    }).observe(document.body, { childList: true, subtree: true });
  });
}

async function expectNoTransitions(page: Page) {
  expect(
    await page.evaluate(() => {
      const observed = window as typeof window & {
        entryTransitionsSeen: number;
        entrySnapshotsSeen: number;
      };
      return [observed.entryTransitionsSeen, observed.entrySnapshotsSeen];
    }),
  ).toEqual([0, 0]);
  await expect(page.getByTestId("entry-transition")).toHaveCount(0);
  await expect(page.locator("[inert]")).toHaveCount(0);
}

for (const locale of ["en", "zh-CN"] as const) {
  test(`keyboard scroll entry and direct menu return have no route overlay (${locale})`, async ({
    page,
  }) => {
    await mockEntryBackend(page);
    const prefix = locale === "en" ? "/en" : "";
    await page.goto(prefix || "/");
    await watchTransitions(page);
    await page.getByRole("button", { name: /NEXT|下一步/ }).focus();
    await page.keyboard.press("Enter");
    await expectMenuSettled(page);
    await expectNoTransitions(page);
    await page.getByRole("link", { name: /NEW RESEARCH|新建研究/ }).focus();
    await page.keyboard.press("Enter");
    await expect(page).toHaveURL(new RegExp(`${prefix}/research/new$`));
    const input = page.getByRole("textbox");
    await input.fill("Immediate navigation preserves a usable research form");
    await expect(input).toHaveValue(
      "Immediate navigation preserves a usable research form",
    );
    await expectNoTransitions(page);
    await page.getByRole("link", { name: /Back to menu|返回菜单/ }).click();
    await expect(page).toHaveURL(new RegExp(`${prefix}/workspace$`));
    await expectNoTransitions(page);
  });
}

test("history settings and browser back/forward preserve direct navigation", async ({
  page,
}) => {
  await mockEntryBackend(page);
  await page.goto("/en/workspace");
  await watchTransitions(page);
  await page.getByRole("link", { name: /history/i }).click();
  await expect(page).toHaveURL(/\/en\/history$/);
  await expectNoTransitions(page);
  await page.goBack();
  await expect(page).toHaveURL(/\/en\/workspace$/);
  await page.getByRole("link", { name: /Settings/ }).click();
  await expect(page).toHaveURL(/\/en\/settings$/);
  await expectNoTransitions(page);
  await page.goBack();
  await expect(page).toHaveURL(/\/en\/workspace$/);
  await page.getByRole("link", { name: /NEW RESEARCH/ }).click();
  await expect(page).toHaveURL(/\/en\/research\/new$/);
  await page.goBack();
  await expect(page).toHaveURL(/\/en\/workspace$/);
  await expectNoTransitions(page);
  await page.goForward();
  await expect(page).toHaveURL(/\/en\/research\/new$/);
  await expectNoTransitions(page);
});

test("language changes stay direct and subsequent navigation uses the new locale", async ({
  page,
}) => {
  await mockEntryBackend(page);
  await page.goto("/en/workspace");
  await watchTransitions(page);
  await page.getByRole("button", { name: "Languages", exact: true }).click();
  await expect.poll(() => new URL(page.url()).pathname).toBe("/workspace");
  await expectNoTransitions(page);
  await page.getByRole("link", { name: /新建研究/ }).click();
  await expect(page).toHaveURL(/\/research\/new$/);
  await page.getByRole("button", { name: "语言选项", exact: true }).click();
  await expect(page).toHaveURL(/\/en\/research\/new$/);
  await expect(
    page.getByRole("link", { name: "Back to menu", exact: true }),
  ).toBeVisible();
  await expectNoTransitions(page);
});

test("system reduced motion and a completed welcome keep direct navigation", async ({
  page,
}) => {
  await mockEntryBackend(page);
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/en");
  await watchTransitions(page);
  await page.getByRole("button", { name: "NEXT", exact: true }).click();
  await expectMenuSettled(page);
  await page.getByRole("link", { name: /NEW RESEARCH/ }).click();
  await expect(page).toHaveURL(/\/en\/research\/new$/);
  await expectNoTransitions(page);
  await page.emulateMedia({ reducedMotion: "no-preference" });
  await page.goto("/en");
  await expectMenuSettled(page);
  await expect(page.getByTestId("entry-transition")).toHaveCount(0);
});
