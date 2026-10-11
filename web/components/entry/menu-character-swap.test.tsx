import { act, cleanup, fireEvent, render } from "@testing-library/react";
import { StrictMode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  MenuCharacterSwap,
  characterSwapDelay,
  nextCharacterSwaps,
  segmentMenuCharacters,
} from "./menu-character-swap";

describe("menu title character selection", () => {
  it("keeps Chinese and compound graphemes intact, with native UTF-16 offsets", () => {
    expect(
      segmentMenuCharacters("选择下一步", "zh-CN").map((c) => c.text),
    ).toEqual(["选", "择", "下", "一", "步"]);
    expect(segmentMenuCharacters("Choose your next step", "en")).toHaveLength(
      18,
    );
    expect(segmentMenuCharacters("e\u0301 👩‍💻 x", "en")).toEqual([
      { text: "e\u0301", offset: 0 },
      { text: "👩‍💻", offset: 3 },
      { text: "x", offset: 9 },
    ]);
  });
  it("chooses every eligible position uniformly without repeating the previous one", () => {
    for (let previous = 0; previous < 5; previous++) {
      const positions = new Set<number>();
      for (let candidate = 0; candidate < 4; candidate++) {
        const random = vi
          .fn()
          .mockReturnValueOnce(0)
          .mockReturnValueOnce(candidate / 4)
          .mockReturnValueOnce(0);
        const [choice] = nextCharacterSwaps(5, [previous], random);
        expect(choice.index).not.toBe(previous);
        expect(choice.direction).toBe("up");
        positions.add(choice.index);
      }
      expect(positions.size).toBe(4);
    }
    expect(nextCharacterSwaps(1, [0], () => 0.99)).toEqual([
      {
        index: 0,
        direction: "down",
      },
    ]);
    expect(nextCharacterSwaps(5, [], () => 0.5)[0].direction).toBe("down");
    expect(nextCharacterSwaps(5, [], () => 0.499)[0].direction).toBe("up");
  });
  it("chooses one to four distinct positions with independent directions", () => {
    for (let amount = 1; amount <= 4; amount++) {
      const random = vi
        .fn()
        .mockReturnValue(0.5)
        .mockReturnValueOnce((amount - 1) / 4);
      const swaps = nextCharacterSwaps(18, [0, 1, 2, 3], random);
      expect(swaps).toHaveLength(amount);
      expect(new Set(swaps.map((swap) => swap.index)).size).toBe(amount);
      expect(swaps.every((swap) => swap.index > 3)).toBe(true);
    }
    const random = vi
      .fn()
      .mockReturnValueOnce(0.25)
      .mockReturnValueOnce(0)
      .mockReturnValueOnce(0)
      .mockReturnValueOnce(0)
      .mockReturnValueOnce(0.99);
    expect(
      nextCharacterSwaps(5, [], random).map((swap) => swap.direction),
    ).toEqual(["up", "down"]);
    const chinese = nextCharacterSwaps(5, [0, 1, 2, 3], () => 0.99);
    expect(chinese).toHaveLength(4);
    expect(new Set(chinese.map((swap) => swap.index)).size).toBe(4);
    expect(chinese.some((swap) => swap.index === 4)).toBe(true);
    expect(nextCharacterSwaps(0, [])).toEqual([]);
  });
  it("waits between two and five seconds", () => {
    expect(characterSwapDelay(() => 0)).toBe(2000);
    expect(characterSwapDelay(() => 0.5)).toBe(3500);
    expect(characterSwapDelay(() => 1)).toBe(5000);
  });
});

let intersection: IntersectionObserverCallback;
let resized: ResizeObserverCallback;
let frames: Map<number, FrameRequestCallback>;
let frameId: number;
let preference: EventTarget & { matches: boolean };
let observers: { disconnect: ReturnType<typeof vi.fn> }[];
let highlights: Map<string, Set<Range>>;
let fonts: EventTarget;
let originalFonts: PropertyDescriptor | undefined;

