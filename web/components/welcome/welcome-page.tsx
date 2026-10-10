"use client";

import { ArrowRight } from "lucide-react";
import { useTranslations } from "next-intl";
import { useRef, type RefObject } from "react";

import { EntryLanguageSwitcher } from "@/components/entry/entry-language-switcher";
import { WelcomeWaves } from "./welcome-waves";
import styles from "./welcome-page.module.css";

export function WelcomeSection({
  stageRef,
  surfaceRef,
  nextRef,
  onEnter,
  onLanguageSwitch,
  onKeyboardFocus,
}: {
  stageRef: RefObject<HTMLElement | null>;
  surfaceRef: RefObject<HTMLDivElement | null>;
  nextRef: RefObject<HTMLButtonElement | null>;
  onEnter: () => void;
  onLanguageSwitch: (locale: string) => void;
  onKeyboardFocus: () => void;
}) {
  const t = useTranslations("welcome");
  const entryT = useTranslations("entry");
  const composerT = useTranslations("composer");
  const headerRef = useRef<HTMLElement>(null);
  const footerRef = useRef<HTMLElement>(null);

  return (
    <section
      ref={stageRef}
      className={styles.stage}
      data-entry-page="welcome"
      aria-label="Research Agent"
    >
      <div
        ref={surfaceRef}
        className={styles.page}
        data-welcome-surface
        onFocus={(event) => {
          if (event.target.matches(":focus-visible")) onKeyboardFocus();
        }}
      >
        <WelcomeWaves
          className={styles.waves}
          interactionRef={stageRef}
          surfaceRef={surfaceRef}
          topBoundaryRef={headerRef}
          bottomBoundaryRef={footerRef}
        />
        <div className={styles.canvas} data-entry-canvas>
          <header ref={headerRef} className={styles.header}>
            <p className={styles.partner}>{t("partner")}</p>
            <div className={styles.language}>
              <EntryLanguageSwitcher onBeforeSwitch={onLanguageSwitch} />
            </div>
          </header>
          <h1 className={styles.brandTitle} aria-label="Research Agent">
            <span>Research</span>
            <span>Agent</span>
          </h1>
          <aside className={styles.description}>
            <p>{composerT("description")}</p>
            <p>{entryT("tagline")}</p>
          </aside>
          <button
            ref={nextRef}
            className={styles.nextButton}
            type="button"
            onClick={onEnter}
          >
            {t("next")}
            <ArrowRight aria-hidden="true" size={20} />
          </button>
          <footer ref={footerRef} className={`${styles.metadata} swiss-meta`}>
            <span>{new Date().getFullYear()}</span>
            <span>{entryT("location")}</span>
          </footer>
        </div>
      </div>
    </section>
  );
}
