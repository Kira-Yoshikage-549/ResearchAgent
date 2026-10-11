"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { gsap } from "gsap";
import {
  Check,
  Circle,
  CircleAlert,
  CircleX,
  LoaderCircle,
  Pause,
} from "lucide-react";
import type { StageLoadingMotion } from "@/features/tasks/stage-loading-motion";
import type { TaskStageLoading } from "@/features/tasks/hooks/use-stage-loading-motion";
import styles from "./stage-loading-indicator.module.css";
import type { ReplayState } from "@/lib/events/types";

// Adapted from JIEJOE'S WEB Tutorial / 014-snake-loading (MIT).
// Full copyright and license: web/public/licenses/snake-loading-MIT.txt.
const SNAKE_PATH =
  "M50,25c0-12.14,9.84-21.99,21.99-21.99S93.98,12.86,93.98,25s-9.84,21.99-21.99,21.99S50,37.21,50,25.06S40.16,3.01,28.01,3.01S6.02,12.86,6.02,25s9.84,21.99,21.99,21.99S50,37.14,50,25c0-8.14,4.42-15.24,10.99-19.05C67.57,9.76,71.99,16.86,71.99,25c0,8.14-4.42,15.24-10.99,19.04c-3.23,1.87-6.99,2.94-10.99,2.94c-4.01,0-7.76-1.07-10.99-2.94C32.43,40.24,28.01,33.14,28.01,25c0-8.14,4.42-15.24,10.99-19.05C42.24,4.08,45.99,3.01,50,3.01s7.76,1.07,10.99,2.94";

