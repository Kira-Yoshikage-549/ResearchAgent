import { mkdir } from "node:fs/promises";
import path from "node:path";
import { expect, test } from "@playwright/test";

test.use({ viewport: { width: 1366, height: 768 } });

test("remaining workspace pages keep the entry identity and usable desktop layout", async ({
  page,
}) => {
  test.setTimeout(90_000);
  await page.emulateMedia({ reducedMotion: "reduce" });
  const screenshotDirectory = path.resolve(
    process.cwd(),
    "../artifacts/swiss-style",
  );
  await mkdir(screenshotDirectory, { recursive: true });
  const capture = async (name: string) => {
    await page.evaluate(() => document.fonts.ready);
    await page.screenshot({
      path: path.join(screenshotDirectory, `${name}.png`),
      fullPage: true,
      animations: "disabled",
    });
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth),
    ).toBeLessThanOrEqual(1366);
  };

  await page.goto("/en/research/new");
  await expect(page.getByLabel("Research question")).toBeVisible();
  await capture("reference-research");
  await page
    .getByLabel("Research question")
    .fill("Desktop design acceptance demo: evidence in scientific retrieval");
  await page.getByRole("button", { name: /send to agent/i }).click();
  await expect(page).toHaveURL(/\/research\/(?!new$)[^/]+$/);
  const taskUrl = page.url();
  await expect(page.getByTestId("followup-composer")).toBeVisible();
  await capture("task-live");
  await expect(
    page.getByRole("heading", { name: "Research synthesis", exact: true }),
  ).toBeVisible({ timeout: 20_000 });
  const reportTabs = page.getByRole("tablist", { name: "Research views" });
  await expect(
    page.getByText(/Quality review|Final critic review|Critic attempt/i),
  ).toHaveCount(0);
  const tabBounds = await Promise.all(
    (await reportTabs.getByRole("tab").all()).map((tab) => tab.boundingBox()),
  );
  expect(tabBounds).toHaveLength(3);
  const tabTop = tabBounds.map((bounds) => bounds!.y);
  expect(Math.max(...tabTop) - Math.min(...tabTop)).toBeLessThan(1);
  const prose = page.locator(".report-document > p").first();
  await expect(prose).toBeInViewport();
  const proseBox = await prose.boundingBox();
  await expect(
    page.getByRole("navigation", { name: "Stage detail" }),
  ).toHaveCount(0);
  const reportComposerBox = await page
    .getByTestId("followup-composer")
    .boundingBox();
  expect(proseBox!.y + proseBox!.height).toBeLessThanOrEqual(
    reportComposerBox!.y,
  );
  await capture("report");
  const shell = page.locator("[data-sidebar][data-context]");
  const main = shell.locator("main");
  const columnWidth = (1270 - 24 * 11) / 12;
  const spanWidth = (span: number) => columnWidth * span + 24 * (span - 1);
  expect((await main.boundingBox())!.width).toBeCloseTo(spanWidth(7), 0);
  await expect(
    page.getByRole("navigation", { name: "On this page" }),
  ).toBeVisible();
  await expect(shell).toHaveAttribute("data-sidebar", "closed");
  await page.getByRole("button", { name: "Expand task sidebar" }).click();
  await expect(
    page.getByRole("complementary", { name: "Task navigation" }),
  ).toBeVisible();
  expect((await main.boundingBox())!.width).toBeCloseTo(spanWidth(7), 0);
  await capture("report-task-overlay");
  await page.getByRole("button", { name: "Collapse task sidebar" }).click();
  await expect(shell).toHaveAttribute("data-sidebar", "closed");
  expect((await main.boundingBox())!.width).toBeCloseTo(spanWidth(7), 0);
  await capture("report-navigation-collapsed");
  await page.getByRole("button", { name: "Collapse context panel" }).click();
  await expect(shell).toHaveAttribute("data-context", "closed");
  expect((await main.boundingBox())!.width).toBeCloseTo(spanWidth(10), 0);
  await capture("report-panels-collapsed");
  await page.getByRole("button", { name: "Expand task sidebar" }).click();
  expect((await main.boundingBox())!.width).toBeCloseTo(spanWidth(10), 0);
  await capture("report-evidence-collapsed");
  await page.getByRole("button", { name: "Expand context panel" }).click();
  await expect
    .poll(async () => (await main.boundingBox())!.width)
    .toBeCloseTo(spanWidth(7), 0);
  await page.getByRole("button", { name: "Collapse task sidebar" }).click();
  const composerBox = await page.getByTestId("followup-composer").boundingBox();
  const contentBox = await page.getByTestId("task-scroll-region").boundingBox();
  expect(composerBox!.y + composerBox!.height).toBeLessThanOrEqual(769);
  expect(contentBox!.y + contentBox!.height).toBeLessThanOrEqual(
    composerBox!.y + 1,
  );

  await page.getByRole("button", { name: /open citation 1/i }).click();
  await expect(
    page.getByRole("region", { name: "Evidence details" }),
  ).toContainText("Hybrid retrieval improves grounding");
  await capture("evidence-selected");
  await page.getByRole("button", { name: /open paper/i }).click();

  await page.getByRole("tab", { name: "Papers (5)", exact: true }).click();
  const paperRow = page.getByRole("button", {
    name: /Paper: Hybrid retrieval/i,
  });
  await paperRow.click();
  await expect(
    page
      .getByRole("tabpanel", { name: "Papers (5)" })
      .getByRole("complementary", { name: "Paper details" }),
  ).toContainText("Hybrid retrieval");
  await capture("papers");
  await paperRow.hover();
  const hoverText = await paperRow.evaluate((button) => {
    const author = button.querySelector("p");
    const metadata = button.lastElementChild?.querySelector("span");
    return [author, metadata].map((element) => {
      if (!element) throw new Error("Paper author or metadata is missing");
      let ancestor: Element | null = element;
      let background = "transparent";
      while (ancestor) {
        background = getComputedStyle(ancestor).backgroundColor;
        if (background !== "transparent" && background !== "rgba(0, 0, 0, 0)")
          break;
        ancestor = ancestor.parentElement;
      }
      const style = getComputedStyle(element);
      return { foreground: style.color, background, opacity: style.opacity };
    });
  });
  for (const text of hoverText) {
    const palette = ["rgb(0, 0, 0)", "rgb(250, 249, 244)", "rgb(218, 41, 28)"];
    expect(palette).toContain(text.foreground);
    expect(palette).toContain(text.background);
    expect(text.opacity).toBe("1");
    const luminance = (color: string) => {
      const channels = color
        .match(/[\d.]+/g)!
        .slice(0, 3)
        .map(Number)
        .map((channel) => {
          const value = channel / 255;
          return value <= 0.04045
            ? value / 12.92
            : ((value + 0.055) / 1.055) ** 2.4;
        });
      return channels[0] * 0.2126 + channels[1] * 0.7152 + channels[2] * 0.0722;
    };
    const foreground = luminance(text.foreground);
    const background = luminance(text.background);
    expect(
      (Math.max(foreground, background) + 0.05) /
        (Math.min(foreground, background) + 0.05),
    ).toBeGreaterThanOrEqual(4.5);
  }
  await capture("papers-hover");
  await page
    .getByTestId("task-scroll-region")
    .getByRole("tab", { name: "Run details", exact: true })
    .click();
  await capture("run-details");
  await page.getByText("Open execution replay").click();
  await expect(
    page.getByRole("heading", { name: "Agent replay" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Next replay event" }).click();
  await expect(
    page.getByRole("region", { name: "Event timeline" }),
  ).toBeVisible();
  const replayRange = page.getByRole("slider");
  await expect(replayRange).toHaveCSS("appearance", "none");
  await expect(replayRange).toHaveCSS("accent-color", "rgb(218, 41, 28)");
  await expect(replayRange).toHaveCSS("border-radius", "0px");
  await page
    .getByRole("heading", { name: "Agent replay" })
    .scrollIntoViewIfNeeded();
  await capture("replay-expanded");
  await page
    .getByRole("region", { name: "Event inspector" })
    .scrollIntoViewIfNeeded();
  await capture("replay-inspector");

  await page.goto("/en/settings");
  await expect(page.getByLabel("Maximum papers")).toBeVisible();
  await expect(
    page.getByRole("complementary", { name: "Context panel" }),
  ).toHaveCount(0);
  await expect(
    page.getByRole("complementary", { name: "Task navigation" }),
  ).toHaveCount(0);
  const actionStyle = await page
    .getByRole("button", { name: "Save settings" })
    .evaluate((element) => {
      const style = getComputedStyle(element);
      return { background: style.backgroundColor, foreground: style.color };
    });
  expect(actionStyle).toEqual({
    background: "rgb(218, 41, 28)",
    foreground: "rgb(250, 249, 244)",
  });
  await expect(page.getByLabel("Show companion")).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: /Switch to (dark|light) theme/ }),
  ).toHaveCount(0);
  await capture("settings");
  await page.goto("/zh-CN/settings");
  await expect(
    page.getByRole("heading", { name: "设置", exact: true }),
  ).toBeVisible();
  await capture("settings-zh");

  await page.goto("/en/history");
  await expect(
    page.getByRole("heading", { name: "Research history", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("link", { name: /Desktop design acceptance demo/i }).first(),
  ).toBeVisible();
  await capture("history");
  await page.goto("/zh-CN/history");
  await expect(
    page.getByRole("heading", { name: "研究历史", exact: true }),
  ).toBeVisible();
  await capture("history-zh");
  await page.goto("/en/missing-design-page");
  await expect(
    page.getByRole("heading", { name: /could not be found/i }),
  ).toBeVisible();
  await capture("not-found");

  await page.goto(taskUrl);
  await expect(
    page.getByRole("heading", { name: "Research synthesis", exact: true }),
  ).toBeVisible();
});

