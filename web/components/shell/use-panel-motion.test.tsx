import { act, render, screen } from "@testing-library/react";
import { useRef } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { usePanelMotion } from "./use-panel-motion";

const animation = vi.hoisted(() => ({
  calls: [] as {
    state: { value: number };
    vars: {
      value: number;
      duration: number;
      onUpdate: () => void;
      onComplete: () => void;
    };
    kill: ReturnType<typeof vi.fn>;
  }[],
  fail: false,
}));
vi.mock("gsap", () => ({
  gsap: {
    to: (
      state: { value: number },
      vars: (typeof animation.calls)[number]["vars"],
    ) => {
      if (animation.fail) throw new Error("Animation unavailable");
      const kill = vi.fn();
      animation.calls.push({ state, vars, kill });
      return { kill };
    },
  },
}));

function Harness({
  open = true,
  instant = false,
  resetKey = "task-a",
  settled = vi.fn<(open: boolean) => void>(),
} = {}) {
  const surfaceRef = useRef<HTMLDivElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  usePanelMotion(panelRef, open, {
    surfaceRef,
    property: "--left-progress",
    instant,
    resetKey,
    onSettled: settled,
  });
  return (
    <div ref={surfaceRef} data-testid="surface">
      <div
        ref={panelRef}
        inert={!open}
        aria-hidden={!open || undefined}
        data-testid="panel"
      >
        <input defaultValue="Retained draft" />
      </div>
    </div>
  );
}
function complete(index = animation.calls.length - 1) {
  act(() => {
    const call = animation.calls[index];
    call.state.value = call.vars.value;
    call.vars.onUpdate();
    call.vars.onComplete();
  });
}
let preference: EventTarget & { matches: boolean };
beforeEach(() => {
  animation.calls = [];
  animation.fail = false;
  preference = Object.assign(new EventTarget(), { matches: false });
  vi.stubGlobal("matchMedia", () => preference);
  vi.spyOn(document, "hidden", "get").mockReturnValue(false);
});
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("panel motion", () => {
  it("starts in the saved state and retains content until the exit completes", () => {
    const view = render(<Harness />);
    const panel = screen.getByTestId("panel");
    const input = panel.querySelector("input");
    panel.scrollTop = 42;
    expect(animation.calls).toHaveLength(0);
    view.rerender(<Harness open={false} />);
    expect(panel).toHaveAttribute("data-motion", "closing");
    expect(panel).toHaveAttribute("inert");
    expect(panel).not.toHaveAttribute("hidden");
    expect(animation.calls[0].vars.duration).toBe(0.3);
    complete();
    expect(panel).toHaveAttribute("hidden");
    view.rerender(<Harness />);
    expect(panel).not.toHaveAttribute("hidden");
    complete();
    expect(panel.querySelector("input")).toBe(input);
    expect(panel.scrollTop).toBe(42);
    expect(input?.value).toBe("Retained draft");
  });
  it("reverses from the current frame and ignores an obsolete completion", () => {
    const settled = vi.fn();
    const view = render(<Harness settled={settled} />);
    settled.mockClear();
    view.rerender(<Harness open={false} settled={settled} />);
    act(() => {
      animation.calls[0].state.value = 0.45;
      animation.calls[0].vars.onUpdate();
    });
    view.rerender(<Harness settled={settled} />);
    expect(animation.calls[0].kill).toHaveBeenCalledOnce();
    expect(animation.calls[1].state.value).toBe(0.45);
    act(() => animation.calls[0].vars.onComplete());
    expect(settled).not.toHaveBeenCalled();
    expect(screen.getByTestId("panel")).not.toHaveAttribute("hidden");
    complete();
    expect(settled).toHaveBeenCalledWith(true);
    expect(
      screen.getByTestId("surface").style.getPropertyValue("--left-progress"),
    ).toBe("1");
  });
  it("settles when reduced motion becomes enabled during playback", () => {
    const view = render(<Harness />);
    view.rerender(<Harness open={false} />);
    act(() => {
      preference.matches = true;
      preference.dispatchEvent(new Event("change"));
    });
    expect(animation.calls[0].kill).toHaveBeenCalled();
    expect(screen.getByTestId("panel")).toHaveAttribute("hidden");
    view.rerender(<Harness />);
    expect(animation.calls).toHaveLength(1);
    expect(screen.getByTestId("panel")).not.toHaveAttribute("hidden");
  });
  it("settles hidden pages and does not replay their animation on return", () => {
    const view = render(<Harness />);
    view.rerender(<Harness open={false} />);
    vi.spyOn(document, "hidden", "get").mockReturnValue(true);
    act(() => document.dispatchEvent(new Event("visibilitychange")));
    expect(screen.getByTestId("panel")).toHaveAttribute("hidden");
    vi.spyOn(document, "hidden", "get").mockReturnValue(false);
    act(() => document.dispatchEvent(new Event("visibilitychange")));
    expect(animation.calls).toHaveLength(1);
  });
  it("cancels playback for navigation, hydration or a new task/Zen state", () => {
    const view = render(<Harness />);
    view.rerender(<Harness open={false} />);
    view.rerender(<Harness open={false} instant />);
    expect(animation.calls[0].kill).toHaveBeenCalled();
    expect(screen.getByTestId("panel")).toHaveAttribute("hidden");
    view.rerender(<Harness resetKey="task-b" />);
    expect(animation.calls).toHaveLength(1);
    expect(screen.getByTestId("panel")).not.toHaveAttribute("hidden");
  });
  it("falls back to the requested state when animation startup fails", () => {
    const view = render(<Harness />);
    animation.fail = true;
    view.rerender(<Harness open={false} />);
    expect(screen.getByTestId("panel")).toHaveAttribute("hidden");
    expect(screen.getByTestId("panel")).toHaveAttribute("data-motion", "idle");
  });
  it("kills active motion and removes preference listeners on unmount", () => {
    const remove = vi.spyOn(preference, "removeEventListener");
    const settled = vi.fn();
    const view = render(<Harness settled={settled} />);
    view.rerender(<Harness open={false} settled={settled} />);
    settled.mockClear();
    view.unmount();
    expect(animation.calls[0].kill).toHaveBeenCalled();
    expect(remove).toHaveBeenCalledWith("change", expect.any(Function));
    act(() => {
      animation.calls[0].vars.onComplete();
      preference.dispatchEvent(new Event("change"));
    });
    expect(settled).not.toHaveBeenCalled();
  });
});
