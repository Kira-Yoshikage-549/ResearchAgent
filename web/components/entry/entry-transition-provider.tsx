"use client";

import { gsap } from "gsap";
import { CustomEase } from "gsap/CustomEase";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
  type RefObject,
} from "react";
import { useLocale, useTranslations } from "next-intl";
import { usePathname, useRouter } from "@/i18n/navigation";
import { EntryTransitionWords } from "./entry-transition-words";
import styles from "./entry-transition.module.css";

export type EntryPath =
  | "/"
  | "/workspace"
  | "/research/new"
  | "/history"
  | "/settings"
  | `/research/${string}`;
export type EntryDirection = "forward" | "backward";
type TransitionMode = "entry" | "research";
type NavigateOptions = { replace?: boolean; direction?: EntryDirection };
type Phase =
  | "idle"
  | "covering"
  | "center-in"
  | "holding"
  | "center-out"
  | "title-in"
  | "uncovering";
type Navigation = {
  source: string;
  target: EntryPath;
  locale: string;
  origin: HTMLElement | null;
  heading: HTMLHeadingElement | null;
  surface: HTMLElement | null;
  mode: TransitionMode;
  direction: EntryDirection;
  dispatched: boolean;
  dispatch: () => void;
  resolve: () => void;
  ready: Promise<boolean>;
  markReady: (ready: boolean) => void;
  started: boolean;
};
type TransitionContext = {
  busy: boolean;
  target: EntryPath | null;
  phase: Phase;
  mode: TransitionMode;
  start: (
    href: EntryPath,
    dispatch: () => void,
    locale: string,
    direction?: EntryDirection,
  ) => Promise<void>;
  cancelForLocale: (locale: string) => void;
  registerTitle: (heading: HTMLHeadingElement) => () => void;
  registerSurface: (surface: HTMLElement) => () => void;
  cancel: () => void;
};
export const EntryTransitionContext = createContext<TransitionContext | null>(
  null,
);
const ROUTE_TIMEOUT_MS = 5000;
const MASK_EASE =
  "M0,0 C0.19,0 0.322,0.062 0.381,0.165 0.544,0.448 0.523,0.713 0.569,0.813 0.617,0.919 0.734,1 1,1";
const entryPaths = new Set<string>([
  "/",
  "/workspace",
  "/research/new",
  "/history",
  "/settings",
]);

export function normalizeEntryPath(pathname: string) {
  return (
    pathname.replace(/^\/(?:en|zh-CN)(?=\/|$)/, "").replace(/\/$/, "") || "/"
  );
}
function menuPath(path: string) {
  return path === "/" ? "/workspace" : path;
}
function isTaskPath(path: string) {
  return path !== "/research/new" && /^\/research\/[^/]+$/.test(path);
}
function staggerFor(words: Element[]) {
  return words.length > 1 ? Math.min(0.08, 0.24 / (words.length - 1)) : 0;
}