beforeEach(() => {
  vi.useFakeTimers();
  vi.spyOn(Math, "random").mockReturnValue(0.5);
  frames = new Map();
  frameId = 0;
  observers = [];
  highlights = new Map();
  originalFonts = Object.getOwnPropertyDescriptor(document, "fonts");
  fonts = new EventTarget();
  Object.defineProperty(document, "fonts", {
    configurable: true,
    value: Object.assign(fonts, { ready: Promise.resolve() }),
  });
  vi.stubGlobal("Highlight", Set);
  vi.stubGlobal("CSS", { highlights });
  vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => {
    frames.set(++frameId, callback);
    return frameId;
  });
  vi.stubGlobal("cancelAnimationFrame", (id: number) => frames.delete(id));
  vi.stubGlobal(
    "IntersectionObserver",
    class {
      disconnect = vi.fn();
      constructor(callback: IntersectionObserverCallback) {
        intersection = callback;
        observers.push(this);
      }
      observe() {}
    },
  );
  vi.stubGlobal(
    "ResizeObserver",
    class {
      disconnect = vi.fn();
      constructor(callback: ResizeObserverCallback) {
        resized = callback;
        observers.push(this);
      }
      observe() {}
    },
  );
  preference = Object.assign(new EventTarget(), { matches: false });
  vi.stubGlobal("matchMedia", () => preference);
  vi.spyOn(document, "hidden", "get").mockReturnValue(false);
  vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockReturnValue(
    new DOMRect(48, 140, 1100, 96),
  );
  Object.defineProperty(HTMLElement.prototype, "getAnimations", {
    configurable: true,
    value: vi.fn(() => []),
  });
  Object.defineProperty(Range.prototype, "getBoundingClientRect", {
    configurable: true,
    value() {
      return new DOMRect(48 + this.startOffset * 40, 130, 40, 116);
    },
  });
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  delete (Range.prototype as Partial<Range>).getBoundingClientRect;
  delete (HTMLElement.prototype as Partial<HTMLElement>).getAnimations;
  if (originalFonts) Object.defineProperty(document, "fonts", originalFonts);
  else Reflect.deleteProperty(document, "fonts");
});

const tree = (props: Partial<Parameters<typeof MenuCharacterSwap>[0]> = {}) => (
  <StrictMode>
    <h2 aria-label={props.text ?? "Choose your next step"}>
      <MenuCharacterSwap
        text="Choose your next step"
        locale="en"
        enabled
        {...props}
      />
    </h2>
  </StrictMode>
);
async function measured() {
  await act(async () => {});
  act(() => {
    const callbacks = [...frames.values()];
    frames.clear();
    callbacks.forEach((callback) => callback(16));
    intersection(
      [
        {
          isIntersecting: true,
          intersectionRatio: 1,
        } as IntersectionObserverEntry,
      ],
      {} as IntersectionObserver,
    );
  });
}
const advance = (time: number) => act(() => vi.advanceTimersByTime(time));
const host = (container: HTMLElement) =>
  container.querySelector("[data-menu-character-swap]")!;

function deferredAnimation() {
  let finish!: () => void;
  let cancel!: () => void;
  const finished = new Promise<void>((resolve, reject) => {
    finish = resolve;
    cancel = () => reject(new Error("Transition canceled"));
  });
  return {
    finish,
    cancel,
    animation: { playState: "running", finished } as unknown as Animation,
  };
}
function entranceTree(claimEntranceSwap: () => boolean) {
  return (
    <section data-entry-menu>
      <button data-entry-action>Menu action</button>
      {tree({ claimEntranceSwap })}
    </section>
  );
}

it("plays the first entrance immediately after every button animation finishes, then waits normally", async () => {
  const translation = deferredAnimation();
  const cover = deferredAnimation();
  vi.mocked(HTMLElement.prototype.getAnimations).mockReturnValue([
    translation.animation,
    cover.animation,
  ]);
  const claim = vi.fn().mockReturnValueOnce(true).mockReturnValue(false);
  const view = render(entranceTree(claim));
  await measured();
  expect(claim).toHaveBeenCalledTimes(1);
  act(() => resized([], {} as ResizeObserver));
  expect(highlights.size).toBe(0);
  expect(vi.getTimerCount()).toBe(0);
  await act(async () => translation.finish());
  expect(highlights.size).toBe(0);
  await act(async () => cover.finish());
  expect(host(view.container)).toHaveAttribute("data-swap-count", "3");
  view.container
    .querySelectorAll("[data-swap-direction]")
    .forEach((element) => {
      fireEvent.animationEnd(element.firstElementChild!);
    });
  advance(3499);
  expect(highlights.size).toBe(0);
  advance(1);
  expect(host(view.container)).toHaveAttribute("data-swap-count", "3");
  expect(vi.getTimerCount()).toBe(1);
});

