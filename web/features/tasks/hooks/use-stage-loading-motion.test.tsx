import { act, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createInitialReplayState } from "@/lib/events/reducer";
import { useStageLoadingMotion } from "./use-stage-loading-motion";

function stateWithStatus(status: "running" | "completed") {
  const state = createInitialReplayState("motion-hook");
  state.currentStage = "search";
  state.taskStatus = "running";
  state.stages.search.status = status;
  return state;
}

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("shared stage loading clock", () => {
  it("reschedules a fractional deadline when the browser fires slightly early", () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    let now = 0;
    vi.spyOn(performance, "now").mockImplementation(() => now);
    const { result, rerender } = renderHook(
      ({ state }) => useStageLoadingMotion(state),
      { initialProps: { state: stateWithStatus("running") } },
    );
    rerender({ state: stateWithStatus("completed") });
    now = 699.8;
    act(() => vi.advanceTimersByTime(700));
    expect(result.current.stages.search.phase).toBe("settling");
    expect(vi.getTimerCount()).toBe(1);
    now = 700.8;
    act(() => vi.advanceTimersByTime(1));
    expect(result.current.stages.search.phase).toBe("complete");
  });
  it("pauses completion deadlines while hidden and clears resources on unmount", () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout", "performance"] });
    let visibility: DocumentVisibilityState = "visible";
    vi.spyOn(document, "visibilityState", "get").mockImplementation(
      () => visibility,
    );
    const remove = vi.spyOn(document, "removeEventListener");
    const { result, rerender, unmount } = renderHook(
      ({ state }) => useStageLoadingMotion(state),
      { initialProps: { state: stateWithStatus("running") } },
    );
    rerender({ state: stateWithStatus("completed") });
    act(() => vi.advanceTimersByTime(200));
    act(() => {
      visibility = "hidden";
      document.dispatchEvent(new Event("visibilitychange"));
    });
    const paused = result.current.clock.now();
    act(() => vi.advanceTimersByTime(5000));
    expect(result.current.clock.now()).toBe(paused);
    expect(result.current.stages.search.phase).toBe("settling");
    act(() => {
      visibility = "visible";
      document.dispatchEvent(new Event("visibilitychange"));
    });
    act(() => vi.advanceTimersByTime(500));
    expect(result.current.stages.search.phase).toBe("complete");
    unmount();
    expect(vi.getTimerCount()).toBe(0);
    expect(remove).toHaveBeenCalledWith(
      "visibilitychange",
      expect.any(Function),
    );
  });

  it("reacts to reduced motion changes without replacing the task clock", () => {
    const listeners = new Set<() => void>();
    const query = {
      matches: false,
      addEventListener: (_: string, listener: () => void) =>
        listeners.add(listener),
      removeEventListener: (_: string, listener: () => void) =>
        listeners.delete(listener),
    };
    vi.stubGlobal("matchMedia", () => query);
    const { result, unmount } = renderHook(() =>
      useStageLoadingMotion(stateWithStatus("running")),
    );
    const clock = result.current.clock;
    act(() => {
      query.matches = true;
      listeners.forEach((notify) => notify());
    });
    expect(result.current.reducedMotion).toBe(true);
    expect(result.current.clock).toBe(clock);
    unmount();
    expect(listeners.size).toBe(0);
  });
});
