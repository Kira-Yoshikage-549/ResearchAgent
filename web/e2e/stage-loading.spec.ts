import { expect, test, type Page } from "@playwright/test";
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

async function dispatch(
  page: Page,
  events: Array<{
    event_type: string;
    sequence: number;
    stage?: string;
    payload?: Record<string, unknown>;
  }>,
) {
  await page.evaluate(
    ({ id, events }) => {
      const send = (
        window as unknown as {
          dispatchResearchEvent: (event: Record<string, unknown>) => void;
        }
      ).dispatchResearchEvent;
      for (const event of events)
        send({
          schema_version: 1,
          task_id: id,
          level: "info",
          occurred_at: "2026-10-11T12:00:02Z",
          payload: {},
          ...event,
        });
    },
    { id: taskId, events },
  );
}

for (const locale of ["en", "zh-CN"] as const) {
  test(`snake loading keeps rail and Zen state synchronized (${locale})`, async ({
    page,
  }) => {
    const errors: string[] = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await page.emulateMedia({ reducedMotion: "no-preference" });
    await mockRunningResearch(page, {
      ...snapshot,
      effective_locale: locale,
      stages: snapshot.stages!.map((stage) =>
        stage.stage === "filter" && locale === "zh-CN"
          ? { ...stage, detail: "正在筛选与注意力机制相关的研究论文。" }
          : stage,
      ),
    });
    await page.goto(`/${locale}/research/${taskId}`);
    await expect.poll(async () => (await streamMetrics(page)).active).toBe(1);
    await page.evaluate(() => document.fonts.ready);
    const metrics = await streamMetrics(page);
    const rail = page.getByTestId("followup-composer").locator("nav");
    const select = rail.locator('[aria-current="step"] [data-stage-loading]');
    await expect(select).toHaveAttribute("data-phase", "loading");
    await expect(select).toHaveCSS("width", "40px");
    await expect(select.locator("path").first()).toHaveCSS(
      "stroke",
      "rgb(218, 41, 28)",
    );
    const offset = await select
      .locator("path")
      .first()
      .evaluate((path) => getComputedStyle(path).strokeDashoffset);
    await expect
      .poll(() =>
        select
          .locator("path")
          .first()
          .evaluate((path) => getComputedStyle(path).strokeDashoffset),
      )
      .not.toBe(offset);
    const geometry = await rail
      .locator("[data-stage-loading]")
      .evaluateAll((indicators) =>
        indicators.map((indicator) => {
          const slot = indicator.getBoundingClientRect();
          const number =
            indicator.previousElementSibling!.getBoundingClientRect();
          return {
            gap: slot.left - number.right,
            width: slot.width,
            right: slot.right,
          };
        }),
      );
    for (const item of geometry) expect(item.gap).toBeCloseTo(12, 0);
    expect(geometry.at(-1)!.right).toBeLessThanOrEqual(
      (await rail.boundingBox())!.x + (await rail.boundingBox())!.width,
    );
    await page.screenshot({
      path: test.info().outputPath(`rail-loading-${locale}.png`),
    });

    await page
      .getByRole("button", {
        name: locale === "en" ? "Enter Zen mode" : "进入禅模式",
      })
      .click();
    const center = page.getByTestId("zen-stage-loading");
    const zen = page.getByTestId("task-zen-view");
    await expect(center.locator("[data-stage-loading]")).toHaveAttribute(
      "data-phase",
      "loading",
    );
    const centerBox = (await center.boundingBox())!;
    const zenBox = (await zen.boundingBox())!;
    expect(centerBox.width).toBe(240);
    expect(centerBox.height).toBe(120);
    expect(centerBox.x + 120).toBeCloseTo(zenBox.x + zenBox.width / 2, 0);
    expect(centerBox.y + 60).toBeCloseTo(zenBox.y + zenBox.height / 2, 0);
    const description = zen.locator("p").last();
    const descriptionBox = (await description.boundingBox())!;
    expect(
      centerBox.x - descriptionBox.x - descriptionBox.width,
    ).toBeGreaterThanOrEqual(31);
    await expect(select).toHaveCSS("width", "48px");
    // Keep one complete, naturally played loop in the untouched recording.
    await page.waitForTimeout(2200);
    await page.screenshot({
      path: test.info().outputPath(`zen-loading-${locale}.png`),
    });

    await dispatch(page, [
      { event_type: "stage.completed", sequence: 13, stage: "filter" },
    ]);
    await expect(select).toHaveAttribute("data-phase", "complete");
    await expect(center.locator("[data-stage-loading]")).toHaveAttribute(
      "data-phase",
      "complete",
    );
    await expect(center.locator("circle")).toHaveCSS("fill", "none");
    await expect(center.locator(".lucide-check")).toHaveCSS(
      "color",
      "rgb(0, 0, 0)",
    );
    await page.screenshot({
      path: test.info().outputPath(`zen-complete-${locale}.png`),
    });
    const completed = rail
      .locator('[data-stage-loading][data-status="completed"]')
      .nth(2);
    const checkBefore = (await completed
      .locator(".lucide-check")
      .boundingBox())!;
    await dispatch(page, [
      { event_type: "stage.started", sequence: 14, stage: "read" },
    ]);
    await expect(completed).toHaveAttribute("data-phase", "leaving");
    await expect
      .poll(() =>
        completed.locator("circle").evaluate((circle) => {
          const transform = getComputedStyle(circle.parentElement!).transform;
          return transform === "none" ? 0 : new DOMMatrix(transform).m42;
        }),
      )
      .toBeGreaterThan(0);
    await expect(completed).toHaveAttribute("data-phase", "check");
    const checkAfter = (await completed
      .locator(".lucide-check")
      .boundingBox())!;
    expect(checkAfter.x).toBeCloseTo(checkBefore.x, 1);
    expect(checkAfter.y).toBeCloseTo(checkBefore.y, 1);
    await expect(center.locator("[data-stage-loading]")).toHaveAttribute(
      "data-phase",
      "loading",
    );
    await expect(center.locator("[data-stage-loading]")).toHaveAttribute(
      "data-status",
      "running",
    );
    await page.screenshot({
      path: test.info().outputPath(`zen-next-${locale}.png`),
    });

    // Complete and start are intentionally dispatched in one JS turn.
    await dispatch(page, [
      { event_type: "stage.completed", sequence: 15, stage: "read" },
      { event_type: "stage.started", sequence: 16, stage: "analyze" },
    ]);
    const old = rail
      .locator('[data-stage-loading][data-status="completed"]')
      .nth(3);
    await expect(old).toHaveAttribute("data-phase", "settling");
    await expect(
      rail.locator('[aria-current="step"] [data-stage-loading]'),
    ).toHaveAttribute("data-phase", "loading");
    await expect(old).toHaveAttribute("data-phase", "check");
    expect(await streamMetrics(page)).toEqual(metrics);

    await page.emulateMedia({ reducedMotion: "reduce" });
    await expect(center.locator("[data-stage-loading]")).toHaveAttribute(
      "data-phase",
      "idle",
    );
    await dispatch(page, [
      { event_type: "stage.completed", sequence: 17, stage: "analyze" },
      { event_type: "stage.started", sequence: 18, stage: "synthesize" },
    ]);
    await expect(
      rail.locator('[data-stage-loading][data-status="completed"]').nth(4),
    ).toHaveAttribute("data-phase", "check");
    await dispatch(page, [
      {
        event_type: "stage.progress",
        sequence: 19,
        stage: "synthesize",
        payload: {
          detail:
            locale === "en"
              ? "The agent is comparing evidence from several academic sources and checking the limitations of each method before assembling a grounded synthesis. ".repeat(
                  3,
                )
              : "Agent 正在比较多个学术来源中的证据，检查各方法的适用条件和局限，并逐步整理综合报告。".repeat(
                  4,
                ),
        },
      },
    ]);
    const longDescriptionBox = (await description.boundingBox())!;
    expect(
      centerBox.x - longDescriptionBox.x - longDescriptionBox.width,
    ).toBeGreaterThanOrEqual(31);
    await page.keyboard.press("Escape");
    await expect(zen).toBeHidden();
    await expect(
      page.getByRole("button", {
        name: locale === "en" ? "Enter Zen mode" : "进入禅模式",
      }),
    ).toBeFocused();
    expect(await streamMetrics(page)).toEqual(metrics);
    expect(errors).toEqual([]);
  });
}
