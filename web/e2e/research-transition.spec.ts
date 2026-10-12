import path from "node:path";
import { expect, test, type Page } from "@playwright/test";
import type { ResearchTaskResultResponse } from "../lib/api/client";
import {
  mockRunningResearch,
  snapshot,
  streamMetrics,
  taskId,
} from "./research-focus-helpers";
import { expectMenuSettled } from "./three-page-helpers";

test.use({
  viewport: { width: 1366, height: 768 },
  video: { mode: "on", size: { width: 1366, height: 768 } },
});
test.setTimeout(60_000);
const evidence = path.resolve(process.cwd(), "../docs/frontend-swiss");
const report: ResearchTaskResultResponse = {
  task_id: taskId,
  partial: false,
  report_markdown:
    "# Research findings / 研究发现\n\n## Evidence / 证据\n\nThe research connects retrieval quality with reliable evidence. 研究表明，检索质量与可靠证据密切相关。\n\n## Limitations / 局限\n\nSource coverage remains a limitation. 来源覆盖仍有局限。",
  research_plan: [],
  papers: [],
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

async function setup(page: Page, locale: "en" | "zh-CN" = "en") {
  // No test request reaches the running real backend.
  await page.route("**/api/v1/**", (route) => route.abort());
  const task = { ...snapshot, effective_locale: locale };
  await mockRunningResearch(page, task);
  await page.route("**/api/v1/research/history*", (route) =>
    route.fulfill({ json: [task] }),
  );
  await page.route(`**/api/v1/research/tasks/${taskId}/result`, (route) =>
    route.fulfill({ json: report }),
  );
  await page.route("**/api/v1/research/tasks", (route) =>
    route.fulfill({
      status: 202,
      json: {
        task,
        links: {
          self: `/api/v1/research/tasks/${taskId}`,
          events: `/api/v1/research/tasks/${taskId}/events`,
          result: `/api/v1/research/tasks/${taskId}/result`,
        },
      },
    }),
  );
  return task;
}
async function settled(page: Page) {
  await expect(page.getByTestId("entry-transition")).toHaveCount(0);
  await expect(page.locator('[data-report-revealing="true"]')).toHaveCount(0);
  await expect(page.locator("main[inert], main [inert]")).toHaveCount(0);
}
async function observe(page: Page) {
  await page.evaluate(() => {
    const state = {
      phases: [] as {
        mode: string;
        phase: string;
        direction: string;
        url: string;
        at: number;
      }[],
      reveals: 0,
    };
    Object.assign(window, { researchMotion: state });
    new MutationObserver((records) => {
      for (const record of records) {
        if (
          record.attributeName === "data-report-revealing" &&
          record.oldValue === null &&
          (record.target as HTMLElement).dataset.reportRevealing === "true"
        )
          state.reveals++;
      }
      const mask = document.querySelector<HTMLElement>(
        '[data-testid="entry-transition"]',
      );
      if (mask && state.phases.at(-1)?.phase !== mask.dataset.phase)
        state.phases.push({
          mode: mask.dataset.mode!,
          phase: mask.dataset.phase!,
          direction: mask.dataset.direction!,
          url: location.pathname,
          at: performance.now(),
        });
    }).observe(document.body, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeOldValue: true,
      attributeFilter: ["data-phase", "data-report-revealing"],
    });
  });
}
async function finishReport(page: Page) {
  await page.evaluate((id) => {
    (
      window as unknown as { dispatchResearchEvent: (event: object) => void }
    ).dispatchResearchEvent({
      schema_version: 1,
      task_id: id,
      sequence: 20,
      event_type: "task.completed",
      occurred_at: "2026-10-11T12:00:00Z",
      level: "info",
      payload: {},
    });
  }, taskId);
}
async function motion(page: Page) {
  return page.evaluate(
    () =>
      (
        window as unknown as {
          researchMotion: {
            phases: {
              mode: string;
              phase: string;
              direction: string;
              url: string;
              at: number;
            }[];
            reveals: number;
          };
        }
      ).researchMotion,
  );
}

test.afterEach(async ({ page }) => {
  const locale = test
    .info()
    .title.match(/^research flow.*\((en|zh-CN)\)$/)?.[1];
  if (locale && test.info().status === "passed") {
    const video = page.video();
    await page.close();
    await video?.saveAs(
      path.join(evidence, "videos", `research-transition-${locale}.webm`),
    );
  }
});

