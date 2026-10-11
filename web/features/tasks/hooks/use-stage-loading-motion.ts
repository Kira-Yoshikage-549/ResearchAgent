"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import type { ReplayState } from "@/lib/events/types";
import {
  advanceStageLoading,
  nextStageLoadingDeadline,
  reconcileStageLoading,
  stageLoadingSignature,
} from "@/features/tasks/stage-loading-motion";

// Both sizes use this foreground clock, including when a Zen indicator mounts
// halfway through a completion. Hidden time never consumes a transition.
export function createStageLoadingClock() {
  let visible =
    typeof document === "undefined" || document.visibilityState !== "hidden";
  let accumulated = 0;
  let started = performance.now();
  const now = () => accumulated + (visible ? performance.now() - started : 0);
  return {
    now,
    getSnapshot: () => visible,
    getServerSnapshot: () => true,
    subscribe: (notify: () => void) => {
      const update = () => {
        accumulated = now();
        started = performance.now();
        visible = document.visibilityState !== "hidden";
        notify();
      };
      document.addEventListener("visibilitychange", update);
      update();
      return () => document.removeEventListener("visibilitychange", update);
    },
  };
}

export type StageLoadingClock = ReturnType<typeof createStageLoadingClock>;

function subscribeReducedMotion(notify: () => void) {
  const query = window.matchMedia?.("(prefers-reduced-motion: reduce)");
  query?.addEventListener("change", notify);
  return () => query?.removeEventListener("change", notify);
}

function reducedMotionSnapshot() {
  return (
    window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false
  );
}

export function useStageLoadingMotion(state: ReplayState | null) {
  const [clock] = useState(createStageLoadingClock);
  const visible = useSyncExternalStore(
    clock.subscribe,
    clock.getSnapshot,
    clock.getServerSnapshot,
  );
  const reducedMotion = useSyncExternalStore(
    subscribeReducedMotion,
    reducedMotionSnapshot,
    () => false,
  );
  const [frame, setFrame] = useState(() =>
    reconcileStageLoading(null, state, clock.now()),
  );
  if (frame.signature !== stageLoadingSignature(state)) {
    setFrame(reconcileStageLoading(frame, state, clock.now()));
  }
  useEffect(() => {
    if (!visible) return;
    const deadline = nextStageLoadingDeadline(frame);
    if (!Number.isFinite(deadline)) return;
    let timer: ReturnType<typeof setTimeout>;
    const advance = () => {
      if (!clock.getSnapshot()) return;
      const now = clock.now();
      // Fractional timeout delays can fire early. Reschedule instead of setting
      // an identical frame and losing the completion timer.
      if (now < deadline) {
        timer = setTimeout(advance, Math.max(1, Math.ceil(deadline - now)));
        return;
      }
      setFrame((current) => advanceStageLoading(current, now));
    };
    timer = setTimeout(advance, Math.max(1, Math.ceil(deadline - clock.now())));
    return () => clearTimeout(timer);
  }, [frame, visible, clock]);
  return { stages: frame.stages, clock, visible, reducedMotion };
}

export type TaskStageLoading = ReturnType<typeof useStageLoadingMotion>;