it("discards a pending first entrance in the background and resumes with a full wait", async () => {
  const reveal = deferredAnimation();
  vi.mocked(HTMLElement.prototype.getAnimations).mockReturnValue([
    reveal.animation,
  ]);
  const view = render(entranceTree(() => true));
  await measured();
  const hidden = vi.spyOn(document, "hidden", "get").mockReturnValue(true);
  fireEvent(document, new Event("visibilitychange"));
  await act(async () => reveal.finish());
  expect(highlights.size).toBe(0);
  hidden.mockReturnValue(false);
  fireEvent(document, new Event("visibilitychange"));
  advance(3499);
  expect(highlights.size).toBe(0);
  advance(1);
  expect(host(view.container)).toHaveAttribute("data-swap-count", "3");
});

it("cancels the first entrance on unmount and handles canceled button transitions", async () => {
  const reveal = deferredAnimation();
  vi.mocked(HTMLElement.prototype.getAnimations).mockReturnValue([
    reveal.animation,
  ]);
  const view = render(entranceTree(() => true));
  await measured();
  view.unmount();
  await act(async () => reveal.finish());
  expect(highlights.size).toBe(0);
  expect(vi.getTimerCount()).toBe(0);

  const canceled = deferredAnimation();
  vi.mocked(HTMLElement.prototype.getAnimations).mockReturnValue([
    canceled.animation,
  ]);
  const retry = render(entranceTree(() => true));
  await measured();
  await act(async () => canceled.cancel());
  expect(highlights.size).toBe(0);
  advance(3499);
  expect(highlights.size).toBe(0);
  advance(1);
  expect(host(retry.container)).toHaveAttribute("data-swap-count", "3");
});

it("skips the entrance for reduced motion and keeps a normal wait after restoring motion", async () => {
  preference.matches = true;
  const view = render(entranceTree(() => true));
  await measured();
  expect(highlights.size).toBe(0);
  act(() => {
    preference.matches = false;
    preference.dispatchEvent(new Event("change"));
  });
  await act(async () => {});
  expect(highlights.size).toBe(0);
  advance(3499);
  expect(highlights.size).toBe(0);
  advance(1);
  expect(host(view.container)).toHaveAttribute("data-swap-count", "3");
});

it("starts one simultaneous batch after the first wait and schedules start-to-start", async () => {
  const view = render(tree());
  await measured();
  expect(view.getByRole("heading")).toHaveTextContent("Choose your next step");
  advance(3499);
  expect(host(view.container)).not.toHaveAttribute("data-swap-count");
  advance(1);
  expect(host(view.container)).toHaveAttribute("data-swap-count", "3");
  const moving = Array.from(
    view.container.querySelectorAll("[data-swap-direction]"),
  );
  const first = moving.map((element) =>
    element.getAttribute("data-swap-index"),
  );
  expect(first).toHaveLength(3);
  expect(new Set(first).size).toBe(3);
  expect(highlights.get("menu-character-swap")?.size).toBe(3);
  expect(highlights.get("menu-character-copy")?.size).toBe(6);
  fireEvent.animationEnd(moving[0].firstElementChild!);
  expect(highlights.get("menu-character-swap")?.size).toBe(2);
  moving
    .slice(1)
    .forEach((element) => fireEvent.animationEnd(element.firstElementChild!));
  expect(highlights.size).toBe(0);
  advance(3499);
  expect(host(view.container)).not.toHaveAttribute("data-swap-count");
  advance(1);
  const second = Array.from(
    view.container.querySelectorAll("[data-swap-direction]"),
  ).map((element) => element.getAttribute("data-swap-index"));
  expect(second.every((index) => !first.includes(index))).toBe(true);
  expect(host(view.container)).toHaveAttribute("data-swap-count", "3");
  expect(vi.getTimerCount()).toBe(1);
});

it("cancels movement in background and resumes with a fresh full wait", async () => {
  const hidden = vi.spyOn(document, "hidden", "get");
  const view = render(tree());
  await measured();
  advance(3500);
  hidden.mockReturnValue(true);
  fireEvent(document, new Event("visibilitychange"));
  expect(highlights.size).toBe(0);
  expect(vi.getTimerCount()).toBe(0);
  advance(20_000);
  hidden.mockReturnValue(false);
  fireEvent(document, new Event("visibilitychange"));
  advance(3499);
  expect(host(view.container)).not.toHaveAttribute("data-swap-count");
  advance(1);
  expect(host(view.container)).toHaveAttribute("data-swap-count");
});

