"use client";

import { useLayoutEffect, useRef } from "react";
import styles from "./menu-character-swap.module.css";

const highlightName = "menu-character-swap";
const copyHighlightName = "menu-character-copy";

export function segmentMenuCharacters(text: string, locale: string) {
  if (typeof Intl.Segmenter !== "function") return [];
  return Array.from(
    new Intl.Segmenter(locale, { granularity: "grapheme" }).segment(text),
    ({ segment, index }) => ({ text: segment, offset: index }),
  ).filter(({ text: character }) => !/^\s+$/u.test(character));
}

export function nextCharacterSwaps(
  count: number,
  previous: readonly number[],
  random = Math.random,
) {
  if (count <= 0) return [];
  const amount = 1 + Math.floor(random() * Math.min(4, count));
  const available = Array.from({ length: count }, (_, index) => index);
  return Array.from({ length: amount }, () => {
    const fresh = available.filter((index) => !previous.includes(index));
    const candidates = fresh.length ? fresh : available;
    const index = candidates[Math.floor(random() * candidates.length)];
    available.splice(available.indexOf(index), 1);
    return { index, direction: random() < 0.5 ? "up" : "down" } as const;
  });
}

export function characterSwapDelay(random = Math.random) {
  return 2000 + random() * 3000;
}

type CharacterWindow = {
  range: Range;
  left: number;
  top: number;
  width: number;
  height: number;
};

