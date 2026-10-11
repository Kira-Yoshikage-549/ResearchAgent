import { describe, expect, it } from "vitest";
import {
  createInitialReplayState,
  reduceResearchEvent,
} from "@/lib/events/reducer";
import {
  advanceStageLoading,
  reconcileStageLoading,
  nextStageLoadingDeadline,
} from "./stage-loading-motion";

function running() {
  const state = createInitialReplayState("loading-task");
  state.taskStatus = "running";
  state.currentStage = "orchestrate";
  state.stages.orchestrate.status = "running";
  state.stages.orchestrate.startedAt = "2026-10-11T12:00:00Z";
  return state;
}

describe("stage loading state", () => {
  it("does not restart on ordinary progress or replay sequence changes", () => {
    const state = running();
    const frame = reconcileStageLoading(null, state, 0);
    const progress = { ...state, lastSequence: 42, metrics: { papersRead: 8 } };
    expect(reconcileStageLoading(frame, progress, 500)).toBe(frame);
  });

  it("finishes a batched previous-stage completion while the next loop starts immediately", () => {
    let state = running();
    const initial = reconcileStageLoading(null, state, 0);
    const base = {
      schema_version: 1,
      task_id: state.taskId,
      occurred_at: "2026-10-11T12:00:02Z",
      level: "info",
      payload: {},
    };
    state = reduceResearchEvent(state, {
      ...base,
      event_type: "stage.completed",
      sequence: 1,
      stage: "orchestrate",
    }).state;
    state = reduceResearchEvent(state, {
      ...base,
      event_type: "stage.started",
      sequence: 2,
      stage: "search",
    }).state;
    const frame = reconcileStageLoading(initial, state, 2000);
    expect(frame.stages.orchestrate).toMatchObject({
      phase: "settling",
      departureRequested: true,
    });
    expect(frame.stages.search.phase).toBe("loading");
    const leaving = advanceStageLoading(frame, 2700);
    expect(leaving.stages.orchestrate.phase).toBe("leaving");
    expect(advanceStageLoading(leaving, 3000).stages.orchestrate.phase).toBe(
      "check",
    );
    expect(nextStageLoadingDeadline(advanceStageLoading(leaving, 3000))).toBe(
      Infinity,
    );
  });

  it("holds the unfilled completion circle until the next stage actually starts", () => {
    const state = running();
    const initial = reconcileStageLoading(null, state, 0);
    state.stages.orchestrate.status = "completed";
    const settling = reconcileStageLoading(initial, state, 100);
    const complete = advanceStageLoading(settling, 800);
    expect(complete.stages.orchestrate.phase).toBe("complete");
    state.currentStage = "search";
    state.stages.search.status = "running";
    expect(
      reconcileStageLoading(complete, state, 1200).stages.orchestrate.phase,
    ).toBe("leaving");
  });

  it("renders initial completed snapshots without replaying history", () => {
    const state = running();
    state.stages.orchestrate.status = "completed";
    expect(reconcileStageLoading(null, state, 0).stages.orchestrate.phase).toBe(
      "complete",
    );
    state.currentStage = "search";
    expect(reconcileStageLoading(null, state, 0).stages.orchestrate.phase).toBe(
      "check",
    );
  });

  it("restarts for attempts and genuine start timestamps, but not a missing timestamp filled by progress", () => {
    const state = running();
    state.stages.orchestrate.startedAt = null;
    let frame = reconcileStageLoading(null, state, 0);
    state.stages.orchestrate.startedAt = "2026-10-11T12:00:00Z";
    frame = reconcileStageLoading(frame, state, 200);
    expect(frame.stages.orchestrate.cycle).toBe(0);
    state.stages.orchestrate.startedAt = "2026-10-11T12:00:02Z";
    frame = reconcileStageLoading(frame, state, 2000);
    expect(frame.stages.orchestrate).toMatchObject({
      cycle: 1,
      cycleStartedAt: 2000,
      phase: "loading",
    });
    state.stages.orchestrate.attempt = 2;
    expect(
      reconcileStageLoading(frame, state, 2500).stages.orchestrate.cycle,
    ).toBe(2);
  });

  it.each(["failed", "cancelled", "interrupted"] as const)(
    "stops a stale running snapshot when the task is %s",
    (status) => {
      const state = running();
      const frame = reconcileStageLoading(null, state, 0);
      state.taskStatus = status;
      state.isTerminal = true;
      expect(
        reconcileStageLoading(frame, state, 100).stages.orchestrate,
      ).toMatchObject({ status, phase: "idle" });
    },
  );

  it("preserves warning feedback and resumes a fresh loop on recovery", () => {
    const state = running();
    let frame = reconcileStageLoading(null, state, 0);
    state.stages.orchestrate.status = "warning";
    frame = reconcileStageLoading(frame, state, 100);
    expect(frame.stages.orchestrate).toMatchObject({
      status: "warning",
      phase: "idle",
    });
    state.stages.orchestrate.status = "running";
    expect(
      reconcileStageLoading(frame, state, 200).stages.orchestrate,
    ).toMatchObject({ cycle: 1, phase: "loading" });
  });
});
