import {
  act,
  cleanup,
  createEvent,
  fireEvent,
  render,
  screen,
} from "@testing-library/react";
import { userEvent } from "@testing-library/user-event";
import { useRef } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  ReportNavigationProvider,
  useReportNavigation,
} from "@/features/report/report-navigation";
import { resetUiStore, useUiStore } from "@/stores/ui-store";
import { useReportAnchorScroll } from "./use-report-anchor-scroll";

const animation = vi.hoisted(() => ({
  fail: false,
  calls: [] as {
    region: HTMLElement;
    start: number;
    vars: {
      scrollTo: { y: number; autoKill: boolean; onAutoKill: () => void };
      duration: number;
      ease: (progress: number) => number;
      onComplete: () => void;
    };
    kill: ReturnType<typeof vi.fn>;
  }[],
}));
vi.mock("gsap/ScrollToPlugin", () => ({ ScrollToPlugin: {} }));
vi.mock("gsap", () => ({
  gsap: {
    registerPlugin: vi.fn(),
    to: (
      region: HTMLElement,
      vars: (typeof animation.calls)[number]["vars"],
    ) => {
      if (animation.fail) throw new Error("Animation unavailable");
      const kill = vi.fn();
      animation.calls.push({ region, start: region.scrollTop, vars, kill });
      return { kill };
    },
  },
}));
const headings = [
  { id: "overview", text: "Overview", level: 1 },
  { id: "findings", text: "Findings", level: 2 },
  { id: "last", text: "Last", level: 2 },
  { id: "missing", text: "Missing", level: 2 },
];
function Harness() {
  const navRef = useRef<HTMLElement>(null);
  const navigate = useReportAnchorScroll(navRef, headings);
  const navigation = useReportNavigation();
  return (
    <div data-report>
      <nav ref={navRef}>
        {headings.map((heading) => (
          <a
            key={heading.id}
            href={`#${heading.id}`}
            onClick={(event) => navigate(event, heading.id)}
          >
            {heading.text}
          </a>
        ))}
      </nav>
      <button onClick={() => navigation?.setActiveTab("papers")}>Papers</button>
      <button onClick={() => navigation?.setActiveTab("report")}>Report</button>
      <div data-report-scroll-region data-testid="region">
        <div className="report-document">
          {headings.slice(0, 3).map((heading) => (
            <h2
              key={heading.id}
              id={heading.id}
              style={{ scrollMarginBlockStart: 16 }}
            >
              {heading.text}
            </h2>
          ))}
        </div>
      </div>
    </div>
  );
}
let media: EventTarget & { matches: boolean };
let hidden: boolean;
let observers: { notify: () => void; disconnect: ReturnType<typeof vi.fn> }[];
beforeEach(() => {
  resetUiStore();
  animation.calls = [];
  animation.fail = false;
  hidden = false;
  media = Object.assign(new EventTarget(), { matches: false });
  vi.stubGlobal("matchMedia", () => media);
  vi.spyOn(document, "hidden", "get").mockImplementation(() => hidden);
  observers = [];
  vi.stubGlobal(
    "ResizeObserver",
    class {
      disconnect = vi.fn();
      observe = vi.fn();
      constructor(callback: ResizeObserverCallback) {
        observers.push({
          notify: () => callback([], this as unknown as ResizeObserver),
          disconnect: this.disconnect,
        });
      }
    },
  );
  history.replaceState({ retained: "Next state" }, "", "/research/task");
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});
function setup() {
  const view = render(
    <ReportNavigationProvider>
      <Harness />
    </ReportNavigationProvider>,
  );
  const region = screen.getByTestId("region");
  const body = region.querySelector<HTMLElement>(".report-document")!;
  let width = 800;
  let scrollTop = 0;
  const rect = (top: number, height: number) => ({
    top,
    left: 0,
    right: width,
    bottom: top + height,
    width,
    height,
    x: 0,
    y: top,
    toJSON: () => ({}),
  });
  Object.defineProperties(region, {
    scrollHeight: { configurable: true, value: 1800 },
    clientHeight: { configurable: true, value: 600 },
    scrollTop: {
      configurable: true,
      get: () => scrollTop,
      set: (value: number) => {
        scrollTop = Math.max(0, Math.min(1200, value));
      },
    },
  });
  vi.spyOn(region, "getBoundingClientRect").mockImplementation(() =>
    rect(76, 600),
  );
  vi.spyOn(body, "getBoundingClientRect").mockImplementation(() =>
    rect(76 - scrollTop, 1800),
  );
  const positions = [10, 800, 1750];
  headings.slice(0, 3).forEach((heading, index) => {
    vi.spyOn(
      document.getElementById(heading.id)!,
      "getBoundingClientRect",
    ).mockImplementation(() => rect(76 + positions[index] - scrollTop, 30));
  });
  return {
    ...view,
    region,
    resize: () => {
      width = 790;
      observers.at(-1)?.notify();
    },
  };
}
function click(name = "Findings", options = {}) {
  const link = screen.getByRole("link", { name });
  const event = createEvent.click(link, { button: 0, ...options });
  let intercepted = false;
  // Stop jsdom's native navigation after inspecting the React handler's decision.
  window.addEventListener(
    "click",
    (nativeEvent) => {
      intercepted = nativeEvent.defaultPrevented;
      nativeEvent.preventDefault();
    },
    { once: true },
  );
  fireEvent(link, event);
  return intercepted;
}
function frame(progress: number, index = animation.calls.length - 1) {
  act(() => {
    const call = animation.calls[index];
    call.region.scrollTop =
      call.start +
      (call.vars.scrollTo.y - call.start) * call.vars.ease(progress);
    if (progress === 1) call.vars.onComplete();
  });
}