/** Native text owns shaping and selection; up to four glyph windows move together. */
export function MenuCharacterSwap({
  text,
  locale,
  enabled,
  claimEntranceSwap,
}: {
  text: string;
  locale: string;
  enabled: boolean;
  claimEntranceSwap?: () => boolean;
}) {
  const hostRef = useRef<HTMLSpanElement>(null);
  const sourceRef = useRef<HTMLSpanElement>(null);
  const layerRef = useRef<HTMLSpanElement>(null);
  const entrancePending = useRef<boolean | undefined>(undefined);

  useLayoutEffect(() => {
    const host = hostRef.current;
    const source = sourceRef.current;
    const layer = layerRef.current;
    if (!host || !source || !layer) return;
    // Unsupported measurement/highlight APIs leave the complete native title visible.
    if (
      !enabled ||
      typeof Highlight === "undefined" ||
      !globalThis.CSS?.highlights ||
      typeof Range.prototype.getBoundingClientRect !== "function"
    )
      return;

    // Keep the one-shot request through StrictMode's setup/cleanup rehearsal.
    entrancePending.current ??= claimEntranceSwap?.() ?? false;

    let disposed = false;
    let playbackGeneration = 0;
    let frame = 0;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let windows: CharacterWindow[] = [];
    let measuredSize: { width: number; height: number } | undefined;
    const elements = Array.from(
      layer.querySelectorAll<HTMLSpanElement>("[data-menu-character-window]"),
    );
    const active = new Map<
      HTMLSpanElement,
      { range: Range; copyRanges: Range[] }
    >();
    let previous: number[] = [];
    let round = 0;
    let playable = false;
    let fullyVisible = false;
    let fontsReady = !document.fonts;
    const preference = matchMedia("(prefers-reduced-motion: reduce)");

    const resetCharacter = (element: HTMLSpanElement) => {
      const character = active.get(element);
      if (!character) return;
      const highlight = CSS.highlights.get(highlightName);
      highlight?.delete(character.range);
      if (highlight?.size === 0) CSS.highlights.delete(highlightName);
      const copyHighlight = CSS.highlights.get(copyHighlightName);
      character.copyRanges.forEach((range) => copyHighlight?.delete(range));
      if (copyHighlight?.size === 0) CSS.highlights.delete(copyHighlightName);
      element.querySelectorAll("[data-menu-title-copy]").forEach((copy) => {
        copy.textContent = "";
      });
      delete element.dataset.swapDirection;
      delete element.dataset.swapIndex;
      active.delete(element);
      if (active.size) host.dataset.swapCount = String(active.size);
      else delete host.dataset.swapCount;
    };
    const resetMotion = () => {
      [...active.keys()].forEach(resetCharacter);
    };
    const animationEnded = (event: Event) => {
      const element = (event.target as HTMLElement).closest<HTMLSpanElement>(
        "[data-menu-character-window]",
      );
      if (element) resetCharacter(element);
    };
    const pause = () => {
      if (playable) entrancePending.current = false;
      playable = false;
      playbackGeneration++;
      clearTimeout(timer);
      timer = undefined;
      resetMotion();
    };
    const canPlay = () =>
      !disposed &&
      enabled &&
      fontsReady &&
      windows.length > 0 &&
      fullyVisible &&
      !document.hidden &&
      !preference.matches &&
      !host.closest('[aria-hidden="true"], [inert]');
    const playRound = () => {
      timer = undefined;
      if (!canPlay()) {
        pause();
        return;
      }
      resetMotion();
      const swaps = nextCharacterSwaps(windows.length, previous);
      previous = swaps.map(({ index }) => index);
      layer.style.setProperty(
        "--copy-width",
        `${source.getBoundingClientRect().width}px`,
      );
      layer.style.setProperty("--swap-color", getComputedStyle(source).color);
      const highlight = CSS.highlights.get(highlightName) ?? new Highlight();
      const copyHighlight =
        CSS.highlights.get(copyHighlightName) ?? new Highlight();
      swaps.forEach(({ index }, slot) => {
        const window = windows[index];
        const windowElement = elements[slot];
        Object.assign(windowElement.style, {
          left: `${window.left}px`,
          top: `${window.top}px`,
          width: `${window.width}px`,
          height: `${window.height}px`,
        });
        windowElement.style.setProperty("--copy-left", `${-window.left}px`);
        windowElement.style.setProperty("--copy-top", `${-window.top}px`);
        highlight.add(window.range);
        // Shape each complete copy, but paint only the selected glyph. This avoids
        // moving a neighboring glyph's overhang through the tightly tracked window.
        const copyRanges: Range[] = [];
        windowElement
          .querySelectorAll("[data-menu-title-copy]")
          .forEach((copy) => {
            copy.textContent = text;
            const range = document.createRange();
            range.setStart(copy.firstChild!, window.range.startOffset);
            range.setEnd(copy.firstChild!, window.range.endOffset);
            copyRanges.push(range);
            copyHighlight.add(range);
          });
        active.set(windowElement, { range: window.range, copyRanges });
      });
      CSS.highlights.set(highlightName, highlight);
      CSS.highlights.set(copyHighlightName, copyHighlight);
      // Commit all directions together so the CSS animations start in one frame.
      swaps.forEach(({ index, direction }, slot) => {
        elements[slot].dataset.swapIndex = String(index);
        elements[slot].dataset.swapDirection = direction;
      });
      host.dataset.swapCount = String(swaps.length);
      host.dataset.swapRound = String(++round);
      // The next timeout starts here, not after the one-second CSS animation.
      schedule();
    };
    const schedule = () => {
      timer = setTimeout(playRound, characterSwapDelay());
    };
    const syncPlayback = () => {
      if (!canPlay()) {
        if (
          document.hidden ||
          preference.matches ||
          host.closest('[aria-hidden="true"], [inert]')
        )
          entrancePending.current = false;
        pause();
      } else if (!playable) {
        playable = true;
        if (!entrancePending.current) {
          schedule();
          return;
        }
        entrancePending.current = false;
        const generation = playbackGeneration;
        const rows = host
          .closest("[data-entry-menu]")
          ?.querySelectorAll<HTMLElement>("[data-entry-action]");
        const animations = Array.from(rows ?? []).flatMap((row) =>
          row
            .getAnimations({ subtree: true })
            .filter(
              (animation) =>
                animation.playState !== "finished" &&
                animation.playState !== "idle",
            ),
        );
        // Wait for both the button translation and its longer paper-cover reveal.
        // A canceled entrance, departure or pause resumes with the ordinary wait.
        void Promise.all(
          animations.map((animation) => animation.finished),
        ).then(
          () => {
            if (generation === playbackGeneration && playable && canPlay())
              playRound();
          },
          () => {
            if (generation === playbackGeneration && playable && canPlay())
              schedule();
          },
        );
      }
    };
    const measure = () => {
      frame = 0;
      if (disposed) return;
      pause();
      windows = [];
      delete host.dataset.swapReady;
      try {
        const node = source.firstChild;
        if (!node || node.nodeType !== Node.TEXT_NODE) return;
        const origin = source.getBoundingClientRect();
        measuredSize = { width: origin.width, height: origin.height };
        const characters = segmentMenuCharacters(text, locale);
        const measured = characters.map(({ text: character, offset }) => {
          const range = document.createRange();
          range.setStart(node, offset);
          range.setEnd(node, offset + character.length);
          const rect = range.getBoundingClientRect();
          if (rect.width <= 0 || rect.height <= 0)
            throw new Error("Unmeasurable character");
          return {
            range,
            left: Math.floor(rect.left - origin.left) - 1,
            top: rect.top - origin.top,
            width:
              Math.ceil(rect.right - origin.left) -
              Math.floor(rect.left - origin.left) +
              2,
            height: rect.height,
          };
        });
        if (
          measured.length === 0 ||
          measured.some(({ width, height }) => width <= 0 || height <= 0)
        )
          return;
        windows = measured;
        host.dataset.swapReady = "true";
        syncPlayback();
      } catch {
        // Text stays native if a font or layout cannot be measured reliably.
      }
    };
    const requestMeasure = () => {
      pause();
      if (!frame && !disposed) frame = requestAnimationFrame(measure);
    };
    const fontsLoading = () => {
      fontsReady = false;
      pause();
    };
    const fontsLoaded = () => {
      fontsReady = true;
      requestMeasure();
    };
    const visibility = new IntersectionObserver(
      ([entry]) => {
        fullyVisible = entry.isIntersecting && entry.intersectionRatio >= 1;
        syncPlayback();
      },
      { threshold: [0, 1] },
    );
    visibility.observe(host);
    const resize = new ResizeObserver(() => {
      const { width, height } = source.getBoundingClientRect();
      // The observer's first notification may arrive after the initial rAF measure.
      // Ignore identical dimensions so it cannot cancel the pending entrance.
      if (width !== measuredSize?.width || height !== measuredSize?.height)
        requestMeasure();
    });
    resize.observe(source);
    // Radix's setup dialog hides/inerts the containing page while keeping it mounted.
    const occlusion = new MutationObserver(syncPlayback);
    occlusion.observe(document.body, {
      subtree: true,
      attributes: true,
      attributeFilter: ["aria-hidden", "inert"],
    });
    document.addEventListener("visibilitychange", syncPlayback);
    preference.addEventListener("change", syncPlayback);
    layer.addEventListener("animationend", animationEnded);
    document.fonts?.addEventListener("loading", fontsLoading);
    document.fonts?.addEventListener("loadingdone", fontsLoaded);
    document.fonts?.addEventListener("loadingerror", fontsLoaded);
    if (document.fonts)
      void document.fonts.ready.then(() => {
        if (!disposed) fontsLoaded();
      });
    else requestMeasure();

    return () => {
      disposed = true;
      pause();
      cancelAnimationFrame(frame);
      visibility.disconnect();
      resize.disconnect();
      occlusion.disconnect();
      document.removeEventListener("visibilitychange", syncPlayback);
      preference.removeEventListener("change", syncPlayback);
      layer.removeEventListener("animationend", animationEnded);
      document.fonts?.removeEventListener("loading", fontsLoading);
      document.fonts?.removeEventListener("loadingdone", fontsLoaded);
      document.fonts?.removeEventListener("loadingerror", fontsLoaded);
      delete host.dataset.swapReady;
      delete host.dataset.swapRound;
    };
  }, [text, locale, enabled, claimEntranceSwap]);

  return (
    <span ref={hostRef} className={styles.host} data-menu-character-swap>
      <span ref={sourceRef} className={styles.source} data-menu-title-source>
        {text}
      </span>
      <span ref={layerRef} className={styles.layer} aria-hidden="true">
        {[0, 1, 2, 3].map((slot) => (
          <span key={slot} className={styles.window} data-menu-character-window>
            <span className={styles.track}>
              <span className={styles.copy} data-menu-title-copy />
              <span className={styles.incoming} data-menu-title-copy />
            </span>
          </span>
        ))}
      </span>
    </span>
  );
}
