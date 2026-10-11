import { expect, test } from "@playwright/test";
import type { TaskSnapshotResponse } from "../lib/api/client";
import {
  taskId,
  snapshot,
  mockRunningResearch,
  streamMetrics,
} from "./research-focus-helpers";

test.use({ viewport: { width: 1366, height: 768 } });

test("Chinese progress and the published plan update live and survive a refresh", async ({
  page,
}) => {
  const restored: TaskSnapshotResponse = {
    ...snapshot,
    effective_locale: "zh-CN",
    current_stage: "search",
    statistics: {},
    stages: [{ stage: "search", status: "running", attempt: 1, detail: null }],
    replay_events: [
      {
        ...snapshot.replay_events![0],
        payload: {
          steps: [
            {
              display_query: "比较多来源检索的证据",
              retrieval_query: "multi-source retrieval evidence",
            },
            { sub_query: "分析现有方法的局限" },
          ],
        },
      },
    ],
  };
  await mockRunningResearch(page, restored);
  await page.goto(`/research/${taskId}`);
  const hero = page.getByTestId("task-stage-hero");
  const progress = "已从所选学术来源检索到 12 篇论文。";
  await expect(hero).toContainText("正在所选学术来源中检索相关论文。");
  const update = {
    schema_version: 1,
    task_id: taskId,
    sequence: 13,
    event_type: "stage.progress",
    stage: "search",
    level: "info",
    occurred_at: "2026-10-09T00:00:00Z",
    payload: { counts: { raw_papers: 12 } },
  };
  await expect.poll(async () => (await streamMetrics(page)).active).toBe(1);
  await page.evaluate((event) => {
    (
      window as unknown as {
        dispatchResearchEvent: (event: Record<string, unknown>) => void;
      }
    ).dispatchResearchEvent(event);
  }, update);
  const stage = page.getByTestId("current-stage-details");
  await stage.locator("summary").click();
  await expect(stage).toContainText(progress);
  const plan = page.getByTestId("research-plan-details");
  await plan.locator("summary").click();
  await expect(plan.getByRole("listitem")).toHaveCount(2);
  await expect(plan).toContainText("比较多来源检索的证据");
  await expect(hero).not.toContainText("研究 Agent 会在此发布进度。");
  await expect(plan).not.toContainText("规划 Agent 发布计划后");
  await page.evaluate(() => document.fonts.ready);
  await page.screenshot({
    path: test.info().outputPath("research-progress-zh.png"),
    animations: "disabled",
  });
  restored.replay_events!.push(update);
  restored.last_sequence = 13;
  await page.reload();
  await expect(hero).toContainText(progress);
  await plan.locator("summary").click();
  await expect(plan).toContainText("比较多来源检索的证据");
  await expect(plan).toContainText("分析现有方法的局限");
  await expect.poll(async () => (await streamMetrics(page)).active).toBe(1);
});