it("pauses offscreen, behind dialogs, for transitions and reduced motion", async () => {
  const view = render(tree());
  await measured();
  advance(3500);
  act(() =>
    intersection(
      [
        {
          isIntersecting: true,
          intersectionRatio: 0.99,
        } as IntersectionObserverEntry,
      ],
      {} as IntersectionObserver,
    ),
  );
  expect(highlights.size).toBe(0);
  expect(vi.getTimerCount()).toBe(0);
  await measured();
  view.container.setAttribute("aria-hidden", "true");
  await act(async () => {});
  expect(vi.getTimerCount()).toBe(0);
  view.container.removeAttribute("aria-hidden");
  await act(async () => {});
  expect(vi.getTimerCount()).toBe(1);
  view.rerender(tree({ enabled: false }));
  expect(vi.getTimerCount()).toBe(0);
  view.rerender(tree());
  await measured();
  act(() => {
    preference.matches = true;
    preference.dispatchEvent(new Event("change"));
  });
  expect(vi.getTimerCount()).toBe(0);
  act(() => {
    preference.matches = false;
    preference.dispatchEvent(new Event("change"));
  });
  advance(3499);
  expect(highlights.size).toBe(0);
  advance(1);
  expect(highlights.get("menu-character-swap")?.size).toBe(3);
});

it("remeasures on resize, clears the old language, and cleans all resources on unmount", async () => {
  const view = render(tree());
  await measured();
  advance(3500);
  vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockReturnValue(
    new DOMRect(48, 140, 1000, 96),
  );
  act(() => resized([], {} as ResizeObserver));
  expect(highlights.size).toBe(0);
  await measured();
  advance(3499);
  expect(highlights.size).toBe(0);
  view.rerender(tree({ text: "选择下一步", locale: "zh-CN" }));
  await measured();
  expect(view.getByRole("heading")).toHaveTextContent("选择下一步");
  advance(3500);
  expect(highlights.get("menu-character-swap")?.size).toBe(3);
  view.unmount();
  expect(highlights.size).toBe(0);
  expect(frames.size).toBe(0);
  expect(vi.getTimerCount()).toBe(0);
  expect(
    observers.every((observer) => observer.disconnect.mock.calls.length === 1),
  ).toBe(true);
  fireEvent(document, new Event("visibilitychange"));
  preference.dispatchEvent(new Event("change"));
  fonts.dispatchEvent(new Event("loadingdone"));
  expect(vi.getTimerCount()).toBe(0);
  expect(frames.size).toBe(0);
});

it("waits for font loading and remeasures before restarting playback", async () => {
  const view = render(tree());
  await measured();
  advance(3500);
  act(() => fonts.dispatchEvent(new Event("loading")));
  expect(highlights.size).toBe(0);
  expect(vi.getTimerCount()).toBe(0);
  act(() => fonts.dispatchEvent(new Event("loadingdone")));
  await measured();
  advance(3499);
  expect(host(view.container)).not.toHaveAttribute("data-swap-count");
  advance(1);
  expect(host(view.container)).toHaveAttribute("data-swap-count");
});

it("leaves native static text when segmentation or measurement is unavailable", async () => {
  vi.stubGlobal("Intl", { ...Intl, Segmenter: undefined });
  const view = render(tree());
  await measured();
  advance(20_000);
  expect(view.getByRole("heading").textContent).toBe("Choose your next step");
  expect(host(view.container)).not.toHaveAttribute("data-swap-ready");
  expect(vi.getTimerCount()).toBe(0);
});

it("falls back to the complete native title when Range measurement fails", async () => {
  vi.spyOn(Range.prototype, "getBoundingClientRect").mockReturnValue(
    new DOMRect(),
  );
  const view = render(tree());
  await measured();
  advance(20_000);
  expect(view.getByRole("heading").textContent).toBe("Choose your next step");
  expect(host(view.container)).not.toHaveAttribute("data-swap-ready");
  expect(vi.getTimerCount()).toBe(0);
});
