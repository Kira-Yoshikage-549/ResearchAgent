import { afterEach, describe, expect, it, vi } from "vitest";
import {
  advanceTitleVertex,
  createWaveTitle,
  type TitleSpringStep,
  type TitleVertex,
} from "./wave-title";

afterEach(() => vi.unstubAllGlobals());

const step: TitleSpringStep = {
  a: 0.99075,
  b: 1.85,
  c: -0.004625,
  d: 0.925,
  directionX: 1,
  directionY: 0,
  forceAt: () => 0,
};
const vertex = (): TitleVertex => ({ u: 24, v: 24, x: 0, y: 0, vx: 0, vy: 0 });

describe("title spring readability and recovery", () => {
  it("releases selection and font listeners and ignores a late font promise after disposal", async () => {
    const host = document.createElement("div");
    const title = document.createElement("h1");
    let resolveFonts!: () => void;
    const fonts = Object.assign(new EventTarget(), {
      ready: new Promise<void>((resolve) => {
        resolveFonts = resolve;
      }),
    });
    const doc = Object.assign(new EventTarget(), { fonts });
    const removeSelection = vi.spyOn(doc, "removeEventListener");
    const removeFonts = vi.spyOn(fonts, "removeEventListener");
    vi.stubGlobal("document", doc);
    const invalidate = vi.fn();
    const renderer = createWaveTitle(host, title, invalidate);
    fonts.dispatchEvent(new Event("loadingdone"));
    expect(invalidate).toHaveBeenCalledWith(true);
    invalidate.mockClear();
    title.dataset.titleRender = "canvas";
    renderer.dispose();
    expect(title).not.toHaveAttribute("data-title-render");
    expect(removeSelection).toHaveBeenCalledWith(
      "selectionchange",
      expect.any(Function),
    );
    expect(removeFonts).toHaveBeenCalledWith(
      "loadingdone",
      expect.any(Function),
    );
    expect(removeFonts).toHaveBeenCalledWith(
      "loadingerror",
      expect.any(Function),
    );
    fonts.dispatchEvent(new Event("loadingdone"));
    fonts.dispatchEvent(new Event("loadingerror"));
    doc.dispatchEvent(new Event("selectionchange"));
    resolveFonts();
    await Promise.resolve();
    expect(invalidate).not.toHaveBeenCalled();
  });
  it("keeps an unforced glyph exactly stationary", () => {
    const point = vertex();
    for (let frame = 0; frame < 180; frame++)
      advanceTitleVertex(point, step, 0);
    expect(point).toEqual(vertex());
  });

  it("caps diagonal displacement at eight pixels even after strong repeated input", () => {
    const point = vertex();
    const diagonal = {
      ...step,
      directionX: Math.SQRT1_2,
      directionY: Math.SQRT1_2,
    };
    for (let frame = 0; frame < 180; frame++) {
      advanceTitleVertex(point, diagonal, 150);
      expect(Math.hypot(point.x, point.y)).toBeLessThanOrEqual(8.00000001);
    }
    expect(Math.hypot(point.x, point.y)).toBeGreaterThan(1);
  });

  it("returns fully to the original glyph after input stops", () => {
    const point = vertex();
    for (let frame = 0; frame < 20; frame++)
      advanceTitleVertex(point, step, 25);
    expect(point.x).toBeGreaterThan(0);
    for (let frame = 0; frame < 600; frame++)
      advanceTitleVertex(point, step, 0);
    expect(point).toEqual(vertex());
  });

  it("handles immediate reversals without invalid coordinates and then settles", () => {
    const point = vertex();
    for (let frame = 0; frame < 100; frame++) {
      advanceTitleVertex(
        point,
        { ...step, directionX: frame % 2 ? -1 : 1 },
        200,
      );
      expect(
        [point.x, point.y, point.vx, point.vy].every(Number.isFinite),
      ).toBe(true);
      expect(Math.abs(point.x)).toBeLessThanOrEqual(8);
    }
    for (let frame = 0; frame < 600; frame++)
      advanceTitleVertex(point, step, 0);
    expect(point).toEqual(vertex());
  });
});
