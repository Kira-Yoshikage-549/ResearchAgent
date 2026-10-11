import type {
  ReplayState,
  ResearchStage,
  StageStatus,
} from "@/lib/events/types";
import { RESEARCH_STAGES } from "@/lib/events/types";

export const STAGE_SETTLE_MS = 700;
export const STAGE_LEAVE_MS = 300;

export type StageLoadingPhase =
  "idle" | "loading" | "settling" | "complete" | "leaving" | "check";

export type StageLoadingMotion = {
  status: StageStatus | "interrupted";
  phase: StageLoadingPhase;
  cycle: number;
  attempt: number;
  startedAt: string | null;
  cycleStartedAt: number;
  phaseStartedAt: number;
  departureRequested: boolean;
};

export type StageLoadingFrame = {
  signature: string;
  taskId: string | null;
  stages: Record<ResearchStage, StageLoadingMotion>;
};

export function stageLoadingSignature(state: ReplayState | null) {
  return JSON.stringify(
    state && [
      state.taskId,
      state.taskStatus,
      state.currentStage,
      ...RESEARCH_STAGES.map((stage) => {
        const snapshot = state.stages[stage];
        return [snapshot.status, snapshot.attempt, snapshot.startedAt];
      }),
    ],
  );
}

export function reconcileStageLoading(
  previous: StageLoadingFrame | null,
  state: ReplayState | null,
  now: number,
): StageLoadingFrame {
  const signature = stageLoadingSignature(state);
  if (previous?.signature === signature) return previous;
  const stages = {} as StageLoadingFrame["stages"];
  for (const stage of RESEARCH_STAGES) {
    const snapshot = state?.stages[stage];
    const old =
      previous?.taskId === state?.taskId ? previous?.stages[stage] : undefined;
    let status: StageLoadingMotion["status"] = snapshot?.status ?? "pending";
    if (state?.currentStage === stage && status === "running") {
      if (state.taskStatus === "interrupted") status = "interrupted";
      if (state.taskStatus === "failed") status = "failed";
      if (state.taskStatus === "cancelled") status = "cancelled";
    }
    const restarted = Boolean(
      old &&
      snapshot &&
      (old.attempt !== snapshot.attempt ||
        (old.startedAt &&
          snapshot.startedAt &&
          old.startedAt !== snapshot.startedAt) ||
        (old.status !== "running" && status === "running")),
    );
    const departureRequested = Boolean(
      state?.currentStage && state.currentStage !== stage,
    );
    let phase: StageLoadingPhase =
      status === "running" && !state?.isTerminal
        ? "loading"
        : status === "completed"
          ? departureRequested
            ? "check"
            : "complete"
          : "idle";
    if (old && !restarted && status === "completed") {
      if (old.status !== "completed") phase = "settling";
      else if (old.phase === "settling" || old.phase === "leaving")
        phase = old.phase;
      else if (old.phase === "complete" && departureRequested)
        phase = "leaving";
      else if (old.phase === "check") phase = "check";
    }
    const unchangedPhase = old && !restarted && old.phase === phase;
    stages[stage] = {
      status,
      phase,
      cycle: (old?.cycle ?? 0) + (restarted ? 1 : 0),
      attempt: snapshot?.attempt ?? 1,
      startedAt: snapshot?.startedAt ?? null,
      cycleStartedAt: old && !restarted ? old.cycleStartedAt : now,
      phaseStartedAt: unchangedPhase ? old.phaseStartedAt : now,
      departureRequested,
    };
  }
  return { signature, taskId: state?.taskId ?? null, stages };
}

export function advanceStageLoading(frame: StageLoadingFrame, now: number) {
  let next = frame;
  for (const stage of RESEARCH_STAGES) {
    let motion = frame.stages[stage];
    if (
      motion.phase === "settling" &&
      now >= motion.phaseStartedAt + STAGE_SETTLE_MS
    ) {
      motion = {
        ...motion,
        phase: motion.departureRequested ? "leaving" : "complete",
        phaseStartedAt: motion.phaseStartedAt + STAGE_SETTLE_MS,
      };
    }
    if (
      motion.phase === "leaving" &&
      now >= motion.phaseStartedAt + STAGE_LEAVE_MS
    ) {
      motion = {
        ...motion,
        phase: "check",
        phaseStartedAt: motion.phaseStartedAt + STAGE_LEAVE_MS,
      };
    }
    if (motion !== frame.stages[stage]) {
      if (next === frame) next = { ...frame, stages: { ...frame.stages } };
      next.stages[stage] = motion;
    }
  }
  return next;
}

export function nextStageLoadingDeadline(frame: StageLoadingFrame) {
  return Math.min(
    ...RESEARCH_STAGES.map((stage) => {
      const motion = frame.stages[stage];
      return motion.phase === "settling"
        ? motion.phaseStartedAt + STAGE_SETTLE_MS
        : motion.phase === "leaving"
          ? motion.phaseStartedAt + STAGE_LEAVE_MS
          : Infinity;
    }),
  );
}