for (const locale of ["en", "zh-CN"] as const) {
  test(`research flow preserves entry motion and reveals the report once (${locale})`, async ({
    page,
  }) => {
    const errors: string[] = [];
    page.on("pageerror", (error) =>
      errors.push(`${page.url()}: ${error.stack ?? error.message}`),
    );
    const task = await setup(page, locale);
    await page.goto(`${locale === "en" ? "/en" : ""}/history`);
    await page.evaluate(() => document.fonts.ready);
    await observe(page);
    await page.getByRole("link", { name: task.title, exact: true }).click();
    await expect(page).toHaveURL(new RegExp(`/research/${taskId}$`));
    await settled(page);
    await expect(
      page.getByTestId("task-stage-hero").locator("h1"),
    ).toBeFocused();
    const first = (await motion(page)).phases;
    expect(first.map((phase) => phase.phase)).toEqual([
      "covering",
      "holding",
      "uncovering",
    ]);
    expect(
      first.every(
        (phase) => phase.mode === "research" && phase.direction === "forward",
      ),
    ).toBe(true);
    expect(first[0].url).toContain("/history");
    expect(first[2].at - first[1].at).toBeGreaterThanOrEqual(370);
    await page.screenshot({
      path: path.join(
        evidence,
        "screenshots",
        `research-transition-live-${locale}.png`,
      ),
    });

    await page
      .getByRole("link", {
        name: locale === "en" ? "Home" : "首页",
        exact: true,
      })
      .click();
    await expectMenuSettled(page);
    await settled(page);
    await expect(page.locator("#research-menu-title")).toBeFocused();
    expect(
      (await motion(page)).phases
        .slice(-3)
        .every((phase) => phase.direction === "forward"),
    ).toBe(true);
    const returned = (await motion(page)).phases.slice(-3);
    expect(returned[2].at - returned[1].at).toBeGreaterThanOrEqual(370);
    await page.getByRole("link", { name: /NEW RESEARCH|新建研究/ }).click();
    await expect(page).toHaveURL(/\/research\/new$/);
    await settled(page);
    expect(
      (await motion(page)).phases.slice(-6).map((phase) => phase.phase),
    ).toEqual([
      "covering",
      "center-in",
      "holding",
      "center-out",
      "title-in",
      "uncovering",
    ]);
    await page
      .getByRole("textbox", { name: /Research question|研究问题/ })
      .fill("How does retrieval support reliable scientific evidence?");
    await page
      .getByRole("button", { name: /send to agent|发送给 Agent/i })
      .click();
    await expect(page).toHaveURL(new RegExp(`/research/${taskId}$`));
    await settled(page);
    const metrics = await streamMetrics(page);
    expect(metrics.peak).toBe(1);
    task.status = "completed";
    await finishReport(page);
    await expect(page.getByTestId("task-scroll-region")).toHaveAttribute(
      "data-report-revealing",
      "true",
    );
    await page.screenshot({
      path: path.join(
        evidence,
        "screenshots",
        `research-transition-reveal-${locale}.png`,
      ),
    });
    await expect(
      page.getByRole("heading", { name: /Research synthesis|研究综合报告/ }),
    ).toBeVisible();
    await settled(page);
    expect((await motion(page)).reveals).toBe(1);
    expect(await streamMetrics(page)).toEqual({ ...metrics, active: 0 });
    await expect(page.getByTestId("task-scroll-region")).toHaveCSS(
      "clip-path",
      "none",
    );
    await page.screenshot({
      path: path.join(
        evidence,
        "screenshots",
        `research-transition-report-${locale}.png`,
      ),
    });
    await page.getByRole("tab", { name: /Papers \(0\)|论文（0）/ }).click();
    await page.getByRole("tab", { name: /Report|^报告$/ }).click();
    expect((await motion(page)).reveals).toBe(1);
    await page
      .getByRole("button", { name: /Expand task sidebar|展开任务侧栏/ })
      .click();
    await page
      .getByRole("link", { name: /History|历史记录/, exact: true })
      .click();
    await expect(page).toHaveURL(/\/history$/);
    await settled(page);
    expect(
      (await motion(page)).phases
        .slice(-3)
        .every((phase) => phase.direction === "forward"),
    ).toBe(true);
    await page.screenshot({
      path: path.join(
        evidence,
        "screenshots",
        `research-transition-return-${locale}.png`,
      ),
    });
    expect(errors).toEqual([]);
  });
}

test("slow task data unveils the loading shell and a missing task stays usable", async ({
  page,
}) => {
  const task = await setup(page);
  let release: (() => Promise<void>) | undefined;
  await page.route(`**/api/v1/research/tasks/${taskId}`, (route) => {
    release = () =>
      route.fulfill({ status: 404, json: { detail: "Missing task" } });
  });
  await page.goto("/en/history");
  await observe(page);
  await page.getByRole("link", { name: task.title }).click();
  await expect(page).toHaveURL(new RegExp(`/research/${taskId}$`));
  await settled(page);
  await expect(page.locator("main")).toBeFocused();
  await expect(
    page.getByTestId("task-scroll-region").getByRole("status"),
  ).toBeVisible();
  await expect.poll(() => Boolean(release)).toBe(true);
  await release!();
  await expect(
    page.getByTestId("task-scroll-region").getByRole("alert"),
  ).toContainText(/could not be found/i);
  await page.getByRole("link", { name: /History$/ }).click();
  await expect(page).toHaveURL(/\/history$/);
  await settled(page);
});

