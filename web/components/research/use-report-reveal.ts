"use client";

import { gsap } from "gsap";
import { useContext, useLayoutEffect, useRef, type RefObject } from "react";
import { EntryTransitionContext } from "@/components/entry/entry-transition-provider";

function interacting() {
  const element = document.activeElement;
  return (
    (element instanceof HTMLElement &&
      (element.matches("input, textarea, select") ||
        element.isContentEditable)) ||
    Boolean(window.getSelection()?.toString())
  );
}

/** Reveal only a report produced after a live view in this mounted task. */
export function useReportReveal(
  regionRef: RefObject<HTMLDivElement | null>,
  live: boolean,
  ready: boolean,
) {
  const sawLive = useRef(false);
  const consumed = useRef(false);
  const selectionActive = useRef(false);
  const previousLive = useRef(false);
  const selectionAtArrival = useRef(false);
  const navigationBusy = useContext(EntryTransitionContext)?.busy ?? false;

  useLayoutEffect(() => {
    const update = () => {
      selectionActive.current = Boolean(window.getSelection()?.toString());
    };
    update();
    document.addEventListener("selectionchange", update);
    return () => document.removeEventListener("selectionchange", update);
  }, []);

  useLayoutEffect(() => {
    if (live) sawLive.current = true;
    // Replacing the live DOM can collapse a selection before the report is ready.
    if (previousLive.current && !live)
      selectionAtArrival.current = selectionActive.current;
    previousLive.current = live;
    if (!ready || !sawLive.current || consumed.current) return;
    consumed.current = true;
    const region = regionRef.current;
    const motion = window.matchMedia?.("(prefers-reduced-motion: reduce)");
    if (
      !region ||
      document.hidden ||
      motion?.matches ||
      navigationBusy ||
      selectionAtArrival.current ||
      interacting()
    )
      return;

    const clipPath = region.style.clipPath;
    const willChange = region.style.willChange;
    const restore = () => {
      region.style.clipPath = clipPath;
      region.style.willChange = willChange;
      delete region.dataset.reportRevealing;
    };
    let tween: gsap.core.Tween | undefined;
    let active = true;
    const cancel = () => {
      if (!active) return;
      tween?.kill();
      finish();
    };
    const checkInteraction = () => {
      if (interacting()) cancel();
    };
    const hidden = () => {
      if (document.hidden) cancel();
    };
    const reduced = () => {
      if (motion?.matches) cancel();
    };
    const finish = () => {
      if (!active) return;
      active = false;
      restore();
      region.removeEventListener("pointerdown", cancel);
      region.removeEventListener("scroll", cancel);
      document.removeEventListener("focusin", checkInteraction);
      document.removeEventListener("selectionchange", checkInteraction);
      document.removeEventListener("visibilitychange", hidden);
      window.removeEventListener("resize", cancel);
      motion?.removeEventListener("change", reduced);
    };
    region.addEventListener("pointerdown", cancel);
    region.addEventListener("scroll", cancel, { passive: true });
    document.addEventListener("focusin", checkInteraction);
    document.addEventListener("selectionchange", checkInteraction);
    document.addEventListener("visibilitychange", hidden);
    window.addEventListener("resize", cancel);
    motion?.addEventListener("change", reduced);
    try {
      gsap.set(region, {
        clipPath: "inset(0% 0% 100% 0%)",
        willChange: "clip-path",
      });
      region.dataset.reportRevealing = "true";
      tween = gsap.to(region, {
        clipPath: "inset(0% 0% 0% 0%)",
        duration: 0.32,
        ease: "power3.out",
        onComplete: finish,
        onInterrupt: finish,
      });
    } catch {
      cancel();
    }
    return cancel;
  }, [live, ready, navigationBusy, regionRef]);
}
