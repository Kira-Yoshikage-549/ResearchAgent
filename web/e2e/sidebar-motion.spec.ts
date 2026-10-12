import path from "node:path";
import { expect, test, type Page } from "@playwright/test";
import type { ResearchTaskResultResponse } from "../lib/api/client";
import {
  mockRunningResearch,
  snapshot,
  streamMetrics,
  taskId,
} from "./research-focus-helpers";

test.use({
  viewport: { width: 1366, height: 768 },
  video: { mode: "on", size: { width: 1366, height: 768 } },
});
test.setTimeout(60_000);
const evidence = path.resolve(process.cwd(), "../docs/frontend-swiss");
const unit = (1366 - 96 - 24 * 11) / 12;
const leftWidth = unit * 2 + 24;
const rightWidth = unit * 3 + 48;

async function setup(page: Page, locale: "en" | "zh-CN" = "en") {
  await page.route("**/api/v1/**", (route) => route.abort());
  const task = { ...snapshot, effective_locale: locale };
  await mockRunningResearch(page, task);
  const result: ResearchTaskResultResponse = {
    task_id: taskId,
    partial: false,
    report_markdown: Array.from(
      { length: 24 },
      (_, i) =>
        `## ${locale === "en" ? "Evidence" : "研究证据"} ${i + 1}\n\n${(locale === "en" ? "Efficient attention methods depend on retrieval quality and reliable benchmark evidence. " : "高效注意力方法需要结合检索质量和可靠的基准证据进行评估。").repeat(8)}`,
    ).join("\n\n"),
    research_plan: [],
    papers: [
      {
        paper_id: "paper-panel",
        title: "Stable paper selection",
        authors: ["A. Researcher"],
        year: 2026,
        source: "arxiv",
        source_id: "sidebar-motion-paper",
        abstract: "Retained paper abstract.",
        selected: true,
        full_text_status: "abstract_only",
      },
    ],
    paper_insights: [],
    analysis: {},
    critique: {},
    statistics: {},
    evidence: [],
    citations: [],
    capabilities: {
      supports_replay: false,
      supports_evidence: false,
      supports_structured_papers: false,
    },
  };
  await page.route(`**/api/v1/research/tasks/${taskId}/result`, (route) =>
    route.fulfill({ json: result }),
  );
  await page.goto(`${locale === "en" ? "/en" : ""}/research/${taskId}`);
  await expect(page.getByTestId("followup-composer")).toBeVisible();
  await page
    .getByRole("button", {
      name: locale === "en" ? "Expand follow-up" : "展开追问",
      exact: true,
    })
    .click();
  await page.evaluate(() => document.fonts.ready);
  return task;
}

async function geometry(page: Page, left: boolean, right: boolean) {
  await expect(page.getByTestId("left-panel-viewport")).toHaveAttribute(
    "data-motion",
    "idle",
  );
  await expect(page.getByTestId("right-panel-viewport")).toHaveAttribute(
    "data-motion",
    "idle",
  );
  const main = (await page.getByRole("main").boundingBox())!;
  const x = 48 + (left ? leftWidth + 24 : 0);
  const width =
    1366 - 96 - (left ? leftWidth + 24 : 0) - (right ? rightWidth + 24 : 0);
  expect(Math.abs(main.x - x)).toBeLessThanOrEqual(1);
  expect(Math.abs(main.width - width)).toBeLessThanOrEqual(1);
  expect(
    await page
      .getByRole("main")
      .evaluate(
        (el) => getComputedStyle(el).gridTemplateColumns.split(" ").length,
      ),
  ).toBe(7 + (left ? 0 : 2) + (right ? 0 : 3));
}

// Capture native rAF frames without slowing or seeking the GSAP timeline.
async function frames(page: Page, controls: string[], reverseAt?: number) {
  return page.evaluate(
    async ({ controls, reverseAt }) => {
      const buttons = controls.map((selector) =>
        document.querySelector<HTMLButtonElement>(selector)!,
      );
      const panel = document.querySelector<HTMLElement>(
        '[data-testid="right-panel-viewport"]',
      )!;
      const main = document.querySelector("main")!;
      const content = document.querySelector("#context-panel")!;
      const readings: {
        at: number;
        width: number;
        content: number;
        main: number;
        hidden: boolean;
        inert: boolean;
      }[] = [];
      const start = performance.now();
      let reversed = false;
      for (const button of buttons) button.click();
      await new Promise<void>((resolve) => {
        const read = () => {
          const at = performance.now() - start;
          readings.push({
            at,
            width: panel.getBoundingClientRect().width,
            content: content.getBoundingClientRect().width,
            main: main.getBoundingClientRect().width,
            hidden: panel.hidden,
            inert: panel.inert,
          });
          if (reverseAt !== undefined && at >= reverseAt && !reversed) {
            reversed = true;
            buttons.at(-1)!.click();
          }
          if (at < (reverseAt === undefined ? 370 : 480))
            requestAnimationFrame(read);
          else resolve();
        };
        requestAnimationFrame(read);
      });
      return readings;
    },
    { controls, reverseAt },
  );
}

