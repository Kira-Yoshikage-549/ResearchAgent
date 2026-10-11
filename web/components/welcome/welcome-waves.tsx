"use client";

import {
  useContext,
  useEffect,
  useLayoutEffect,
  useRef,
  type RefObject,
} from "react";
import { EntryTransitionContext } from "@/components/entry/entry-transition-provider";
import {
  registerWelcomeWaves,
  type WelcomeWaveElement,
} from "@/features/welcome/wave-element";
import styles from "./welcome-waves.module.css";

export function WelcomeWaves({
  className,
  interactionRef,
  surfaceRef = interactionRef,
  topBoundaryRef,
  bottomBoundaryRef,
  titleRef,
  descriptionRef,
}: {
  className: string;
  interactionRef: RefObject<HTMLElement | null>;
  surfaceRef?: RefObject<HTMLElement | null>;
  topBoundaryRef: RefObject<HTMLElement | null>;
  bottomBoundaryRef: RefObject<HTMLElement | null>;
  titleRef?: RefObject<HTMLHeadingElement | null>;
  descriptionRef?: RefObject<HTMLElement | null>;
}) {
  const host = useRef<WelcomeWaveElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const transition = useContext(EntryTransitionContext);
  const busy = Boolean(transition?.busy);
  const busyRef = useRef(busy);
  const syncVisibilityRef = useRef<(() => void) | null>(null);

  useLayoutEffect(() => {
    busyRef.current = busy;
    syncVisibilityRef.current?.();
  }, [busy]);

  useEffect(() => {
    const viewport = host.current;
    const surface = canvas.current;
    const page = interactionRef.current;
    const geometry = surfaceRef.current;
    const topBoundary = topBoundaryRef.current;
    const bottomBoundary = bottomBoundaryRef.current;
    if (
      !viewport ||
      !surface ||
      !page ||
      !geometry ||
      !topBoundary ||
      !bottomBoundary
    )
      return;

    const updateBounds = () => {
      const bounds = geometry.getBoundingClientRect();
      const layoutHeight = geometry.offsetHeight || bounds.height;
      const scale = bounds.height / layoutHeight;
      // Keep layout geometry independent of the welcome surface's viewport position.
      if (!scale || !Number.isFinite(scale)) return;
      const top = Math.max(
        0,
        (topBoundary.getBoundingClientRect().bottom - bounds.top) / scale,
      );
      const bottom = Math.max(
        top,
        Math.min(
          layoutHeight,
          (bottomBoundary.getBoundingClientRect().top - bounds.top) / scale,
        ),
      );
      viewport.style.top = `${top}px`;
      viewport.style.height = `${bottom - top}px`;
    };

    registerWelcomeWaves();
    let started = false;
    let frame: number | null = null;
    const syncVisibility = () => {
      frame = null;
      const bounds = page.getBoundingClientRect();
      const visible =
        !busyRef.current &&
        !document.hidden &&
        bounds.bottom > 0 &&
        bounds.top < window.innerHeight &&
        geometry.dataset.darkened !== "true" &&
        geometry.dataset.collapsed !== "true";
      viewport.setWavesSuspended(!visible);
      if (visible && !started) {
        updateBounds();
        viewport.startWaves(
          surface,
          page,
          titleRef?.current ?? undefined,
          descriptionRef?.current ?? undefined,
        );
        started = true;
      }
    };
    const scheduleVisibility = () => {
      if (busyRef.current) viewport.setWavesSuspended(true);
      if (frame === null) frame = requestAnimationFrame(syncVisibility);
    };
    syncVisibilityRef.current = scheduleVisibility;
    updateBounds();
    // Defer past StrictMode's probe and the entry page's initial scroll restore.
    scheduleVisibility();
    window.addEventListener("scroll", scheduleVisibility, { passive: true });
    document.addEventListener("visibilitychange", scheduleVisibility);
    const boundaries = new ResizeObserver(() => {
      updateBounds();
      scheduleVisibility();
    });
    for (const element of new Set([
      page,
      geometry,
      topBoundary,
      bottomBoundary,
    ]))
      boundaries.observe(element);
    return () => {
      syncVisibilityRef.current = null;
      if (frame !== null) cancelAnimationFrame(frame);
      window.removeEventListener("scroll", scheduleVisibility);
      document.removeEventListener("visibilitychange", scheduleVisibility);
      boundaries.disconnect();
      viewport.stopWaves();
    };
  }, [
    interactionRef,
    surfaceRef,
    topBoundaryRef,
    bottomBoundaryRef,
    titleRef,
    descriptionRef,
  ]);
  return (
    <a-waves
      ref={host}
      className={`${styles.waves} ${className}`}
      data-testid="welcome-waves"
      aria-hidden="true"
    >
      <canvas ref={canvas} data-welcome-wave-canvas />
    </a-waves>
  );
}