test("replay event inspector stays readable above the follow-up composer", async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/en/research/new");
  await page
    .getByLabel("Research question")
    .fill("Desktop replay inspector acceptance demo");
  await page.getByRole("button", { name: /send to agent/i }).click();
  await expect(
    page.getByRole("heading", { name: "Research synthesis", exact: true }),
  ).toBeVisible({ timeout: 20_000 });
  await page
    .getByLabel("Research views")
    .getByRole("tab", { name: "Run details" })
    .click();
  await page.getByText("Open execution replay").click();
  await page.getByRole("button", { name: "Next replay event" }).click();
  const inspector = page.getByRole("region", { name: "Event inspector" });
  await expect(inspector).toContainText("task.created");
  await inspector.scrollIntoViewIfNeeded();
  const inspectorBox = await inspector.boundingBox();
  const composerBox = await page.getByTestId("followup-composer").boundingBox();
  expect(inspectorBox!.y + inspectorBox!.height).toBeLessThanOrEqual(
    composerBox!.y + 1,
  );
  const screenshotDirectory = path.resolve(
    process.cwd(),
    "../artifacts/swiss-style",
  );
  await mkdir(screenshotDirectory, { recursive: true });
  await page.evaluate(() => document.fonts.ready);
  await page.screenshot({
    path: path.join(screenshotDirectory, "replay-inspector.png"),
    fullPage: true,
    animations: "disabled",
  });
});

