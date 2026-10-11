import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import reference from "./wave-reference.fixture.json";

type Intro = {
  complete: () => void;
  reveal: () => void;
  fromTo: ReturnType<typeof vi.fn>;
  call: ReturnType<typeof vi.fn>;
  time: ReturnType<typeof vi.fn>;
  kill: ReturnType<typeof vi.fn>;
  targets: { progress: number }[];
};
const { intros, timeline, ticker } = vi.hoisted(() => ({
  intros: [] as Intro[],
  timeline: vi.fn(),
  ticker: { add: vi.fn(), fps: vi.fn(), lagSmoothing: vi.fn() },
}));
vi.mock("gsap", () => ({ gsap: { timeline, ticker } }));
import { mountWelcomeWaves } from "./wave-field";

describe("Canvas wave geometry, timing and lifecycle", () => {
  let reduced: boolean;
  let clock: number;
  let frameId: number;
  let frames: Map<number, FrameRequestCallback>;
  let motionListeners: Set<() => void>;
  let resolutionListeners: Set<() => void>;
  let visibility: IntersectionObserverCallback;
  let fields: ReturnType<typeof mountWelcomeWaves>[];
  const resizeDisconnect = vi.fn();
  const intersectionDisconnect = vi.fn();

  beforeEach(() => {
    reduced = false;
    clock = 0;
    frameId = 0;
    frames = new Map();
    fields = [];
    intros.length = 0;
    motionListeners = new Set();
    resolutionListeners = new Set();
    vi.clearAllMocks();
    vi.spyOn(Math, "random").mockReturnValue(reference.seed);
    vi.spyOn(performance, "now").mockImplementation(() => clock);
    vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => {
      frames.set(++frameId, callback);
      return frameId;
    });
    vi.stubGlobal("cancelAnimationFrame", (id: number) => frames.delete(id));
    vi.stubGlobal("devicePixelRatio", 1);
    vi.stubGlobal("matchMedia", (query: string) => {
      const listeners = query.includes("reduced-motion")
        ? motionListeners
        : resolutionListeners;
      return {
        get matches() {
          return query.includes("reduced-motion") && reduced;
        },
        addEventListener: (_: string, callback: () => void) =>
          listeners.add(callback),
        removeEventListener: (_: string, callback: () => void) =>
          listeners.delete(callback),
      };
    });
    vi.stubGlobal(
      "ResizeObserver",
      class {
        observe() {}
        disconnect = resizeDisconnect;
      },
    );
    vi.stubGlobal(
      "IntersectionObserver",
      class {
        constructor(callback: IntersectionObserverCallback) {
          visibility = callback;
        }
        observe() {}
        disconnect = intersectionDisconnect;
      },
    );
    timeline.mockImplementation(
      (options: { paused: boolean; onComplete: () => void }) => {
        const intro: Intro = {
          targets: [],
          complete: options.onComplete,
          reveal: () => {},
          fromTo: vi.fn((targets) => {
            intro.targets = targets;
            return intro;
          }),
          call: vi.fn((callback) => {
            intro.reveal = callback;
            return intro;
          }),
          time: vi.fn((seconds: number) => {
            intro.targets.forEach((target) => {
              target.progress = Math.max(0, Math.min(1, (seconds - 0.5) / 3));
            });
            if (seconds >= 3) intro.reveal();
            if (seconds >= 4) intro.complete();
            return intro;
          }),
          kill: vi.fn(),
        };
        intros.push(intro);
        return intro;
      },
    );
  });
  afterEach(() => {
    fields.forEach((field) => field.dispose());
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  function advance(time: number) {
    clock = time;
    const callbacks = [...frames.values()];
    frames.clear();
    callbacks.forEach((callback) => callback(time));
  }
  function pointer(
    target: HTMLElement,
    x: number,
    y: number,
    pointerType = "mouse",
  ) {
    const event = new Event("pointermove", { bubbles: true });
    Object.assign(event, { clientX: x, clientY: y, pointerType });
    target.dispatchEvent(event);
  }
  function mount(target?: HTMLElement, finish = true, available = true) {
    const host = document.createElement("div");
    const canvas = document.createElement("canvas");
    host.append(canvas);
    let paths: number[][][] = [];
    const context = {
      clearRect: vi.fn(() => {
        paths = [];
      }),
      beginPath: vi.fn(),
      moveTo: vi.fn((x: number, y: number) => paths.push([[x, y]])),
      lineTo: vi.fn((x: number, y: number) => paths.at(-1)!.push([x, y])),
      stroke: vi.fn(),
      setTransform: vi.fn(),
      strokeStyle: "",
      lineWidth: 0,
      lineCap: "",
      lineJoin: "",
      miterLimit: 0,
    };
    vi.spyOn(canvas, "getContext").mockReturnValue(
      available ? (context as unknown as CanvasRenderingContext2D) : null,
    );
    const bounds = vi
      .spyOn(host, "getBoundingClientRect")
      .mockReturnValue(new DOMRect(0, 0, 400, 184));
    const index = intros.length;
    const field = mountWelcomeWaves(host, canvas, target);
    fields.push(field);
    const intro = intros[index];
    if (finish && intro) {
      intro.complete();
      advance(clock);
    }
    return {
      host,
      canvas,
      context,
      bounds,
      field,
      intro,
      x: () => parseFloat(host.style.getPropertyValue("--x")),
      y: () => parseFloat(host.style.getPropertyValue("--y")),
      paths: () => paths,
      curves: () =>
        paths.map((path) =>
          path.map(([x, y], i) => `${i ? "L " : "M "}${x} ${y}`).join(""),
        ),
    };
  }

  it("retains original seeded noise endpoints and independent polyline topology", () => {
    const field = mount();
    for (const [x, y] of reference.pointer) pointer(field.host, x, y);
    for (const sample of reference.samples) {
      advance(sample.time);
      expect(field.paths()).toHaveLength(61);
      expect(field.paths()[0]).toHaveLength(9);
      for (const { index, d } of sample.paths) {
        const endpoints = (curve: string) => [
          curve.match(/^M [^L]+/)![0],
          curve.match(/L[^L]+$/)![0],
        ];
        expect(endpoints(field.curves()[index])).toEqual(endpoints(d));
      }
    }
    expect(field.context.strokeStyle).toBe("#AAA9A3");
    expect(field.context.lineWidth).toBe(1);
    expect(field.context.lineJoin).toBe("miter");
    expect(field.context.miterLimit).toBe(4);
  });

  it("draws the complete field once on every callback without a frame-rate gate", () => {
    const field = mount();
    const cursor = vi.spyOn(field.host.style, "setProperty");
    field.context.stroke.mockClear();
    field.context.clearRect.mockClear();
    field.context.moveTo.mockClear();
    for (let i = 1; i <= 300; i++) advance((i * 1000) / 300);
    expect(field.context.stroke).toHaveBeenCalledTimes(300 * 8);
    expect(field.context.clearRect).toHaveBeenCalledTimes(300);
    expect(field.context.moveTo).toHaveBeenCalledTimes(300 * 61);
    expect(cursor.mock.calls.filter(([name]) => name === "--x")).toHaveLength(
      300,
    );
    expect(frames.size).toBe(1);
    expect(ticker.add).not.toHaveBeenCalled();
    expect(ticker.fps).not.toHaveBeenCalled();
    expect(ticker.lagSmoothing).not.toHaveBeenCalled();
  });

  it("keeps canvas resolution and maps pointer coordinates through scrolling parallax", () => {
    const field = mount();
    vi.spyOn(field.host, "offsetWidth", "get").mockReturnValue(400);
    vi.spyOn(field.host, "offsetHeight", "get").mockReturnValue(184);
    field.bounds.mockReturnValue(new DOMRect(0, -48, 400, 184));
    window.dispatchEvent(new Event("resize"));
    expect(field.canvas.width).toBe(400);
    expect(field.canvas.height).toBe(184);
    pointer(field.host, 100, 22);
    expect(field.x()).toBe(100);
    expect(field.y()).toBe(70);
    field.bounds.mockReturnValue(new DOMRect(0, 0, 400, 0));
    pointer(field.host, 100, 0);
    expect(field.host.dataset.pointer).toBe("hidden");
    visibility(
      [
        {
          isIntersecting: true,
          intersectionRatio: 0,
        } as IntersectionObserverEntry,
      ],
      {} as IntersectionObserver,
    );
    expect(frames.size).toBe(0);
  });

  it("follows progressively, with exactly consistent easing across refresh rates", () => {
    function follow(hz: number) {
      clock = 0;
      const field = mount();
      pointer(field.host, 100, 70);
      pointer(field.host, 350, 110);
      advance(1000 / hz);
      expect(field.x()).toBeGreaterThan(100);
      expect(field.x()).toBeLessThan(350);
      for (let i = 2; i <= hz / 2; i++) advance((i * 1000) / hz);
      const x = field.x();
      field.field.dispose();
      return x;
    }
    const at60 = follow(60);
    expect(follow(120)).toBeCloseTo(at60, 10);
    expect(follow(240)).toBeCloseTo(at60, 10);
  });

  it("centers force on the eased dot rather than the distant pointer", () => {
    const idle = mount();
    const field = mount();
    pointer(field.host, 100, 70);
    pointer(field.host, 350, 110);
    advance(1000 / 60);
    expect(field.x()).toBeCloseTo(125, 10);
    expect(field.y()).toBeCloseTo(74, 10);
    expect(field.curves()[22]).not.toBe(idle.curves()[22]);
    expect(field.curves()[45]).toBe(idle.curves()[45]);
  });

  it("keeps free spring return consistent at 60Hz, 120Hz and 165Hz", () => {
    function returned(hz: number) {
      clock = 0;
      const field = mount();
      pointer(field.host, 100, 70);
      pointer(field.host, 170, 110);
      advance(1000 / 60);
      field.host.dispatchEvent(new Event("pointerleave"));
      for (let i = 1; i <= hz; i++) advance(1000 / 60 + (i * 1000) / hz);
      const paths = field.curves();
      field.field.dispose();
      return paths;
    }
    const at60 = returned(60);
    expect(returned(120)).toEqual(at60);
    expect(returned(165)).toEqual(at60);
  });

  it("disturbs above foreground controls, handles rapid reversals and settles", () => {
    const idle = mount();
    const target = document.createElement("main");
    const button = document.createElement("button");
    target.append(button);
    const field = mount(target);
    pointer(button, 100, 70);
    for (let i = 1; i <= 60; i++) {
      pointer(button, i % 2 ? 20 : 380, i % 3 ? 20 : 164);
      advance((i * 1000) / 165);
      expect(field.curves().join()).not.toMatch(/NaN|Infinity/);
    }
    expect(field.curves()).not.toEqual(idle.curves());
    target.dispatchEvent(new Event("pointerleave"));
    for (let i = 61; i <= 1380; i++) advance((i * 1000) / 165);
    expect(field.curves()).toEqual(idle.curves());
  });

  it("caps elapsed simulation after a long frame without catch-up drawings", () => {
    const field = mount();
    pointer(field.host, 100, 70);
    pointer(field.host, 350, 110);
    field.context.stroke.mockClear();
    advance(10_000);
    expect(field.x()).toBeCloseTo(100 + 250 * (1 - 0.9 ** 3), 10);
    expect(field.context.stroke).toHaveBeenCalledTimes(8);
    expect(field.curves().join()).not.toMatch(/NaN|Infinity/);
    expect(frames.size).toBe(1);
  });

  it("retains the GSAP edge-stagger entrance without DrawSVG or a second drawing loop", () => {
    const field = mount(undefined, false);
    expect(timeline).toHaveBeenCalledWith({
      paused: true,
      onComplete: expect.any(Function),
    });
    expect(field.intro.fromTo).toHaveBeenCalledWith(
      expect.any(Array),
      { progress: 0 },
      {
        progress: 1,
        duration: 3,
        ease: "expo.out",
        stagger: { amount: 0.5, from: "edges", ease: "power3.inOut" },
      },
      0.5,
    );
    expect(field.intro.call).toHaveBeenCalledWith(
      expect.any(Function),
      [],
      "-=1",
    );
    for (let i = 1; i <= 60; i++) advance((i * 1000) / 60);
    expect(field.host.dataset.intro).toBe("revealing");
    expect(field.paths()).toHaveLength(61);
    expect(field.paths()[0].length).toBeLessThan(9);
    for (let i = 61; i <= 245; i++) advance((i * 1000) / 60);
    expect(field.host.dataset.intro).toBe("complete");
    expect(field.intro.kill).toHaveBeenCalledOnce();
    expect(field.paths()[0]).toHaveLength(9);
  });

  it("renders static full contours for reduced motion and switches preferences live", () => {
    reduced = true;
    const field = mount();
    const still = field.curves();
    expect(field.host.dataset.motion).toBe("still");
    expect(field.host.dataset.intro).toBe("complete");
    expect(intros).toHaveLength(0);
    expect(field.paths()).toHaveLength(61);
    expect(frames.size).toBe(0);
    pointer(field.host, 100, 70);
    expect(field.host.dataset.pointer).toBe("hidden");
    reduced = false;
    motionListeners.forEach((listener) => listener());
    advance(34);
    expect(field.curves()).not.toEqual(still);
    reduced = true;
    motionListeners.forEach((listener) => listener());
    const stopped = field.curves();
    advance(200);
    expect(field.curves()).toEqual(stopped);
    expect(frames.size).toBe(0);
  });

  it("finishes the entrance when reduced motion is enabled midway", () => {
    const field = mount(undefined, false);
    reduced = true;
    motionListeners.forEach((listener) => listener());
    expect(field.intro.kill).toHaveBeenCalledOnce();
    expect(field.host.dataset.intro).toBe("complete");
    expect(field.paths()).toHaveLength(61);
    expect(frames.size).toBe(0);
  });

  it("suspends offscreen and hidden frames, resumes without backlog and releases resources", () => {
    const target = document.createElement("main");
    const remove = vi.spyOn(target, "removeEventListener");
    const field = mount(target, false);
    advance(17);
    visibility(
      [
        {
          isIntersecting: false,
          intersectionRatio: 0,
        } as IntersectionObserverEntry,
      ],
      {} as IntersectionObserver,
    );
    const still = field.curves();
    const introTime = field.intro.time.mock.calls.length;
    advance(2000);
    expect(frames.size).toBe(0);
    expect(field.curves()).toEqual(still);
    expect(field.intro.time).toHaveBeenCalledTimes(introTime);
    visibility(
      [
        {
          isIntersecting: true,
          intersectionRatio: 1,
        } as IntersectionObserverEntry,
      ],
      {} as IntersectionObserver,
    );
    advance(2017);
    expect(field.host.dataset.intro).toBe("revealing");
    expect(frames.size).toBe(1);
    const hidden = vi.spyOn(document, "hidden", "get").mockReturnValue(true);
    document.dispatchEvent(new Event("visibilitychange"));
    expect(frames.size).toBe(0);
    hidden.mockReturnValue(false);
    document.dispatchEvent(new Event("visibilitychange"));
    expect(frames.size).toBe(1);
    field.field.dispose();
    field.field.dispose();
    expect(frames.size).toBe(0);
    expect(field.intro.kill).toHaveBeenCalledOnce();
    expect(motionListeners.size).toBe(0);
    expect(resolutionListeners.size).toBe(0);
    expect(resizeDisconnect).toHaveBeenCalledOnce();
    expect(intersectionDisconnect).toHaveBeenCalledOnce();
    expect(field.canvas.width).toBe(0);
    expect(remove).toHaveBeenCalledWith("pointermove", expect.any(Function));
  });

  it("pauses for a page mask and resumes the same field without restarting the entrance", () => {
    const field = mount(undefined, false);
    advance(17);
    field.field.setSuspended(true);
    const still = field.curves();
    const introTime = field.intro.time.mock.calls.length;
    advance(2000);
    expect(frames.size).toBe(0);
    expect(field.host.dataset.motion).toBe("still");
    expect(field.curves()).toEqual(still);
    expect(field.intro.time).toHaveBeenCalledTimes(introTime);
    field.field.setSuspended(false);
    advance(2017);
    expect(field.host.dataset.motion).toBe("running");
    expect(frames.size).toBe(1);
    expect(intros).toHaveLength(1);
  });

  it("rebuilds after layout resizing and updates capped DPR without restarting motion", () => {
    const field = mount();
    field.bounds.mockReturnValue(new DOMRect(0, 0, 480, 220));
    window.dispatchEvent(new Event("resize"));
    expect(field.paths()).toHaveLength(69);
    expect(intros).toHaveLength(1);
    expect(field.canvas.width).toBe(480);
    vi.stubGlobal("devicePixelRatio", 1.25);
    [...resolutionListeners].forEach((listener) => listener());
    expect(field.canvas.width).toBe(600);
    expect(field.canvas.height).toBe(275);
    vi.stubGlobal("devicePixelRatio", 3);
    [...resolutionListeners].forEach((listener) => listener());
    expect(field.canvas.width).toBe(960);
    expect(field.context.setTransform).toHaveBeenLastCalledWith(
      2,
      0,
      0,
      2,
      0,
      0,
    );
    expect(frames.size).toBe(1);
    expect(resolutionListeners.size).toBe(1);
  });

  it("hides the dot outside the band and for touch", () => {
    const field = mount();
    pointer(field.host, 100, 70);
    expect(field.host.dataset.pointer).toBe("visible");
    pointer(field.host, 100, -1);
    expect(field.host.dataset.pointer).toBe("hidden");
    pointer(field.host, 100, 70, "touch");
    expect(field.host.dataset.pointer).toBe("hidden");
    pointer(field.host, 100, 184);
    expect(field.host.dataset.pointer).toBe("hidden");
  });

  it("keeps foreground usable when Canvas 2D is unavailable", () => {
    const field = mount(undefined, false, false);
    expect(frames.size).toBe(0);
    expect(intros).toHaveLength(0);
    expect(field.host.dataset.motion).toBe("still");
    expect(field.host.dataset.pointer).toBe("hidden");
    expect(() => field.field.dispose()).not.toThrow();
  });
});
