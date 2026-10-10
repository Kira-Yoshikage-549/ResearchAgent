"use client";

import { gsap } from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { useLocale } from "next-intl";
import {
  useCallback,
  useLayoutEffect,
  useRef,
  useState,
  type RefObject,
} from "react";
import { usePathname } from "@/i18n/navigation";
import { WELCOME_SESSION_KEY } from "@/features/welcome/welcome-state";

export type EntrySection = "welcome" | "menu";
export const ENTRY_LOCALE_POSITION_KEY =
  "research-agent.entry-locale-position.v1";

type EntryRefs = {
  initialSection: EntrySection;
  welcomeRef: RefObject<HTMLElement | null>;
  surfaceRef: RefObject<HTMLDivElement | null>;
  menuRef: RefObject<HTMLElement | null>;
  menuHeadingRef: RefObject<HTMLHeadingElement | null>;
  nextRef: RefObject<HTMLButtonElement | null>;
};

function rememberMenu() {
  try {
    sessionStorage.setItem(WELCOME_SESSION_KEY, "complete");
  } catch {
    // Scrolling and navigation remain available with restricted storage.
  }
}

export function useEntryScroll({
  initialSection,
  welcomeRef,
  surfaceRef,
  menuRef,
  menuHeadingRef,
  nextRef,
}: EntryRefs) {
  const locale = useLocale();
  const pathname = usePathname();
  const initialized = useRef(false);
  const focusDestination = useRef<EntrySection | null>(null);
  const [menuReady, setMenuReady] = useState(false);

  const scrollToSection = useCallback(
    (section: EntrySection, instant = false) => {
      const target = section === "menu" ? menuRef.current : welcomeRef.current;
      if (!target) return;
      if (section === "menu") rememberMenu();
      focusDestination.current = instant ? null : section;
      window.scrollTo({
        top: target.offsetTop,
        behavior:
          instant ||
          window.matchMedia("(prefers-reduced-motion: reduce)").matches
            ? "instant"
            : "smooth",
      });
    },
    [menuRef, welcomeRef],
  );

  const preserveLocalePosition = useCallback(
    (nextLocale: string) => {
      try {
        sessionStorage.setItem(
          ENTRY_LOCALE_POSITION_KEY,
          JSON.stringify({
            locale: nextLocale,
            pathname,
            scrollY: window.scrollY,
            createdAt: Date.now(),
          }),
        );
      } catch {
        // The router's scroll:false still preserves position without storage.
      }
    },
    [pathname],
  );

  useLayoutEffect(() => {
    const welcome = welcomeRef.current;
    const surface = surfaceRef.current;
    const menu = menuRef.current;
    if (!welcome || !surface || !menu) return;
    gsap.registerPlugin(ScrollTrigger);
    const motion = window.matchMedia("(prefers-reduced-motion: reduce)");
    let disposed = false;
    let settleTimer: ReturnType<typeof setTimeout> | null = null;
    let lastScroll = -1;
    const rows = Array.from(
      menu.querySelectorAll<HTMLElement>("[data-entry-action]"),
    );

    const updatePosition = () => {
      const height = welcome.offsetHeight || window.innerHeight;
      const progress = Math.max(
        0,
        Math.min(1, (window.scrollY - welcome.offsetTop) / height),
      );
      surface.style.setProperty(
        "--welcome-offset",
        `${motion.matches ? 0 : height * progress}px`,
      );
      surface.style.setProperty(
        "--welcome-scale",
        String(motion.matches ? 1 : 1 - progress),
      );
      surface.style.willChange =
        !motion.matches && progress > 0 && progress < 1 ? "transform" : "auto";
      surface.dataset.collapsed = String(progress >= 1);

      if (focusDestination.current === "welcome" && progress === 0) {
        focusDestination.current = null;
        nextRef.current?.focus({ preventScroll: true });
      }
      if (menu.getBoundingClientRect().top > 1) {
        if (settleTimer) clearTimeout(settleTimer);
        settleTimer = null;
        setMenuReady(false);
      } else if (window.scrollY !== lastScroll) {
        if (settleTimer) clearTimeout(settleTimer);
        settleTimer = setTimeout(() => {
          if (disposed || menu.getBoundingClientRect().top > 1) return;
          rememberMenu();
          if (focusDestination.current === "menu") {
            focusDestination.current = null;
            menuHeadingRef.current?.focus({ preventScroll: true });
          }
          setMenuReady(true);
        }, 120);
      }
      lastScroll = window.scrollY;
    };

    let restoreY: number | undefined;
    try {
      const saved = sessionStorage.getItem(ENTRY_LOCALE_POSITION_KEY);
      if (saved) {
        const position = JSON.parse(saved);
        if (
          position.locale === locale &&
          position.pathname === pathname &&
          Number.isFinite(position.scrollY) &&
          Date.now() - position.createdAt < 10_000
        ) {
          restoreY = Math.max(0, position.scrollY);
          sessionStorage.removeItem(ENTRY_LOCALE_POSITION_KEY);
        }
      }
      if (
        restoreY === undefined &&
        !initialized.current &&
        (initialSection === "menu" ||
          sessionStorage.getItem(WELCOME_SESSION_KEY) === "complete")
      ) {
        restoreY = menu.offsetTop;
      }
    } catch {
      if (!initialized.current && initialSection === "menu")
        restoreY = menu.offsetTop;
    }
    initialized.current = true;
    if (restoreY !== undefined)
      window.scrollTo({ top: restoreY, behavior: "instant" });

    const positionTrigger = ScrollTrigger.create({
      trigger: welcome,
      start: "top top",
      end: "bottom top",
      onUpdate: updatePosition,
      onRefresh: updatePosition,
    });
    const rowTriggers = rows.map((row) =>
      ScrollTrigger.create({
        trigger: row,
        start: "top 85%",
        onEnter: () => {
          row.dataset.revealed = "true";
        },
        onLeaveBack: () => {
          row.dataset.revealed = String(motion.matches);
        },
      }),
    );

    const syncMotion = () => {
      rows.forEach((row) => {
        row.dataset.revealed = String(
          motion.matches ||
            row.getBoundingClientRect().top <= window.innerHeight * 0.85,
        );
      });
      updatePosition();
    };
    const refresh = () => {
      if (disposed) return;
      positionTrigger.refresh();
      rowTriggers.forEach((trigger) => trigger.refresh());
      syncMotion();
    };
    const cancelFocus = () => {
      focusDestination.current = null;
    };
    const cancelKeyboardFocus = (event: KeyboardEvent) => {
      if (
        ["ArrowUp", "ArrowDown", "PageUp", "PageDown", "Home", "End"].includes(
          event.key,
        )
      )
        cancelFocus();
    };
    // ScrollTrigger drives the animation; this also tracks settled scroll past its end.
    window.addEventListener("scroll", updatePosition, { passive: true });
    window.addEventListener("wheel", cancelFocus, { passive: true });
    window.addEventListener("touchstart", cancelFocus, { passive: true });
    window.addEventListener("keydown", cancelKeyboardFocus);
    motion.addEventListener("change", syncMotion);
    const resize = new ResizeObserver(refresh);
    resize.observe(welcome);
    resize.observe(menu);
    document.fonts?.ready.then(refresh);
    syncMotion();

    return () => {
      disposed = true;
      if (settleTimer) clearTimeout(settleTimer);
      resize.disconnect();
      positionTrigger.kill();
      rowTriggers.forEach((trigger) => trigger.kill());
      window.removeEventListener("scroll", updatePosition);
      window.removeEventListener("wheel", cancelFocus);
      window.removeEventListener("touchstart", cancelFocus);
      window.removeEventListener("keydown", cancelKeyboardFocus);
      motion.removeEventListener("change", syncMotion);
    };
  }, [
    initialSection,
    locale,
    pathname,
    welcomeRef,
    surfaceRef,
    menuRef,
    menuHeadingRef,
    nextRef,
  ]);

  return { menuReady, scrollToSection, preserveLocalePosition };
}