test.afterEach(async ({ page }, info) => {
  const locale = /^(en|zh-CN) sidebar/.exec(info.title)?.[1];
  if (locale && info.status === "passed") {
    const video = page.video();
    await page.close();
    await video?.saveAs(
      path.join(evidence, `videos/sidebar-motion-${locale}.webm`),
    );
  }
});

for (const locale of ["en", "zh-CN"] as const) {
  test(`${locale} sidebar motion preserves geometry, state and report navigation`, async ({
    page,
  }, info) => {
    const task = await setup(page, locale);
    const zh = locale === "zh-CN";
    const labels = {
      collapse: zh ? "收起任务侧栏" : "Collapse task sidebar",
      expand: zh ? "展开任务侧栏" : "Expand task sidebar",
      rightClose: zh ? "收起上下文面板" : "Collapse context panel",
      rightOpen: zh ? "展开上下文面板" : "Expand context panel",
      enterZen: zh ? "进入禅模式" : "Enter Zen mode",
      exitZen: zh ? "退出禅模式" : "Exit Zen mode",
    };
    const left = page.getByTestId("left-panel-viewport");
    const right = page.getByTestId("right-panel-viewport");
    const input = page.getByTestId("followup-composer").getByRole("textbox");
    await input.fill(zh ? "保留追问草稿。" : "Keep the follow-up draft.");
    const draft = await input.inputValue();
    await geometry(page, true, true);
    expect(await streamMetrics(page)).toEqual({
      created: 1,
      active: 1,
      peak: 1,
    });
    await page.screenshot({
      path: path.join(
        evidence,
        `screenshots/sidebar-motion-live-${locale}.png`,
      ),
    });
    const closeRight = 'button[aria-controls="context-panel"]';
    const samples = await frames(page, [closeRight]);
    const intermediate = samples.filter(
      (f) => f.width > 1 && f.width < rightWidth - 1,
    );
    expect(intermediate.length).toBeGreaterThanOrEqual(3);
    expect(
      new Set(intermediate.map((f) => f.width.toFixed(1))).size,
    ).toBeGreaterThanOrEqual(3);
    expect(
      intermediate.every(
        (f) => f.inert && !f.hidden && Math.abs(f.content - rightWidth) < 1,
      ),
    ).toBe(true);
    await expect(right).toBeHidden();
    await geometry(page, true, false);
    await page
      .getByRole("button", { name: labels.rightOpen, exact: true })
      .click();
    await geometry(page, true, true);
    const reverse = await frames(page, [closeRight], 75);
    expect(
      reverse.some((f, i) => i > 0 && f.width > reverse[i - 1].width + 1),
    ).toBe(true);
    await geometry(page, true, true);
    await page
      .getByRole("button", { name: labels.collapse, exact: true })
      .click();
    await geometry(page, false, true);
    await expect(left).toBeHidden();
    await expect(
      page.getByRole("button", { name: labels.expand, exact: true }),
    ).toBeFocused();
    await page
      .getByRole("button", { name: labels.expand, exact: true })
      .click();
    await geometry(page, true, true);
    await frames(page, [
      'button[aria-controls="task-sidebar"][aria-expanded="true"]',
      closeRight,
    ]);
    await geometry(page, false, false);
    await page.screenshot({
      path: path.join(
        evidence,
        `screenshots/sidebar-motion-closed-${locale}.png`,
      ),
    });
    await frames(page, [
      'button[aria-controls="task-sidebar"][aria-expanded="false"]',
      closeRight,
    ]);
    await geometry(page, true, true);
    await expect(input).toHaveValue(draft);
    expect(await streamMetrics(page)).toEqual({
      created: 1,
      active: 1,
      peak: 1,
    });
    await info.attach("native-frame-samples", {
      body: JSON.stringify({ close: samples, reverse }, null, 2),
      contentType: "application/json",
    });

    task.status = "completed";
    task.last_sequence = 20;
    await page.evaluate(
      (id) =>
        (
          window as unknown as {
            dispatchResearchEvent: (event: object) => void;
          }
        ).dispatchResearchEvent({
          schema_version: 1,
          task_id: id,
          sequence: 20,
          event_type: "task.completed",
          occurred_at: "2026-10-12T12:00:00Z",
          level: "info",
          payload: {},
        }),
      taskId,
    );
    const toc = page.getByTestId("report-toc-list");
    await expect(toc).toBeVisible();
    await expect(page.locator('[data-report-revealing="true"]')).toHaveCount(0);
    const scroll = page.getByTestId("task-scroll-region");
    await scroll.evaluate((el) => {
      el.scrollTop = 360;
    });
    await toc.evaluate((el) => {
      el.scrollTop = 90;
    });
    const beforeScroll = await scroll.evaluate((el) => el.scrollTop);
    const beforeToc = await toc.evaluate((el) => el.scrollTop);
    expect(beforeScroll).toBe(360);
    expect(beforeToc).toBe(90);
    const beforeMain = await page.getByRole("main").boundingBox();
    await page
      .getByRole("button", { name: labels.expand, exact: true })
      .click();
    const overlay = page.getByTestId("report-task-overlay");
    await expect(overlay).toHaveAttribute("data-motion", "idle");
    await expect(toc).toBeHidden();
    expect(await page.getByRole("main").boundingBox()).toEqual(beforeMain);
    await page.screenshot({
      path: path.join(
        evidence,
        `screenshots/sidebar-motion-overlay-${locale}.png`,
      ),
    });
    await page.keyboard.press("Escape");
    await expect(overlay).toBeHidden();
    await expect(toc).toBeVisible();
    await expect(
      page.getByRole("button", { name: labels.expand, exact: true }),
    ).toBeFocused();
    expect(await scroll.evaluate((el) => el.scrollTop)).toBe(beforeScroll);
    expect(await toc.evaluate((el) => el.scrollTop)).toBe(beforeToc);
    await expect(input).toHaveValue(draft);
    const tabs = page.getByRole("tablist", {
      name: zh ? "研究视图" : "Research views",
    });
    await tabs
      .getByRole("tab", { name: zh ? "论文（1）" : "Papers (1)", exact: true })
      .click();
    await page
      .getByRole("button", {
        name: "Paper: Stable paper selection",
        exact: true,
      })
      .click();
    const selected = page
      .locator("#context-panel")
      .getByRole("heading", { name: "Stable paper selection" });
    await expect(selected).toBeVisible();
    await page
      .getByRole("button", { name: labels.rightClose, exact: true })
      .click();
    await expect(right).toBeHidden();
    await page
      .getByRole("button", { name: labels.rightOpen, exact: true })
      .click();
    await geometry(page, true, true);
    await expect(selected).toBeVisible();
    await scroll.evaluate((el) => {
      el.scrollTop = 0;
    });
    await page.screenshot({
      path: path.join(
        evidence,
        `screenshots/sidebar-motion-paper-${locale}.png`,
      ),
    });
    await page
      .getByRole("button", { name: labels.enterZen, exact: true })
      .click();
    await expect(left).toHaveAttribute("hidden");
    await expect(right).toHaveAttribute("hidden");
    await geometry(page, false, false);
    await page
      .getByRole("button", { name: labels.exitZen, exact: true })
      .click();
    await geometry(page, true, true);
    await expect(selected).toBeVisible();
    await expect(input).toHaveValue(draft);
    expect((await streamMetrics(page)).created).toBe(1);
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth),
    ).toBeLessThanOrEqual(1366);
  });
}