test("Chinese report geometry keeps localized prose above the follow-up control", async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/research/new");
  await page
    .getByLabel("研究问题")
    .fill("比较多来源检索在科研问答中的证据、优势和局限。");
  await page.getByRole("button", { name: /发送给 Agent/ }).click();
  await expect(page).toHaveURL(/\/research\/(?!new$)[^/]+$/);
  await expect(
    page.getByRole("heading", { name: "研究综合报告", exact: true }),
  ).toBeVisible({ timeout: 20_000 });
  const reportTabs = page.getByRole("tablist", { name: "研究视图" });
  await expect(page.getByText(/质量审查|最终评审|评审未通过/)).toHaveCount(0);
  const tabBounds = await Promise.all(
    (await reportTabs.getByRole("tab").all()).map((tab) => tab.boundingBox()),
  );
  expect(tabBounds).toHaveLength(3);
  const tabTop = tabBounds.map((bounds) => bounds!.y);
  expect(Math.max(...tabTop) - Math.min(...tabTop)).toBeLessThan(1);
  const prose = page.locator(".report-document > p").first();
  await expect(prose).toBeInViewport();
  const proseBox = await prose.boundingBox();
  await expect(page.getByRole("navigation", { name: "阶段详情" })).toHaveCount(
    0,
  );
  const composerBox = await page.getByTestId("followup-composer").boundingBox();
  expect(proseBox!.y + proseBox!.height).toBeLessThanOrEqual(composerBox!.y);
  const screenshotDirectory = path.resolve(
    process.cwd(),
    "../artifacts/swiss-style",
  );
  await mkdir(screenshotDirectory, { recursive: true });
  await page.evaluate(() => document.fonts.ready);
  await page.screenshot({
    path: path.join(screenshotDirectory, "report-zh.png"),
    fullPage: true,
    animations: "disabled",
  });
});
