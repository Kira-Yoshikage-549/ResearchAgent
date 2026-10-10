import { expect, test } from "@playwright/test";
import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { mockEntryBackend } from "./three-page-helpers";

// Explicit opt-in: this records timings, not a display-FPS assertion for CI.
test.skip(
  !process.env.WAVE_TITLE_BENCHMARK,
  "Opt-in title performance capture",
);
test.use({ viewport: { width: 1366, height: 768 }, deviceScaleFactor: 1 });

test("measure title rendering with a seeded pointer trajectory", async ({
  page,
}) => {
  test.setTimeout(60000);
  await mockEntryBackend(page);
  await page.addInitScript(() => {
    Math.random = () => 0.5;
  });
  await page.goto("/en");
  await page.evaluate(() => document.fonts.ready);
  await expect(page.getByTestId("welcome-waves")).toHaveAttribute(
    "data-intro",
    "complete",
  );
  const session = await page.context().newCDPSession(page);
  await session.send("Performance.enable");
  const samples = [];
  for (let sample = 0; sample < 3; sample++) {
    const before = await session.send("Performance.getMetrics");
    const result = await page.evaluate(async () => {
      const host = document.querySelector<HTMLElement>("a-waves")!;
      const target = host.closest("section")!;
      const ctx = host.querySelector("canvas")!.getContext("2d")!;
      const original = {
        save: ctx.save,
        restore: ctx.restore,
        clearRect: ctx.clearRect,
      };
      let depth = 0,
        blockStart = 0,
        titleTime = 0;
      const titleTimes: number[] = [],
        intervals: number[] = [];
      // Background drawing has no save/restore blocks. The outer title block
      // includes its cached mask, mesh transforms, clipping and glyph drawing.
      ctx.save = function () {
        if (depth++ === 0) blockStart = performance.now();
        original.save.call(this);
      };
      ctx.restore = function () {
        original.restore.call(this);
        if (--depth === 0) titleTime += performance.now() - blockStart;
      };
      ctx.clearRect = function (x, y, width, height) {
        if (titleTime) titleTimes.push(titleTime);
        titleTime = 0;
        original.clearRect.call(this, x, y, width, height);
      };
      const start = performance.now();
      let previous = start;
      try {
        await new Promise<void>((resolve) => {
          function trace(time: number) {
            intervals.push(time - previous);
            previous = time;
            const elapsed = time - start;
            target.dispatchEvent(
              new PointerEvent("pointermove", {
                bubbles: true,
                pointerType: "mouse",
                clientX: 360 + 260 * Math.sin(elapsed * 0.009),
                clientY: 315 + 95 * Math.cos(elapsed * 0.007),
              }),
            );
            if (elapsed < 10000) requestAnimationFrame(trace);
            else resolve();
          }
          requestAnimationFrame(trace);
        });
      } finally {
        Object.assign(ctx, original);
      }
      const duration = performance.now() - start;
      const percentile = (values: number[], p: number) => {
        const sorted = values.slice().sort((a, b) => a - b);
        return sorted[Math.floor(sorted.length * p)] || 0;
      };
      return {
        viewport: [innerWidth, innerHeight, devicePixelRatio],
        duration,
        callbacks: intervals.length,
        callbackHz: (intervals.length * 1000) / duration,
        p95Ms: percentile(intervals.slice(1), 0.95),
        over25Ms: intervals.slice(1).filter((ms) => ms > 25).length,
        titleP95Ms: percentile(titleTimes, 0.95),
        titleMaxMs: Math.max(0, ...titleTimes),
      };
    });
    const after = await session.send("Performance.getMetrics");
    const delta = (name: string) =>
      after.metrics.find((metric) => metric.name === name)!.value -
      before.metrics.find((metric) => metric.name === name)!.value;
    samples.push({
      ...result,
      scriptSeconds: delta("ScriptDuration"),
      taskSeconds: delta("TaskDuration"),
    });
  }
  await session.send("Performance.disable");
  const directory = resolve("artifacts/home-title");
  mkdirSync(directory, { recursive: true });
  writeFileSync(
    resolve(directory, `performance-${process.env.WAVE_TITLE_BENCHMARK}.json`),
    JSON.stringify(samples, null, 2),
  );
  console.log(JSON.stringify(samples));
});
