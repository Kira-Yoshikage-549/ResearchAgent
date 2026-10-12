import path from "node:path";
import { expect, test } from "@playwright/test";
import { mockEntryBackend } from "./three-page-helpers";

test.use({
  viewport: { width: 1366, height: 768 },
  video: { mode: "on", size: { width: 1366, height: 768 } },
});
const evidence = path.resolve(process.cwd(), "../docs/frontend-swiss");

for (const locale of ["en", "zh-CN"] as const) {
  test(`${locale} history/settings header uses the short paper mask in both directions`, async ({
    page,
  }) => {
    await page.route("**/api/v1/**", (route) => route.abort());
    await mockEntryBackend(page);
    const prefix = locale === "en" ? "/en" : "";
    const chinese = locale === "zh-CN";
    await page.goto(`${prefix}/history`);
    await page.evaluate(() => document.fonts.ready);
    await page.evaluate(() => {
      const phases: { phase: string; direction: string; at: number }[] = [];
      Object.assign(window, { shortPagePhases: phases });
      new MutationObserver(() => {
        const mask = document.querySelector<HTMLElement>(
          '[data-testid="entry-transition"]',
        );
        if (mask && phases.at(-1)?.phase !== mask.dataset.phase) {
          phases.push({
            phase: mask.dataset.phase!,
            direction: mask.dataset.direction!,
            at: performance.now(),
          });
        }
      }).observe(document.body, {
        subtree: true,
        childList: true,
        attributes: true,
        attributeFilter: ["data-phase"],
      });
    });
    for (const destination of ["settings", "history"] as const) {
      const source = page.url();
      const name =
        destination === "settings"
          ? chinese
            ? "设置"
            : "Settings"
          : chinese
            ? "历史记录"
            : "History";
      await page
        .getByRole("navigation")
        .getByRole("link", { name, exact: true })
        .click();
      const mask = page.getByTestId("entry-transition");
      await expect(mask).toHaveAttribute("data-mode", "research");
      expect(page.url()).toBe(source);
      await expect
        .poll(() => mask.getAttribute("data-phase"), { intervals: [10] })
        .toBe("holding");
      await expect(page).toHaveURL(new RegExp(`${prefix}/${destination}$`));
      await expect(page.getByTestId("entry-transition-center")).toHaveCount(0);
      await expect(
        page.locator("[data-entry-word], [data-entry-title-active]"),
      ).toHaveCount(0);
      if (destination === "settings") {
        await page.screenshot({
          path: path.join(
            evidence,
            "screenshots",
            `history-settings-hold-${locale}.png`,
          ),
        });
      }
      await expect(mask).toHaveCount(0);
      const heading = page.getByRole("heading", {
        name:
          destination === "history"
            ? chinese
              ? "研究历史"
              : "Research history"
            : name,
        exact: true,
      });
      await expect(heading).toBeFocused();
      await page.screenshot({
        path: path.join(
          evidence,
          "screenshots",
          `history-settings-${destination}-${locale}.png`,
        ),
      });
      const phases = await page.evaluate(() =>
        (
          window as unknown as {
            shortPagePhases: { phase: string; direction: string; at: number }[];
          }
        ).shortPagePhases.slice(-3),
      );
      expect(phases.map((phase) => phase.phase)).toEqual([
        "covering",
        "holding",
        "uncovering",
      ]);
      expect(phases.every((phase) => phase.direction === "forward")).toBe(true);
      expect(phases[2].at - phases[1].at).toBeGreaterThanOrEqual(370);
      await page
        .getByRole("navigation")
        .getByRole("link", { name, exact: true })
        .click();
      await expect(mask).toHaveCount(0);
    }
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page
      .getByRole("navigation")
      .getByRole("link", { name: chinese ? "设置" : "Settings", exact: true })
      .click();
    await expect(page).toHaveURL(new RegExp(`${prefix}/settings$`));
    await expect(page.getByTestId("entry-transition")).toHaveCount(0);
    const video = page.video();
    await page.close();
    await video?.saveAs(
      path.join(
        evidence,
        "videos",
        `history-settings-transition-${locale}.webm`,
      ),
    );
  });
}
