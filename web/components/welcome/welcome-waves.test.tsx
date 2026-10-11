import { act, cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { useRef } from "react";

const { mount, dispose } = vi.hoisted(() => ({
  mount: vi.fn(),
  dispose: vi.fn(),
}));
vi.mock("@/features/welcome/wave-field", () => ({ mountWelcomeWaves: mount }));
import { WelcomeWaves } from "./welcome-waves";

let frames: Map<number, FrameRequestCallback>;
beforeEach(() => {
  mount.mockReset().mockReturnValue({ dispose, setSuspended() {} });
  dispose.mockReset();
  frames = new Map();
  let id = 0;
  vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => {
    frames.set(++id, callback);
    return id;
  });
  vi.stubGlobal("cancelAnimationFrame", (frame: number) =>
    frames.delete(frame),
  );
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

function advance() {
  act(() => {
    const callbacks = [...frames.values()];
    frames.clear();
    callbacks.forEach((callback) => callback(16));
  });
}

it("initializes after the parent page and sibling divider refs are attached", () => {
  vi.stubGlobal(
    "ResizeObserver",
    class {
      observe() {}
      disconnect() {}
    },
  );
  vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(
    function (this: HTMLElement) {
      if (this.tagName === "HEADER") return new DOMRect(48, 0, 1270, 96);
      if (this.tagName === "FOOTER") return new DOMRect(48, 704, 1270, 64);
      return new DOMRect(0, 0, 1366, 768);
    },
  );
  function Homepage() {
    const page = useRef<HTMLElement>(null);
    const header = useRef<HTMLElement>(null);
    const footer = useRef<HTMLElement>(null);
    return (
      <main ref={page}>
        <WelcomeWaves
          className="background"
          interactionRef={page}
          topBoundaryRef={header}
          bottomBoundaryRef={footer}
        />
        <header ref={header} />
        <footer ref={footer} />
      </main>
    );
  }
  render(<Homepage />);
  const waves = screen.getByTestId("welcome-waves");
  expect(waves.style.top).toBe("96px");
  expect(waves.style.height).toBe("608px");
  expect(mount).not.toHaveBeenCalled();
  advance();
  expect(mount).toHaveBeenCalledOnce();
  expect(mount.mock.calls[0][2]).toBe(waves.parentElement);
});

it("tracks divider layout changes and releases its observer on unmount", () => {
  let update: ResizeObserverCallback;
  const observe = vi.fn();
  const disconnect = vi.fn();
  vi.stubGlobal(
    "ResizeObserver",
    class {
      constructor(callback: ResizeObserverCallback) {
        update = callback;
      }
      observe = observe;
      disconnect = disconnect;
    },
  );
  const page = document.createElement("main");
  const header = document.createElement("header");
  const footer = document.createElement("footer");
  vi.spyOn(page, "getBoundingClientRect").mockReturnValue(
    new DOMRect(0, 20, 1366, 768),
  );
  const headerBounds = vi
    .spyOn(header, "getBoundingClientRect")
    .mockReturnValue(new DOMRect(48, 20, 1270, 96));
  const footerBounds = vi
    .spyOn(footer, "getBoundingClientRect")
    .mockReturnValue(new DOMRect(48, 724, 1270, 64));
  const view = render(
    <WelcomeWaves
      className="background"
      interactionRef={{ current: page }}
      topBoundaryRef={{ current: header }}
      bottomBoundaryRef={{ current: footer }}
    />,
  );
  const waves = screen.getByTestId("welcome-waves");
  expect(waves.style.top).toBe("96px");
  expect(waves.style.height).toBe("608px");
  advance();
  expect(mount).toHaveBeenCalledWith(
    waves,
    waves.querySelector("canvas"),
    page,
  );
  expect(observe).toHaveBeenCalledWith(page);
  expect(observe).toHaveBeenCalledWith(header);
  expect(observe).toHaveBeenCalledWith(footer);
  headerBounds.mockReturnValue(new DOMRect(48, 20, 1270, 120));
  footerBounds.mockReturnValue(new DOMRect(48, 720, 1270, 64));
  act(() => update([], {} as ResizeObserver));
  expect(waves.style.top).toBe("120px");
  expect(waves.style.height).toBe("580px");
  expect(mount).toHaveBeenCalledOnce();
  view.unmount();
  expect(disconnect).toHaveBeenCalledOnce();
  expect(dispose).toHaveBeenCalledOnce();
});
