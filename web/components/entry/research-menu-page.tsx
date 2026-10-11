"use client";

import { ArrowRight } from "lucide-react";
import { useTranslations } from "next-intl";
import type { RefObject } from "react";
import { EntryLanguageSwitcher } from "@/components/entry/entry-language-switcher";
import { EntryTransitionLink } from "@/components/entry/entry-transition-link";
import { EntryTransitionTitle } from "./entry-transition-title";
import styles from "./research-menu-page.module.css";

export function ResearchMenuSection({
  sectionRef,
  headingRef,
  onBack,
  onLanguageSwitch,
}: {
  sectionRef: RefObject<HTMLElement | null>;
  headingRef: RefObject<HTMLHeadingElement | null>;
  onBack: () => void;
  onLanguageSwitch: (locale: string) => void;
}) {
  const t = useTranslations("entry");
  return (
    <section
      ref={sectionRef}
      className={styles.page}
      data-testid="research-menu"
      aria-labelledby="research-menu-title"
    >
      <div className={styles.canvas}>
        <header className={styles.header}>
          <button type="button" onClick={onBack} className={styles.brand}>
            Research Agent
          </button>
          <div className={styles.language}>
            <EntryLanguageSwitcher onBeforeSwitch={onLanguageSwitch} />
          </div>
        </header>
        <EntryTransitionTitle
          as="h2"
          id="research-menu-title"
          ref={headingRef}
          tabIndex={-1}
          className={styles.title}
        >
          {t("menuTitle")}
        </EntryTransitionTitle>
        <section className={styles.content} aria-label={t("menuTitle")}>
          <div className={styles.description}>
            <p>{t("partner")}</p>
            <p>{t("tagline")}</p>
          </div>
          <nav className={styles.actions} aria-label={t("menuTitle")}>
            <EntryTransitionLink
              href="/research/new"
              className={styles.action}
              data-entry-action
            >
              <span className={styles.actionContent}>
                <span className={styles.number} aria-hidden="true">
                  01
                </span>
                <span className={styles.label}>{t("newResearch")}</span>
                <ArrowRight aria-hidden="true" size={24} />
              </span>
            </EntryTransitionLink>
            <EntryTransitionLink
              href="/history"
              className={styles.action}
              data-entry-action
            >
              <span className={styles.actionContent}>
                <span className={styles.number} aria-hidden="true">
                  02
                </span>
                <span className={styles.label}>{t("history")}</span>
                <ArrowRight aria-hidden="true" size={24} />
              </span>
            </EntryTransitionLink>
            <EntryTransitionLink
              href="/settings"
              className={styles.action}
              data-entry-action
            >
              <span className={styles.actionContent}>
                <span className={styles.number} aria-hidden="true">
                  03
                </span>
                <span className={styles.label}>{t("settings")}</span>
                <ArrowRight aria-hidden="true" size={24} />
              </span>
            </EntryTransitionLink>
          </nav>
        </section>
        <footer className={`${styles.metadata} swiss-meta`}>
          <span>{new Date().getFullYear()}</span>
          <span>{t("location")}</span>
        </footer>
      </div>
    </section>
  );
}