export function EntryTransitionProvider({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const locale = useLocale();
  const t = useTranslations("entry");
  const taskT = useTranslations("task");
  const [phase, setPhase] = useState<Phase>("idle");
  const [target, setTarget] = useState<EntryPath | null>(null);
  const [label, setLabel] = useState("");
  const [mode, setMode] = useState<TransitionMode>("entry");
  const [direction, setDirection] = useState<EntryDirection>("forward");
  const navigationRef = useRef<Navigation | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const tweenRef = useRef<gsap.core.Tween | null>(null);
  const settleTweenRef = useRef<((completed: boolean) => void) | null>(null);
  const sheetRef = useRef<HTMLDivElement>(null);
  const centerRef = useRef<HTMLDivElement>(null);
  const focusRef = useRef<HTMLElement | null>(null);
  const busy = phase !== "idle";

  const finish = useCallback((focus: HTMLElement | null = null) => {
    const navigation = navigationRef.current;
    navigationRef.current = null;
    if (timerRef.current !== null) clearTimeout(timerRef.current);
    timerRef.current = null;
    tweenRef.current?.kill();
    tweenRef.current = null;
    settleTweenRef.current?.(false);
    settleTweenRef.current = null;
    navigation?.markReady(false);
    focusRef.current = focus;
    setPhase("idle");
    setTarget(null);
    navigation?.resolve();
  }, []);
  const cancel = useCallback(() => finish(), [finish]);
  const cancelForLocale = useCallback(
    (nextLocale: string) => {
      if (navigationRef.current && navigationRef.current.locale !== nextLocale)
        finish();
    },
    [finish],
  );
  const registerTitle = useCallback((heading: HTMLHeadingElement) => {
    const navigation = navigationRef.current;
    if (!navigation) return () => {};
    navigation.heading = heading;
    navigation.markReady(true);
    if (timerRef.current !== null) clearTimeout(timerRef.current);
    timerRef.current = null;
    return () => {
      if (navigation.heading === heading) navigation.heading = null;
    };
  }, []);
  const registerSurface = useCallback((surface: HTMLElement) => {
    const navigation = navigationRef.current;
    if (!navigation || navigation.mode !== "research") return () => {};
    navigation.surface = surface;
    navigation.markReady(true);
    if (timerRef.current !== null) clearTimeout(timerRef.current);
    timerRef.current = null;
    return () => {
      if (navigation.surface === surface) navigation.surface = null;
    };
  }, []);
  const play = useCallback(
    (
      navigation: Navigation,
      elements: gsap.TweenTarget,
      vars: gsap.TweenVars,
    ) => {
      if (navigationRef.current !== navigation) return Promise.resolve(false);
      return new Promise<boolean>((resolve) => {
        settleTweenRef.current = resolve;
        tweenRef.current = gsap.to(elements, {
          ...vars,
          onComplete: () => {
            tweenRef.current = null;
            settleTweenRef.current = null;
            resolve(navigationRef.current === navigation);
          },
        });
      });
    },
    [],
  );

  useLayoutEffect(() => {
    const navigation = navigationRef.current;
    if (phase !== "covering" || !navigation || navigation.started) return;
    navigation.started = true;
    const sheet = sheetRef.current;
    if (!sheet) return finish(navigation.origin);
    if (navigation.mode === "research") {
      const sign = navigation.direction === "backward" ? -1 : 1;
      const run = async () => {
        gsap.set(sheet, { x: 0, xPercent: sign * 100 });
        if (
          !(await play(navigation, sheet, {
            xPercent: 0,
            duration: 0.18,
            ease: "power2.in",
          }))
        )
          return;
        setPhase("holding");
        timerRef.current = setTimeout(() => finish(), ROUTE_TIMEOUT_MS);
        try {
          navigation.dispatched = true;
          navigation.dispatch();
        } catch {
          finish(navigation.origin);
          return;
        }
        if (!(await play(navigation, {}, { duration: 0.4 }))) return;
        if (!(await navigation.ready) || navigationRef.current !== navigation)
          return;
        setPhase("uncovering");
        if (
          !(await play(navigation, sheet, {
            xPercent: sign * -100,
            duration: 0.24,
            ease: "power3.out",
          }))
        )
          return;
        const surface = navigation.surface;
        const heading =
          navigation.heading ??
          Array.from(
            surface?.querySelectorAll<HTMLElement>("h1, h2") ?? [],
          ).find((element) => element.getClientRects().length > 0);
        if (heading && !heading.hasAttribute("tabindex")) heading.tabIndex = -1;
        finish(heading ?? surface);
      };
      void run().catch(() => finish());
      return;
    }
    const center = centerRef.current;
    if (!sheet || !center) return finish(navigation.origin);
    const words = Array.from(center.querySelectorAll("[data-entry-word]"));
    gsap.registerPlugin(CustomEase);
    const ease = CustomEase.create("entry-mask", MASK_EASE);
    const run = async () => {
      gsap.set(sheet, { x: 0, xPercent: 100 });
      if (!(await play(navigation, sheet, { xPercent: 0, duration: 1, ease })))
        return;
      setPhase("center-in");
      // Cached destination routes may register their heading during dispatch.
      timerRef.current = setTimeout(() => finish(), ROUTE_TIMEOUT_MS);
      try {
        navigation.dispatched = true;
        navigation.dispatch();
      } catch {
        finish(navigation.origin);
        return;
      }
      if (
        !(await play(navigation, words, {
          yPercent: 0,
          y: 0,
          duration: 0.6,
          ease: "power3.out",
          stagger: staggerFor(words),
        }))
      )
        return;
      setPhase("holding");
      if (!(await play(navigation, {}, { duration: 0.15 }))) return;
      if (!(await navigation.ready) || navigationRef.current !== navigation)
        return;
      setPhase("center-out");
      if (
        !(await play(navigation, words, {
          yPercent: 115,
          duration: 0.6,
          ease: "power3.in",
          stagger: staggerFor(words),
        }))
      )
        return;
      const heading = navigation.heading;
      if (!heading?.isConnected) return finish();
      const titleWords = Array.from(
        heading.querySelectorAll("[data-entry-word]"),
      );
      setPhase("title-in");
      if (
        !(await play(navigation, titleWords, {
          yPercent: 0,
          y: 0,
          duration: 0.6,
          ease: "power3.out",
          stagger: staggerFor(titleWords),
        }))
      )
        return;
      setPhase("uncovering");
      if (
        !(await play(navigation, sheet, { xPercent: -100, duration: 1, ease }))
      )
        return;
      finish(heading);
    };
    void run().catch(() => finish());
  }, [phase, finish, play]);

  const start = useCallback(
    (
      href: EntryPath,
      dispatch: () => void,
      nextLocale: string,
      nextDirection?: EntryDirection,
    ): Promise<void> => {
      if (navigationRef.current) return Promise.resolve();
      const source = normalizeEntryPath(pathname);
      if (menuPath(source) === menuPath(href)) return Promise.resolve();
      const isHistorySettingsSwitch =
        (source === "/history" && href === "/settings") ||
        (source === "/settings" && href === "/history");
      const nextMode =
        isTaskPath(source) || isTaskPath(href) || isHistorySettingsSwitch
          ? "research"
          : "entry";
      if (
        !(entryPaths.has(source) || isTaskPath(source)) ||
        window.matchMedia?.("(prefers-reduced-motion: reduce)").matches
      ) {
        try {
          dispatch();
        } catch {
          /* Keep the current page usable. */
        }
        return Promise.resolve();
      }
      return new Promise<void>((resolve) => {
        let markReady!: (ready: boolean) => void;
        const ready = new Promise<boolean>((resolveReady) => {
          markReady = resolveReady;
        });
        navigationRef.current = {
          source,
          target: href,
          locale: nextLocale,
          dispatch,
          resolve,
          ready,
          markReady,
          origin:
            document.activeElement instanceof HTMLElement
              ? document.activeElement
              : null,
          heading: null,
          surface: null,
          mode: nextMode,
          direction:
            nextMode === "research" ? "forward" : (nextDirection ?? "forward"),
          dispatched: false,
          started: false,
        };
        setLabel(
          isTaskPath(href)
            ? taskT("researchTask")
            : href === "/research/new"
              ? t("transition.newResearch")
              : href === "/history"
                ? t("transition.history")
                : href === "/settings"
                  ? t("transition.settings")
                  : t("menuTitle"),
        );
        setMode(nextMode);
        setDirection(navigationRef.current.direction);
        setTarget(href);
        setPhase("covering");
      });
    },
    [pathname, t, taskT],
  );

  useLayoutEffect(() => {
    cancelForLocale(locale);
    const navigation = navigationRef.current;
    const current = normalizeEntryPath(pathname);
    if (
      navigation &&
      current !== navigation.source &&
      current !== navigation.target
    )
      finish();
  }, [pathname, locale, cancelForLocale, finish]);

  useLayoutEffect(() => {
    if (!busy) return;
    const preventScroll = (event: Event) => event.preventDefault();
    const preventKeys = (event: KeyboardEvent) => {
      if (!event.ctrlKey && !event.metaKey && !event.altKey)
        event.preventDefault();
    };
    const motion = window.matchMedia?.("(prefers-reduced-motion: reduce)");
    const motionChanged = () => {
      if (!motion?.matches) return;
      const navigation = navigationRef.current;
      if (navigation?.mode === "research" && !navigation.dispatched) {
        try {
          navigation.dispatched = true;
          navigation.dispatch();
        } catch {
          /* Release the mask even if routing fails. */
        }
      }
      finish();
    };
    // Keep scrollbar geometry and allow useEntryScroll's programmatic positioning.
    window.addEventListener("wheel", preventScroll, { passive: false });
    window.addEventListener("touchmove", preventScroll, { passive: false });
    window.addEventListener("keydown", preventKeys, true);
    motion?.addEventListener("change", motionChanged);
    return () => {
      window.removeEventListener("wheel", preventScroll);
      window.removeEventListener("touchmove", preventScroll);
      window.removeEventListener("keydown", preventKeys, true);
      motion?.removeEventListener("change", motionChanged);
    };
  }, [busy, finish]);

  useEffect(() => {
    if (busy) return;
    const focus = focusRef.current;
    focusRef.current = null;
    if (focus?.isConnected) focus.focus({ preventScroll: true });
  }, [busy]);
  useEffect(() => () => finish(), [finish]);
  useEffect(() => {
    window.addEventListener("popstate", cancel);
    return () => window.removeEventListener("popstate", cancel);
  }, [cancel]);
  useEffect(() => {
    const hidden = () => {
      if (document.hidden && navigationRef.current?.mode === "research")
        cancel();
    };
    document.addEventListener("visibilitychange", hidden);
    return () => document.removeEventListener("visibilitychange", hidden);
  }, [cancel]);

  const context = useMemo(
    () => ({
      start,
      cancelForLocale,
      registerTitle,
      cancel,
      busy,
      target,
      phase,
      mode,
      registerSurface,
    }),
    [
      start,
      cancelForLocale,
      registerTitle,
      registerSurface,
      cancel,
      busy,
      target,
      phase,
      mode,
    ],
  );
  return (
    <EntryTransitionContext.Provider value={context}>
      <div className={styles.content} inert={busy}>
        {children}
      </div>
      {busy ? (
        <>
          <span role="status" className="sr-only">
            {label}
          </span>
          <div
            className={styles.overlay}
            data-testid="entry-transition"
            data-phase={phase}
            data-mode={mode}
            data-direction={direction}
            aria-hidden="true"
          >
            <div
              ref={sheetRef}
              className={styles.sheet}
              data-testid="entry-transition-sheet"
            />
            {mode === "entry" ? (
              <div
                ref={centerRef}
                className={styles.center}
                data-testid="entry-transition-center"
              >
                <EntryTransitionWords text={label} locale={locale} />
              </div>
            ) : null}
          </div>
        </>
      ) : null}
    </EntryTransitionContext.Provider>
  );
}

/** A task's mounted shell is ready even when its data is loading or failed. */
export function useResearchTransitionReady(ref: RefObject<HTMLElement | null>) {
  const context = useContext(EntryTransitionContext);
  const pathname = usePathname();
  const active =
    context?.busy &&
    context.mode === "research" &&
    normalizeEntryPath(pathname) === context.target;
  const register = context?.registerSurface;
  useLayoutEffect(() => {
    if (active && ref.current) return register?.(ref.current);
  }, [active, ref, register]);
}

export function useEntryTransitionBlock(blocked: boolean) {
  const context = useContext(EntryTransitionContext);
  const cancel = context?.cancel;
  const busy = context?.busy;
  useEffect(() => {
    if (blocked && busy) cancel?.();
  }, [blocked, busy, cancel]);
}

export function useEntryNavigation(): {
  busy: boolean;
  navigate: (href: EntryPath, options?: NavigateOptions) => Promise<void>;
} {
  const context = useContext(EntryTransitionContext);
  const router = useRouter();
  const locale = useLocale();
  useEffect(() => {
    context?.cancelForLocale(locale);
  }, [context, locale]);
  const navigate = useCallback(
    (href: EntryPath, options: NavigateOptions = {}) => {
      const dispatch = () =>
        options.replace
          ? router.replace(href, { scroll: menuPath(href) !== "/workspace" })
          : router.push(href, { scroll: menuPath(href) !== "/workspace" });
      if (context)
        return context.start(href, dispatch, locale, options.direction);
      try {
        dispatch();
      } catch {
        /* Navigation failures must not lock the page. */
      }
      return Promise.resolve();
    },
    [context, locale, router],
  );
  return { navigate, busy: context?.busy ?? false };
}
