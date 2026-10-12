"use client";

import { gsap } from "gsap";
import { ScrollToPlugin } from "gsap/ScrollToPlugin";
import {
  useCallback,
  useContext,
  useLayoutEffect,
  useRef,
  type MouseEvent,
  type RefObject,
} from "react";
import { EntryTransitionContext } from "@/components/entry/entry-transition-provider";
import { useReportNavigation } from "@/features/report/report-navigation";
import type { ReportHeading } from "@/lib/markdown/report-headings";
import { useUiStore } from "@/stores/ui-store";
import {
  REPORT_SCROLL_DURATION,
  reportScrollEase,
} from "./report-scroll-motion";

type Navigate = (event: MouseEvent<HTMLAnchorElement>, id: string) => void;
type Destination = { region: HTMLElement; heading: HTMLElement };

function destinationTop({ region, heading }: Destination) {
  const margin =
    Number.parseFloat(getComputedStyle(heading).scrollMarginBlockStart) || 16;
  const top =
    region.scrollTop +
    heading.getBoundingClientRect().top -
    region.getBoundingClientRect().top -
    region.clientTop -
    margin;
  return Math.max(
    0,
    Math.min(top, Math.max(0, region.scrollHeight - region.clientHeight)),
  );
}

export function useReportAnchorScroll(
  navRef: RefObject<HTMLElement | null>,
  headings: ReportHeading[],
) {
  const navigation = useReportNavigation();
  const zenTaskId = useUiStore((state) => state.zenTaskId);
  const contextOpen = useUiStore((state) => state.isContextPanelOpen);
  const busy = useContext(EntryTransitionContext)?.busy ?? false;
  const navigate = useRef<Navigate | null>(null);

  useLayoutEffect(() => {
    let active: Destination | null = null;
    let tween: gsap.core.Tween | null = null;
    let observer: ResizeObserver | null = null;
    const media = window.matchMedia?.("(prefers-reduced-motion: reduce)");
    const cancel = () => {
      active = null;
      const previous = tween;
      tween = null;
      previous?.kill();
      observer?.disconnect();
      observer = null;
    };
    const finish = () => {
      const destination = active;
      cancel();
      if (!destination?.heading.isConnected || !destination.region.isConnected)
        return;
      destination.region.scrollTop = destinationTop(destination);
      if (!document.hidden) {
        if (!destination.heading.hasAttribute("tabindex"))
          destination.heading.tabIndex = -1;
        destination.heading.focus({ preventScroll: true });
      }
    };
    const onManualInput = (event: Event) => {
      if (
        active &&
        event.target instanceof Node &&
        active.region.contains(event.target)
      )
        cancel();
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (
        !event.defaultPrevented &&
        [
          "ArrowUp",
          "ArrowDown",
          "PageUp",
          "PageDown",
          "Home",
          "End",
          " ",
        ].includes(event.key) &&
        !(
          event.target instanceof Element &&
          event.target.closest("input, textarea, select, [contenteditable]")
        )
      )
        cancel();
    };
    const onVisibility = () => {
      if (document.hidden) finish();
    };
    const onPreference = () => {
      if (media?.matches) finish();
    };

    navigate.current = (event, id) => {
      const link = event.currentTarget;
      if (
        event.defaultPrevented ||
        event.button !== 0 ||
        event.metaKey ||
        event.ctrlKey ||
        event.shiftKey ||
        event.altKey ||
        (link.target && link.target !== "_self") ||
        link.hasAttribute("download")
      )
        return;
      const region = navRef.current
        ?.closest("[data-report]")
        ?.querySelector<HTMLElement>("[data-report-scroll-region]");
      const documentBody =
        region?.querySelector<HTMLElement>(".report-document");
      const heading =
        documentBody &&
        Array.from(
          documentBody.querySelectorAll<HTMLElement>(
            ":is(h1, h2, h3, h4, h5, h6)[id]",
          ),
        ).find((element) => element.id === id);
      if (!region || !heading || heading.closest("[hidden], [inert]") || busy)
        return;
      cancel();
      // pushState preserves the native anchor URL without its immediate scroll.
      // Retain Next's history state and do not add duplicate destinations.
      try {
        const hash = new URL(link.href).hash;
        if (window.location.hash !== hash)
          history.pushState(history.state, "", hash);
      } catch {
        return;
      }
      event.preventDefault();
      const destination = { region, heading };
      active = destination;
      const end = destinationTop(destination);
      if (
        media?.matches ||
        document.hidden ||
        Math.abs(region.scrollTop - end) < 1
      ) {
        finish();
        return;
      }
      try {
        gsap.registerPlugin(ScrollToPlugin);
        tween = gsap.to(region, {
          scrollTo: {
            y: end,
            autoKill: true,
            onAutoKill: () => {
              if (active === destination) cancel();
            },
          },
          duration: REPORT_SCROLL_DURATION,
          ease: reportScrollEase,
          onComplete: () => {
            if (active === destination) finish();
          },
        });
        if (typeof ResizeObserver !== "undefined") {
          const elements = [region, documentBody!];
          const sizes = elements.map((element) => {
            const rect = element.getBoundingClientRect();
            return [rect.width, rect.height];
          });
          observer = new ResizeObserver(() => {
            if (active !== destination) return;
            if (
              elements.some((element, index) => {
                const rect = element.getBoundingClientRect();
                return (
                  rect.width !== sizes[index][0] ||
                  rect.height !== sizes[index][1]
                );
              })
            )
              cancel();
          });
          elements.forEach((element) => observer!.observe(element));
        }
      } catch {
        finish();
      }
    };

    window.addEventListener("wheel", onManualInput, { passive: true });
    window.addEventListener("touchstart", onManualInput, { passive: true });
    window.addEventListener("pointerdown", onManualInput, { passive: true });
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("resize", cancel);
    window.addEventListener("popstate", cancel);
    window.addEventListener("hashchange", cancel);
    document.addEventListener("visibilitychange", onVisibility);
    media?.addEventListener("change", onPreference);
    return () => {
      navigate.current = null;
      cancel();
      window.removeEventListener("wheel", onManualInput);
      window.removeEventListener("touchstart", onManualInput);
      window.removeEventListener("pointerdown", onManualInput);
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("resize", cancel);
      window.removeEventListener("popstate", cancel);
      window.removeEventListener("hashchange", cancel);
      document.removeEventListener("visibilitychange", onVisibility);
      media?.removeEventListener("change", onPreference);
    };
  }, [
    navRef,
    headings,
    zenTaskId,
    contextOpen,
    busy,
    navigation?.activeTab,
    navigation?.isTaskSidebarOpen,
  ]);

  return useCallback<Navigate>(
    (event, id) => navigate.current?.(event, id),
    [],
  );
}
