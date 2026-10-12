import { act, fireEvent, render, screen } from "@testing-library/react";
import { useRef } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useReportReveal } from "./use-report-reveal";
import { EntryTransitionContext } from "@/components/entry/entry-transition-provider";

const animation = vi.hoisted(() => ({
  to: vi.fn(),
  kill: vi.fn(),
  complete: () => {},
}));
vi.mock("gsap", () => ({
  gsap: {
    set: (element: HTMLElement, vars: object) =>
      Object.assign(element.style, vars),
    to: (element: HTMLElement, vars: { onComplete: () => void }) => {
      animation.to(element, vars);
      animation.complete = vars.onComplete;
      return { kill: animation.kill };
    },
  },
}));

function Harness({ live = false, ready = false, busy = false } = {}) {
  const ref = useRef<HTMLDivElement>(null);
  return (
    <EntryTransitionContext.Provider
      value={{
        busy,
        target: null,
        phase: busy ? "covering" : "idle",
        mode: "research",
        start: async () => {},
        cancelForLocale: () => {},
        cancel: () => {},
        registerTitle: () => () => {},
        registerSurface: () => () => {},
      }}
    >
      <Region regionRef={ref} live={live} ready={ready} />
    </EntryTransitionContext.Provider>
  );
}
function Region({
  regionRef,
  live,
  ready,
}: {
  regionRef: React.RefObject<HTMLDivElement | null>;
  live: boolean;
  ready: boolean;
}) {
  useReportReveal(regionRef, live, ready);
  return (
    <>
      <input aria-label="Draft" />
      <div ref={regionRef} data-testid="region">
        Report
      </div>
    </>
  );
}
beforeEach(() => {
  animation.to.mockClear();
  animation.kill.mockClear();
  vi.stubGlobal("matchMedia", undefined);
});
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("report reveal", () => {
  it("reveals the viewport once after live research without moving focus or scroll", () => {
    const view = render(<Harness live />);
    const region = screen.getByTestId("region");
    region.scrollTop = 42;
    const focus = document.activeElement;
    view.rerender(<Harness ready />);
    expect(region).toHaveAttribute("data-report-revealing", "true");
    expect(animation.to).toHaveBeenCalledTimes(1);
    act(() => animation.complete());
    expect(region.style.clipPath).toBe("");
    expect(region.style.willChange).toBe("");
    expect(region.scrollTop).toBe(42);
    expect(document.activeElement).toBe(focus);
    view.rerender(<Harness />);
    view.rerender(<Harness ready />);
    expect(animation.to).toHaveBeenCalledTimes(1);
  });
  it("does not animate directly opened completed reports", () => {
    render(<Harness ready />);
    expect(animation.to).not.toHaveBeenCalled();
  });
  it("restores existing styles and stays readable when animation startup fails", () => {
    const view = render(<Harness live />);
    const region = screen.getByTestId("region");
    region.style.clipPath = "inset(1px)";
    region.style.willChange = "transform";
    animation.to.mockImplementationOnce(() => {
      throw new Error("Animation unavailable");
    });
    view.rerender(<Harness ready />);
    expect(region.style.clipPath).toBe("inset(1px)");
    expect(region.style.willChange).toBe("transform");
    expect(region).not.toHaveAttribute("data-report-revealing");
    view.rerender(<Harness ready />);
    expect(animation.to).toHaveBeenCalledTimes(1);
  });
  it.each(["hidden", "reduced"])(
    "removes active clipping on %s and does not replay when it resumes",
    (reason) => {
      const motion = new EventTarget() as EventTarget & { matches: boolean };
      motion.matches = false;
      vi.stubGlobal("matchMedia", () => motion);
      const view = render(<Harness live />);
      view.rerender(<Harness ready />);
      if (reason === "hidden") {
        vi.spyOn(document, "hidden", "get").mockReturnValue(true);
        fireEvent(document, new Event("visibilitychange"));
      } else {
        motion.matches = true;
        act(() => motion.dispatchEvent(new Event("change")));
      }
      const region = screen.getByTestId("region");
      expect(region.style.clipPath).toBe("");
      expect(region).not.toHaveAttribute("data-report-revealing");
      vi.restoreAllMocks();
      motion.matches = false;
      fireEvent(document, new Event("visibilitychange"));
      act(() => motion.dispatchEvent(new Event("change")));
      expect(animation.to).toHaveBeenCalledTimes(1);
    },
  );
  it("remembers a selection cleared by replacement of the outgoing DOM", () => {
    const view = render(<Harness live />);
    const selection = vi.spyOn(window, "getSelection");
    selection.mockReturnValue({
      toString: () => "selected live text",
    } as Selection);
    fireEvent(document, new Event("selectionchange"));
    selection.mockReturnValue({ toString: () => "" } as Selection);
    view.rerender(<Harness ready />);
    expect(animation.to).not.toHaveBeenCalled();
  });
  it.each(["input", "selection", "hidden", "busy", "reduced"])(
    "skips %s and never queues a delayed reveal",
    (reason) => {
      const view = render(<Harness live />);
      if (reason === "input") screen.getByLabelText("Draft").focus();
      if (reason === "selection")
        vi.spyOn(window, "getSelection").mockReturnValue({
          toString: () => "selected",
        } as Selection);
      if (reason === "hidden")
        vi.spyOn(document, "hidden", "get").mockReturnValue(true);
      if (reason === "reduced")
        vi.stubGlobal("matchMedia", () => ({ matches: true }));
      view.rerender(<Harness ready busy={reason === "busy"} />);
      expect(animation.to).not.toHaveBeenCalled();
      vi.restoreAllMocks();
      vi.stubGlobal("matchMedia", undefined);
      (document.activeElement as HTMLElement)?.blur();
      view.rerender(<Harness ready />);
      expect(animation.to).not.toHaveBeenCalled();
    },
  );
  it.each([
    "pointerdown",
    "scroll",
    "resize",
    "focus",
    "navigation",
    "unmount",
  ])("restores unclipped content on %s", (reason) => {
    const view = render(<Harness live />);
    view.rerender(<Harness ready />);
    const region = screen.getByTestId("region");
    if (reason === "resize") fireEvent(window, new Event("resize"));
    else if (reason === "focus") screen.getByLabelText("Draft").focus();
    else if (reason === "navigation") view.rerender(<Harness ready busy />);
    else if (reason === "unmount") view.unmount();
    else fireEvent(region, new Event(reason));
    expect(animation.kill).toHaveBeenCalled();
    expect(region.style.clipPath).toBe("");
    expect(region).not.toHaveAttribute("data-report-revealing");
  });
});