describe("report anchor scroll", () => {
  it("scrolls through intermediate spring frames, then lands with focus and the native hash", async () => {
    const { region } = setup();
    region.scrollTop = 100;
    region.scrollLeft = 35;
    const historyPush = vi.spyOn(history, "pushState");
    const focus = vi.spyOn(document.getElementById("findings")!, "focus");
    screen.getByRole("link", { name: "Findings" }).focus();
    await userEvent.setup().keyboard("{Enter}");
    const call = animation.calls[0];
    expect(call.vars.duration).toBe(1);
    expect(call.vars.scrollTo.y).toBe(784);
    expect(region.scrollTop).toBe(100);
    frame(0.2);
    expect(region.scrollTop).toBeGreaterThan(100);
    expect(region.scrollTop).toBeLessThan(784);
    frame(0.85);
    expect(region.scrollTop).toBeGreaterThan(784);
    frame(1);
    expect(region.scrollTop).toBe(784);
    expect(region.scrollLeft).toBe(35);
    expect(document.activeElement).toBe(document.getElementById("findings"));
    expect(focus).toHaveBeenCalledWith({ preventScroll: true });
    expect(location.hash).toBe("#findings");
    expect(history.state).toEqual({ retained: "Next state" });
    click();
    expect(historyPush).toHaveBeenCalledTimes(1);
  });

  it("clamps destinations at both ends of the report", () => {
    const { region } = setup();
    region.scrollTop = 400;
    click("Overview");
    expect(animation.calls.at(-1)?.vars.scrollTo.y).toBe(0);
    frame(1);
    expect(region.scrollTop).toBe(0);
    click("Last");
    expect(animation.calls.at(-1)?.vars.scrollTo.y).toBe(1200);
    frame(1);
    expect(region.scrollTop).toBe(1200);
  });

  it("retargets from the current frame and lets manual input stop without a late completion", () => {
    const { region } = setup();
    click();
    frame(0.2);
    const current = region.scrollTop;
    click("Last");
    expect(animation.calls[0].kill).toHaveBeenCalled();
    expect(animation.calls[1].start).toBe(current);
    animation.calls[0].vars.onComplete();
    expect(region.scrollTop).toBe(current);
    fireEvent.wheel(region);
    expect(animation.calls[1].kill).toHaveBeenCalled();
    animation.calls[1].vars.onComplete();
    expect(region.scrollTop).toBe(current);
    expect(document.activeElement).not.toBe(document.getElementById("last"));
    click();
    fireEvent.pointerDown(region);
    expect(animation.calls.at(-1)?.kill).toHaveBeenCalled();
    click();
    fireEvent.keyDown(window, { key: "PageDown" });
    expect(animation.calls.at(-1)?.kill).toHaveBeenCalled();
  });

  it("lands immediately for reduced motion and settles preference/background changes without background focus", () => {
    const { region } = setup();
    media.matches = true;
    click();
    expect(animation.calls).toHaveLength(0);
    expect(region.scrollTop).toBe(784);
    media.matches = false;
    region.scrollTop = 0;
    click();
    media.matches = true;
    act(() => media.dispatchEvent(new Event("change")));
    expect(region.scrollTop).toBe(784);
    expect(animation.calls[0].kill).toHaveBeenCalled();
    media.matches = false;
    region.scrollTop = 0;
    const focus = vi.spyOn(document.getElementById("last")!, "focus");
    click("Last");
    hidden = true;
    act(() => document.dispatchEvent(new Event("visibilitychange")));
    expect(region.scrollTop).toBe(1200);
    expect(focus).not.toHaveBeenCalled();
  });

  it("cancels on layout, tabs, Zen and unmount, releasing listeners and observers", () => {
    const { region, resize, unmount } = setup();
    click();
    observers[0].notify(); // The observer's initial delivery must not interrupt.
    expect(animation.calls[0].kill).not.toHaveBeenCalled();
    resize();
    expect(animation.calls[0].kill).toHaveBeenCalled();
    expect(observers[0].disconnect).toHaveBeenCalled();
    click();
    fireEvent.click(screen.getByRole("button", { name: "Papers" }));
    expect(animation.calls.at(-1)?.kill).toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Report" }));
    click();
    act(() => useUiStore.getState().setZenTaskId("task"));
    expect(animation.calls.at(-1)?.kill).toHaveBeenCalled();
    act(() => useUiStore.getState().setZenTaskId(null));
    click();
    const last = animation.calls.at(-1)!;
    const windowRemove = vi.spyOn(window, "removeEventListener");
    const mediaRemove = vi.spyOn(media, "removeEventListener");
    const previousTop = region.scrollTop;
    unmount();
    expect(last.kill).toHaveBeenCalled();
    expect(observers.at(-1)?.disconnect).toHaveBeenCalled();
    last.vars.onComplete();
    expect(region.scrollTop).toBe(previousTop);
    expect(windowRemove).toHaveBeenCalledWith("wheel", expect.any(Function));
    expect(mediaRemove).toHaveBeenCalledWith("change", expect.any(Function));
  });

  it("preserves native alternate clicks and missing targets, and falls back when GSAP fails", () => {
    const { region } = setup();
    expect(click("Findings", { ctrlKey: true })).toBe(false);
    expect(click("Findings", { metaKey: true })).toBe(false);
    expect(click("Findings", { shiftKey: true })).toBe(false);
    expect(click("Missing")).toBe(false);
    expect(animation.calls).toHaveLength(0);
    expect(location.hash).toBe("");
    animation.fail = true;
    expect(click()).toBe(true);
    expect(region.scrollTop).toBe(784);
    expect(document.activeElement).toBe(document.getElementById("findings"));
  });
});