test("active-task return animates while reduced motion and refresh remain direct", async ({
  page,
}) => {
  const task = await setup(page);
  await page.route("**/api/v1/research/tasks/active", (route) =>
    route.fulfill({ json: task }),
  );
  await page.goto("/en/research/new");
  await observe(page);
  await page.getByRole("link", { name: /Return to research task/i }).click();
  await expect(page).toHaveURL(new RegExp(`/research/${taskId}$`));
  await settled(page);
  expect((await motion(page)).phases).toHaveLength(3);
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.getByRole("link", { name: /History$/ }).click();
  await expect(page).toHaveURL(/\/history$/);
  await page.getByRole("link", { name: task.title }).click();
  await expect(page).toHaveURL(new RegExp(`/research/${taskId}$`));
  await settled(page);
  expect((await motion(page)).phases).toHaveLength(3);
  task.status = "completed";
  await page.emulateMedia({ reducedMotion: "no-preference" });
  await page.reload();
  await observe(page);
  await expect(
    page.getByRole("heading", { name: "Research synthesis" }),
  ).toBeVisible();
  expect((await motion(page)).reveals).toBe(0);
});

test("a selection in the outgoing live view suppresses report motion", async ({
  page,
}) => {
  const task = await setup(page);
  await page.goto(`/en/research/${taskId}`);
  await observe(page);
  await page
    .getByTestId("task-stage-hero")
    .locator("h1")
    .evaluate((element) => {
      const range = document.createRange();
      range.selectNodeContents(element);
      window.getSelection()?.removeAllRanges();
      window.getSelection()?.addRange(range);
      document.dispatchEvent(new Event("selectionchange"));
    });
  task.status = "completed";
  await finishReport(page);
  await expect(
    page.getByRole("heading", { name: "Research synthesis" }),
  ).toBeVisible();
  expect((await motion(page)).reveals).toBe(0);
});

test("successful retry and another task use the same short navigation lock", async ({
  page,
}) => {
  const task = await setup(page);
  task.status = "failed";
  const retried = {
    ...snapshot,
    id: "task-retried",
    title: "Retried research",
  };
  await page.route(`**/api/v1/research/tasks/${taskId}/retry`, (route) =>
    route.fulfill({ json: retried }),
  );
  await page.route("**/api/v1/research/tasks/task-retried", (route) =>
    route.fulfill({ json: retried }),
  );
  await page.route("**/api/v1/research/tasks/task-retried/messages", (route) =>
    route.fulfill({
      json: {
        task_id: retried.id,
        task_status: "running",
        messages: [],
        pending: null,
      },
    }),
  );
  await page.route("**/api/v1/research/tasks/task-retried/result", (route) =>
    route.fulfill({ status: 204 }),
  );
  await page.goto(`/en/research/${taskId}`);
  await observe(page);
  await page.getByRole("button", { name: "Start research again" }).click();
  await expect(page).toHaveURL(/\/research\/task-retried$/);
  await settled(page);
  expect((await motion(page)).phases.map((phase) => phase.phase)).toEqual([
    "covering",
    "holding",
    "uncovering",
  ]);
  task.status = "completed";
  await page.getByRole("link", { name: task.title, exact: true }).click();
  await expect(page).toHaveURL(new RegExp(`/research/${taskId}$`));
  await settled(page);
  await expect(
    page.getByRole("heading", { name: "Research synthesis" }),
  ).toBeVisible();
  expect((await motion(page)).reveals).toBe(0);
  expect(
    (await motion(page)).phases.every((phase) => phase.direction === "forward"),
  ).toBe(true);
  expect((await streamMetrics(page)).peak).toBe(1);
});

test("automatic report arrival preserves a focused follow-up draft", async ({
  page,
}) => {
  const task = await setup(page);
  await page.goto(`/en/research/${taskId}`);
  await observe(page);
  await page.getByRole("button", { name: "Expand follow-up" }).click();
  const input = page.getByRole("textbox", { name: "Ask about this report" });
  await input.fill("Keep my draft while results arrive");
  const metrics = await streamMetrics(page);
  task.status = "completed";
  await finishReport(page);
  await expect(
    page.getByRole("heading", { name: "Research synthesis" }),
  ).toBeVisible();
  await expect(input).toHaveValue("Keep my draft while results arrive");
  await expect(input).toBeFocused();
  expect((await motion(page)).reveals).toBe(0);
  expect(await streamMetrics(page)).toEqual({ ...metrics, active: 0 });
});