test("folded follow-up and Zen preserve the draft and the task stream", async ({
  page,
}) => {
  const pageErrors: string[] = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));
  await mockRunningResearch(page);
  await page.goto(`/en/research/${taskId}`);
  const composer = page.getByTestId("followup-composer");
  const input = page.getByRole("textbox", { name: "Ask about this report" });
  const expand = page.getByRole("button", { name: "Expand follow-up" });
  const hero = page.getByTestId("task-stage-hero");

  await expect(hero).toBeVisible();
  await expect(
    hero.getByRole("heading", { name: "Select", exact: true }),
  ).toBeVisible();
  await expect(hero.getByRole("status")).toContainText("03 / 07");
  await expect(hero.getByTestId("research-stage-robot")).toHaveCount(0);
  await expect(input).toBeHidden();
  await expect(expand).toHaveAttribute("aria-expanded", "false");
  await expect(
    composer.getByRole("navigation", { name: "Stage detail" }),
  ).toBeVisible();
  for (const [name, content] of [
    ["Select", "Selecting the most relevant attention research."],
    ["Research plan", "Compare efficient attention methods"],
  ]) {
    const detail = page.locator("details").filter({
      has: page.locator("summary", { hasText: new RegExp(`^${name}$`) }),
    });
    await expect(detail).toHaveCount(1);
    await expect(detail).toHaveJSProperty("open", false);
    await detail.locator("summary").click();
    await expect(detail.getByText(content, { exact: true })).toBeVisible();
    await detail.locator("summary").click();
    await expect(detail).toHaveJSProperty("open", false);
  }
  await expect.poll(async () => (await streamMetrics(page)).active).toBe(1);
  const initialStream = await streamMetrics(page);
  await page.evaluate(() => document.fonts.ready);
  await page.screenshot({
    path: test.info().outputPath("research-normal.png"),
    animations: "disabled",
  });

  await expand.click();
  await input.fill("Compare the evidence without starting another study.");
  await page.screenshot({
    path: test.info().outputPath("research-expanded.png"),
    animations: "disabled",
  });
  await page.getByRole("button", { name: "Collapse follow-up" }).click();
  await expect(input).toBeHidden();
  await page.getByRole("button", { name: "Enter Zen mode" }).click();
  const zen = page.getByTestId("task-zen-view");
  const exit = page.getByRole("button", { name: "Exit Zen mode" });
  await expect(zen).toBeVisible();
  await expect(exit).toBeFocused();
  await expect(page.getByRole("button")).toHaveCount(1);
  await expect(
    page.getByRole("complementary", { name: "Task navigation" }),
  ).toHaveCount(0);
  await expect(
    page.getByRole("complementary", { name: "Context panel" }),
  ).toHaveCount(0);
  await expect(page.locator("[data-pet-state]")).toHaveCount(0);
  await expect(
    composer.getByRole("navigation", { name: "Stage detail" }),
  ).toBeVisible();
  await expect(composer).toHaveAttribute("data-zen", "true");
  await page.evaluate((id) => {
    const dispatch = (
      window as unknown as {
        dispatchResearchEvent: (event: Record<string, unknown>) => void;
      }
    ).dispatchResearchEvent;
    const event = {
      schema_version: 1,
      task_id: id,
      level: "info",
      occurred_at: "2026-10-05T09:00:12Z",
      payload: {},
    };
    dispatch({
      ...event,
      sequence: 13,
      event_type: "stage.completed",
      stage: "filter",
    });
    dispatch({
      ...event,
      sequence: 14,
      event_type: "stage.started",
      stage: "read",
    });
  }, taskId);
  await expect(
    zen.getByRole("heading", { name: "Read", exact: true }),
  ).toBeVisible();
  await expect(zen.getByTestId("research-stage-robot")).toHaveCount(0);
  await expect(composer.locator('[aria-current="step"]')).toHaveAttribute(
    "aria-label",
    "Read Running",
  );
  expect(await streamMetrics(page)).toEqual(initialStream);
  await page.screenshot({
    path: test.info().outputPath("research-zen.png"),
    animations: "disabled",
  });

  await page.keyboard.press("Escape");
  await expect(zen).toBeHidden();
  await expect(
    page.getByRole("button", { name: "Enter Zen mode" }),
  ).toBeFocused();
  await expand.click();
  await expect(input).toHaveValue(
    "Compare the evidence without starting another study.",
  );
  await page.getByRole("button", { name: "Enter Zen mode" }).click();
  await page.getByRole("button", { name: "Exit Zen mode" }).click();
  await expect(zen).toBeHidden();
  await expect(input).toHaveValue(
    "Compare the evidence without starting another study.",
  );
  expect(await streamMetrics(page)).toEqual(initialStream);
  expect(initialStream.peak).toBe(1);

  const zhTaskId = "task-focus-zh";
  await page.route(`**/api/v1/research/tasks/${zhTaskId}`, (route) =>
    route.fulfill({
      json: {
        ...snapshot,
        id: zhTaskId,
        effective_locale: "zh-CN",
        title: "Transformer 注意力机制的新进展",
        query: "2023 年以来，Transformer 注意力机制有哪些进展？",
        replay_events: snapshot.replay_events?.map((event) => ({
          ...event,
          task_id: zhTaskId,
        })),
      },
    }),
  );
  await page.route(`**/api/v1/research/tasks/${zhTaskId}/messages`, (route) =>
    route.fulfill({
      json: {
        task_id: zhTaskId,
        task_status: "running",
        messages: [],
        pending: null,
      },
    }),
  );
  await page.goto(`/research/${zhTaskId}`);
  await expect(page.getByRole("button", { name: "进入禅模式" })).toBeVisible();
  await expect(hero.getByRole("heading", { level: 1 })).toBeVisible();
  await expect(hero.getByTestId("research-stage-robot")).toHaveCount(0);
  await page.evaluate(() => document.fonts.ready);
  await page.screenshot({
    path: test.info().outputPath("research-normal-zh.png"),
    animations: "disabled",
  });
  await page.getByRole("button", { name: "展开追问" }).click();
  await expect(
    page.getByRole("textbox", { name: "追问当前报告" }),
  ).toBeFocused();
  await page.screenshot({
    path: test.info().outputPath("research-expanded-zh.png"),
    animations: "disabled",
  });
  await page.emulateMedia({ reducedMotion: "reduce" });
  await expect(hero.locator("[data-research-media]")).toHaveCount(0);
  expect(pageErrors).toEqual([]);
});
