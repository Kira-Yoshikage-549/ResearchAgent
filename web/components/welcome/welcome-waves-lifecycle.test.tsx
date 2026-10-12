import { act, cleanup, fireEvent, render } from "@testing-library/react";
import { StrictMode, useRef } from "react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { EntryTransitionContext } from "@/components/entry/entry-transition-provider";
import { WelcomeWaves } from "./welcome-waves";

const { start, stop, suspend } = vi.hoisted(() => ({
  start: vi.fn(),
  stop: vi.fn(),
  suspend: vi.fn(),
}));
vi.mock("@/features/welcome/wave-element", () => ({
  registerWelcomeWaves: () => {
    if (!customElements.get("a-waves"))
      customElements.define(
        "a-waves",
        class extends HTMLElement {
          startWaves = start;
          stopWaves = stop;
          setWavesSuspended = suspend;
        },
      );
  },
}));

let frames: Map<number, FrameRequestCallback>;
let id: number;
beforeEach(() => {
  vi.clearAllMocks();
  frames = new Map();
  id = 0;
  vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => {
    frames.set(++id, callback);
    return id;
  });
  vi.stubGlobal("cancelAnimationFrame", (frame: number) =>
    frames.delete(frame),
  );
  vi.stubGlobal(
    "ResizeObserver",
    class {
      observe() {}
      disconnect() {}
    },
  );
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

function Harness({ busy = false, top = 0 }) {
  const page = useRef<HTMLElement>(null);
  const surface = useRef<HTMLDivElement>(null);
  const header = useRef<HTMLElement>(null);
  const footer = useRef<HTMLElement>(null);
  return (
    <EntryTransitionContext.Provider
      value={{
        busy,
        target: busy ? "/workspace" : null,
        phase: busy ? "center-in" : "idle",
        mode: "entry",
        start: async () => {},
        cancel: () => {},
        cancelForLocale: () => {},
        registerTitle: () => () => {},
        registerSurface: () => () => {},
      }}
    >
      <section
        ref={(element) => {
          page.current = element;
          if (element)
            element.getBoundingClientRect = () =>
              new DOMRect(0, top, 1366, 768);
        }}
      >
        <div
          ref={(element) => {
            surface.current = element;
            if (element)
              element.getBoundingClientRect = () =>
                new DOMRect(0, top, 1366, 768);
          }}
        >
          <header ref={header} />
          <WelcomeWaves
            className="waves"
            interactionRef={page}
            surfaceRef={surface}
            topBoundaryRef={header}
            bottomBoundaryRef={footer}
          />
          <footer ref={footer} />
        </div>
      </section>
    </EntryTransitionContext.Provider>
  );
}
const tree = (props = {}) => (
  <StrictMode>
    <Harness {...props} />
  </StrictMode>
);
function advance() {
  act(() => {
    const callbacks = [...frames.values()];
    frames.clear();
    callbacks.forEach((callback) => callback(16));
  });
}

it("defers an offscreen welcome and initializes once when scrolling back, including StrictMode", () => {
  const view = render(tree({ top: -768 }));
  advance();
  expect(start).not.toHaveBeenCalled();
  view.rerender(tree());
  fireEvent.scroll(window);
  advance();
  expect(start).toHaveBeenCalledOnce();
  fireEvent.scroll(window);
  advance();
  expect(start).toHaveBeenCalledOnce();
});

it("defers a visible welcome until the mask finishes and suspends existing effects during the next mask", () => {
  const view = render(tree({ busy: true }));
  advance();
  expect(start).not.toHaveBeenCalled();
  view.rerender(tree());
  advance();
  expect(start).toHaveBeenCalledOnce();
  view.rerender(tree({ busy: true }));
  expect(suspend).toHaveBeenLastCalledWith(true);
  advance();
  view.rerender(tree());
  advance();
  expect(suspend).toHaveBeenLastCalledWith(false);
  expect(start).toHaveBeenCalledOnce();
});

it("waits for a visible document and cancels a pending startup on unmount", () => {
  const hidden = vi.spyOn(document, "hidden", "get").mockReturnValue(true);
  const view = render(tree());
  advance();
  expect(start).not.toHaveBeenCalled();
  hidden.mockReturnValue(false);
  fireEvent(document, new Event("visibilitychange"));
  view.unmount();
  advance();
  expect(start).not.toHaveBeenCalled();
  expect(frames.size).toBe(0);
  hidden.mockRestore();
});
