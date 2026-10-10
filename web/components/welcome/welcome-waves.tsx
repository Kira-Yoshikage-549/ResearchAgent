"use client";

import { useEffect, useRef, type RefObject } from "react";
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
}: {
  className: string;
  interactionRef: RefObject<HTMLElement | null>;
  surfaceRef?: RefObject<HTMLElement | null>;
  topBoundaryRef: RefObject<HTMLElement | null>;
  bottomBoundaryRef: RefObject<HTMLElement | null>;
}) {
  const host = useRef<WelcomeWaveElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);

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
      // Keep the original canvas geometry while the welcome surface is collapsed.
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

    updateBounds();
    registerWelcomeWaves();
    viewport.startWaves(surface, page);
    const boundaries = new ResizeObserver(updateBounds);
    for (const element of new Set([
      page,
      geometry,
      topBoundary,
      bottomBoundary,
    ]))
      boundaries.observe(element);
    return () => {
      boundaries.disconnect();
      viewport.stopWaves();
    };
  }, [interactionRef, surfaceRef, topBoundaryRef, bottomBoundaryRef]);
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