export function StageLoadingIndicator({
  motion,
  loading,
  size = "rail",
}: {
  motion: StageLoadingMotion;
  loading: Pick<TaskStageLoading, "clock" | "visible" | "reducedMotion">;
  size?: "rail" | "zen-rail" | "center";
}) {
  const root = useRef<HTMLSpanElement>(null);
  const timeline = useRef<gsap.core.Timeline | null>(null);
  const inViewport = useRef(true);
  const trailOffset = useRef(0);
  const headOffset = useRef(480);
  const { clock, visible, reducedMotion } = loading;
  const phase = reducedMotion
    ? motion.status === "completed"
      ? motion.departureRequested
        ? "check"
        : "complete"
      : "idle"
    : motion.phase;

  useLayoutEffect(() => {
    const element = root.current;
    if (
      !element ||
      (phase !== "loading" && phase !== "settling" && phase !== "leaving")
    )
      return;
    const snake = element.querySelector(`.${styles.snake}`)!;
    const trail = element.querySelector(`.${styles.trail}`)!;
    const head = element.querySelector(`.${styles.head}`)!;
    const ringMask = element.querySelector(`.${styles.ringMask}`)!;
    const ring = element.querySelector(`.${styles.ring}`)!;
    const check = element.querySelector(`.${styles.check}`)!;
    const context = gsap.context(() => {
      const animation = gsap.timeline({ paused: true });
      timeline.current = animation;
      if (phase === "loading") {
        animation.fromTo(
          [trail, head],
          {
            strokeDashoffset: (index) => (index === 0 ? 0 : 480),
          },
          {
            strokeDashoffset: (index) => (index === 0 ? -275 : 205),
            duration: 2,
            ease: "none",
            repeat: -1,
          },
        );
        animation.time(((clock.now() - motion.cycleStartedAt) % 2000) / 1000);
      } else if (phase === "settling") {
        animation
          .set(trail, { strokeDashoffset: trailOffset.current })
          .set(head, { strokeDashoffset: headOffset.current })
          .to(head, { strokeWidth: 0, duration: 0.4, ease: "power3.out" })
          .to(
            trail,
            {
              strokeDasharray: "138 0 0 0 0 0 0 0 0 500",
              strokeDashoffset: -300,
              duration: 0.7,
              ease: "power3.out",
            },
            0,
          )
          .to(snake, { opacity: 0, duration: 0.2 }, 0.5)
          .fromTo(ringMask, { opacity: 0 }, { opacity: 1, duration: 0.4 }, 0.3)
          .fromTo(check, { opacity: 0 }, { opacity: 1, duration: 0.25 }, 0.4);
        animation.time(
          Math.min(0.7, (clock.now() - motion.phaseStartedAt) / 1000),
        );
      } else {
        animation.fromTo(
          ring,
          { yPercent: 0 },
          { yPercent: 100, duration: 0.3, ease: "power3.in" },
        );
        if (size === "center")
          animation.to(check, { opacity: 0, duration: 0.15 }, 0.15);
        animation.time(
          Math.min(0.3, (clock.now() - motion.phaseStartedAt) / 1000),
        );
      }
    }, element);
    return () => {
      trailOffset.current =
        Number(gsap.getProperty(trail, "strokeDashoffset")) || 0;
      headOffset.current =
        Number(gsap.getProperty(head, "strokeDashoffset")) || 480;
      context.revert();
      timeline.current = null;
    };
  }, [
    phase,
    motion.cycle,
    motion.phaseStartedAt,
    motion.cycleStartedAt,
    clock,
    size,
  ]);

  useEffect(() => {
    const sync = () => {
      const animation = timeline.current;
      if (!animation) return;
      if (visible && inViewport.current) {
        const elapsed =
          clock.now() -
          (phase === "loading" ? motion.cycleStartedAt : motion.phaseStartedAt);
        animation
          .time(
            phase === "loading"
              ? (elapsed % 2000) / 1000
              : Math.min(animation.duration(), elapsed / 1000),
          )
          .play();
      } else animation.pause();
    };
    sync();
    if (
      !timeline.current ||
      !root.current ||
      typeof IntersectionObserver === "undefined"
    )
      return;
    const observer = new IntersectionObserver(([entry]) => {
      inViewport.current = entry.isIntersecting;
      sync();
    });
    observer.observe(root.current);
    return () => observer.disconnect();
  }, [
    visible,
    phase,
    motion.cycle,
    motion.phaseStartedAt,
    motion.cycleStartedAt,
    clock,
    size,
  ]);

  const Icon =
    motion.status === "warning"
      ? CircleAlert
      : motion.status === "failed"
        ? CircleX
        : motion.status === "cancelled" || motion.status === "interrupted"
          ? Pause
          : motion.status === "running"
            ? LoaderCircle
            : Circle;
  return (
    <span
      ref={root}
      className={styles.indicator}
      aria-hidden="true"
      data-stage-loading
      data-phase={phase}
      data-size={size}
      data-cycle={motion.cycle}
      data-status={motion.status}
    >
      {phase === "idle" ? (
        <span className={styles.staticIcon}>
          <Icon />
        </span>
      ) : (
        <>
          <svg className={styles.snake} viewBox="0 0 100 50">
            <path className={styles.trail} d={SNAKE_PATH} />
            <path className={styles.head} d={SNAKE_PATH} />
          </svg>
          <span className={styles.ringMask}>
            <svg className={styles.ring} viewBox="0 0 100 50">
              <circle cx="50" cy="25" r="21.99" />
            </svg>
          </span>
          <span className={styles.check}>
            <Check />
          </span>
        </>
      )}
    </span>
  );
}

export function StageLoadingCenter({
  state,
  loading,
}: {
  state: ReplayState;
  loading: TaskStageLoading;
}) {
  const [displayedStage, setDisplayedStage] = useState(state.currentStage);
  if (
    displayedStage !== state.currentStage &&
    (!displayedStage ||
      !["settling", "leaving"].includes(loading.stages[displayedStage].phase) ||
      loading.reducedMotion)
  ) {
    setDisplayedStage(state.currentStage);
  }
  return displayedStage ? (
    <StageLoadingIndicator
      key={displayedStage}
      motion={loading.stages[displayedStage]}
      loading={loading}
      size="center"
    />
  ) : null;
}
