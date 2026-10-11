import { act, render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createInitialReplayState } from "@/lib/events/reducer";
import { useStageLoadingMotion } from "@/features/tasks/hooks/use-stage-loading-motion";
import type { ReplayState } from "@/lib/events/types";
import {
  StageLoadingCenter,
  StageLoadingIndicator,
} from "./stage-loading-indicator";

const animation = vi.hoisted(() => ({
  play: vi.fn(),
  pause: vi.fn(),
  revert: vi.fn(),
  disconnect: vi.fn(),
}));
vi.mock("gsap", () => ({
  gsap: {
    timeline: () => {
      const chain = {
        fromTo: vi.fn(),
        set: vi.fn(),
        to: vi.fn(),
        time: vi.fn(),
        play: animation.play,
        pause: animation.pause,
        duration: () => 0.7,
      };
      for (const key of [
        "fromTo",
        "set",
        "to",
        "time",
        "play",
        "pause",
      ] as const)
        chain[key].mockReturnValue(chain);
      return chain;
    },
    context: (run: () => void) => {
      run();
      return { revert: animation.revert };
    },
    getProperty: () => 0,
  },
}));

function runningState() {
  const state = createInitialReplayState("indicator-task");
  state.taskStatus = "running";
  state.currentStage = "search";
  state.stages.search.status = "running";
  return state;
}

function Indicators({ state }: { state: ReplayState }) {
  const loading = useStageLoadingMotion(state);
  return (
    <>
      <div data-testid="search">
        <StageLoadingIndicator
          motion={loading.stages.search}
          loading={loading}
        />
      </div>
      <div data-testid="read">
        <StageLoadingIndicator motion={loading.stages.read} loading={loading} />
      </div>
      <div data-testid="center">
        <StageLoadingCenter state={state} loading={loading} />
      </div>
    </>
  );
}

beforeEach(() => {
  vi.clearAllMocks();
});
afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("stage loading indicators", () => {
  it("pauses offscreen animation and disposes timelines and observers on unmount", () => {
    const observations: IntersectionObserverCallback[] = [];
    vi.stubGlobal(
      "IntersectionObserver",
      class {
        constructor(callback: IntersectionObserverCallback) {
          observations.push(callback);
        }
        observe() {}
        disconnect = animation.disconnect;
      },
    );
    const { unmount } = render(<Indicators state={runningState()} />);
    expect(animation.play).toHaveBeenCalled();
    act(() =>
      observations[0](
        [{ isIntersecting: false } as IntersectionObserverEntry],
        {} as IntersectionObserver,
      ),
    );
    expect(animation.pause).toHaveBeenCalled();
    unmount();
    expect(animation.revert).toHaveBeenCalledTimes(2);
    expect(animation.disconnect).toHaveBeenCalledTimes(2);
  });

  it("shares completion timing while the next rail stage already runs", () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout", "performance"] });
    const state = runningState();
    const { getByTestId, rerender } = render(<Indicators state={state} />);
    const next = {
      ...state,
      currentStage: "read" as const,
      stages: {
        ...state.stages,
        search: { ...state.stages.search, status: "completed" as const },
        read: { ...state.stages.read, status: "running" as const },
      },
    };
    rerender(<Indicators state={next} />);
    const phase = (id: string) =>
      getByTestId(id).firstElementChild?.getAttribute("data-phase");
    expect(phase("search")).toBe("settling");
    expect(phase("center")).toBe("settling");
    expect(phase("read")).toBe("loading");
    act(() => vi.advanceTimersByTime(700));
    expect(phase("search")).toBe("leaving");
    expect(phase("center")).toBe("leaving");
    act(() => vi.advanceTimersByTime(300));
    expect(phase("search")).toBe("check");
    expect(phase("center")).toBe("loading");
  });

  it("uses static feedback immediately with reduced motion", () => {
    vi.stubGlobal("matchMedia", () => ({
      matches: true,
      addEventListener() {},
      removeEventListener() {},
    }));
    const state = runningState();
    const { getByTestId, rerender } = render(<Indicators state={state} />);
    expect(getByTestId("center").firstElementChild).toHaveAttribute(
      "data-phase",
      "idle",
    );
    state.stages.search.status = "completed";
    rerender(<Indicators state={state} />);
    expect(getByTestId("center").firstElementChild).toHaveAttribute(
      "data-phase",
      "complete",
    );
    expect(animation.play).not.toHaveBeenCalled();
  });
});