test("reduced motion snaps panels, restores overlay focus and does not replay persisted state", async ({
  page,
}) => {
  const task = await setup(page);
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page
    .getByRole("button", { name: "Collapse task sidebar", exact: true })
    .click();
  await expect(page.getByTestId("left-panel-viewport")).toHaveAttribute(
    "hidden",
  );
  await page
    .getByRole("button", { name: "Collapse context panel", exact: true })
    .click();
  await expect(page.getByTestId("right-panel-viewport")).toHaveAttribute(
    "hidden",
  );
  // The mock helper clears storage only on a document load; replace that clear for this reload.
  await page.addInitScript(() => {
    localStorage.setItem(
      "research-agent.ui.v1",
      JSON.stringify({
        state: { isTaskSidebarOpen: false, isContextPanelOpen: false },
        version: 1,
      }),
    );
  });
  await page.reload();
  await geometry(page, false, true);
  task.status = "completed";
  task.last_sequence = 20;
  await page.evaluate(
    (id) =>
      (
        window as unknown as { dispatchResearchEvent: (event: object) => void }
      ).dispatchResearchEvent({
        schema_version: 1,
        task_id: id,
        sequence: 20,
        event_type: "task.completed",
        occurred_at: "2026-10-12T12:00:00Z",
        level: "info",
        payload: {},
      }),
    taskId,
  );
  await expect(page.getByTestId("report-toc-list")).toBeVisible();
  await page
    .getByRole("button", { name: "Expand task sidebar", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Collapse task sidebar", exact: true })
    .click();
  await expect(page.getByTestId("report-task-overlay")).toHaveAttribute(
    "hidden",
  );
  await expect(
    page.getByRole("button", { name: "Expand task sidebar", exact: true }),
  ).toBeFocused();
});
