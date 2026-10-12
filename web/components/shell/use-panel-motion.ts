"use client";

import { gsap } from "gsap";
import { useLayoutEffect, useRef, type RefObject } from "react";
import { PANEL_MOTION_DURATION, panelSpringEase } from "./panel-motion";

export function usePanelMotion(
  panelRef: RefObject<HTMLDivElement | null>,
  open: boolean,
  {
    surfaceRef = panelRef,
    property = "--panel-progress",
    instant = false,
    resetKey,
    onSettled,
  }: {
    surfaceRef?: RefObject<HTMLDivElement | null>;
    property?: string;
    instant?: boolean;
    resetKey?: string;
    onSettled?: (open: boolean) => void;
  } = {},
) {
  const progress = useRef({ value: Number(open) });
  const initialized = useRef(false);
  const previousKey = useRef(resetKey);
  const settledCallback = useRef(onSettled);
  useLayoutEffect(() => {
    settledCallback.current = onSettled;
  }, [onSettled]);

  useLayoutEffect(() => {
    const panel = panelRef.current;
    const surface = surfaceRef.current;
    if (!panel || !surface) return;
    const target = Number(open);
    const state = progress.current;
    const media = window.matchMedia?.("(prefers-reduced-motion: reduce)");
    const reset = previousKey.current !== resetKey;
    previousKey.current = resetKey;
    let tween: gsap.core.Tween | null = null;
    let cancelled = false;
    const paint = () =>
      surface.style.setProperty(property, String(state.value));
    const finish = () => {
      if (cancelled) return;
      tween = null;
      state.value = target;
      paint();
      panel.hidden = !open;
      panel.dataset.motion = "idle";
      settledCallback.current?.(open);
    };
    const settle = () => {
      tween?.kill();
      finish();
    };
    panel.hidden = false;
    paint();
    if (
      !initialized.current ||
      reset ||
      instant ||
      document.hidden ||
      media?.matches ||
      state.value === target
    ) {
      finish();
    } else {
      panel.dataset.motion = open ? "opening" : "closing";
      try {
        tween = gsap.to(state, {
          value: target,
          duration: PANEL_MOTION_DURATION,
          ease: panelSpringEase,
          onUpdate: paint,
          onComplete: finish,
        });
      } catch {
        finish();
      }
    }
    initialized.current = true;
    const onVisibility = () => {
      if (document.hidden) settle();
    };
    const onPreference = () => {
      if (media?.matches) settle();
    };
    document.addEventListener("visibilitychange", onVisibility);
    media?.addEventListener("change", onPreference);
    return () => {
      cancelled = true;
      tween?.kill();
      document.removeEventListener("visibilitychange", onVisibility);
      media?.removeEventListener("change", onPreference);
      panel.dataset.motion = "idle";
    };
  }, [panelRef, surfaceRef, open, property, instant, resetKey]);
}
