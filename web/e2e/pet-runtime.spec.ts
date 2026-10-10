import { expect, test } from "@playwright/test";
import { mockEntryBackend } from "./three-page-helpers";

test("legacy visible companion preferences never mount media and preserve research defaults", async ({
  page,
}) => {
  const media: string[] = [];
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("request", (request) => {
    if (
      /\/(?:brand-robot|research-robot|design-text|pets)\//.test(request.url())
    )
      media.push(request.url());
  });
  await mockEntryBackend(page);
  await page.addInitScript(() => {
    const key = "research-agent.preferences.v1";
    if (localStorage.getItem(key)) return;
    localStorage.setItem(
      key,
      JSON.stringify({
        version: 1,
        state: {
          version: 1,
          research: { maxPapers: 9, sources: ["pubmed"] },
          pet: {
            visible: true,
            size: "medium",
            motion: "full",
            dragLocked: false,
            position: { xRatio: 0.5, yRatio: 1 },
          },
        },
      }),
    );
  });
  for (const route of [
    "/en/history",
    "/en/settings",
    "/en/workspace",
    "/en/research/new",
  ]) {
    await page.goto(route);
    await expect(
      page.locator("h1:visible, #research-menu-title:visible").first(),
    ).toBeVisible();
    await expect(
      page.locator(
        "[data-pet-state], [data-brand-media], [data-research-media], canvas:not([data-welcome-wave-canvas]), video",
      ),
    ).toHaveCount(0);
  }
  await page.getByText("Examples & research options", { exact: true }).click();
  await page
    .getByRole("button", { name: "This research overrides", exact: true })
    .click();
  await expect(page.getByLabel("Maximum papers")).toHaveValue("9");
  await expect(
    page.getByRole("checkbox", { name: "PubMed", exact: true }),
  ).toBeChecked();
  await expect(
    page.getByRole("checkbox", { name: "arXiv", exact: true }),
  ).not.toBeChecked();
  await page.reload();
  await expect(page.getByLabel("Research question")).toBeVisible();
  const research = await page.evaluate(
    () =>
      JSON.parse(localStorage.getItem("research-agent.preferences.v1") ?? "{}")
        .state.research,
  );
  expect(research).toEqual({ maxPapers: 9, sources: ["pubmed"] });
  expect(media).toEqual([]);
  expect(errors).toEqual([]);
});
