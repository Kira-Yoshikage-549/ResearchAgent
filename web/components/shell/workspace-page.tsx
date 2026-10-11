"use client";

import type { ReactNode } from "react";
import { useTranslations } from "next-intl";

import { EntryTransitionLink } from "@/components/entry/entry-transition-link";
import { LanguageSwitcher } from "@/components/shell/language-switcher";
import { usePathname } from "@/i18n/navigation";
import { cn } from "@/lib/utils/cn";

import styles from "./workspace-page.module.css";

/** Shared navigation for the full-width library and preference pages. */
export function WorkspacePage({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  const t = useTranslations();
  const pathname = usePathname();

  return (
    <main className={cn(styles.page, className)}>
      <nav
        className={styles.navigation}
        aria-label={t("navigation.workspaceLinks")}
      >
        <EntryTransitionLink
          href="/workspace"
          direction="backward"
          className={styles.back}
        >
          {t("entry.backToMenu")}
        </EntryTransitionLink>
        <div className={styles.links}>
          <EntryTransitionLink
            href="/history"
            aria-current={pathname === "/history" ? "page" : undefined}
          >
            {t("navigation.history")}
          </EntryTransitionLink>
          <EntryTransitionLink
            href="/settings"
            aria-current={pathname === "/settings" ? "page" : undefined}
          >
            {t("settings.title")}
          </EntryTransitionLink>
        </div>
        <div className={styles.preferences}>
          <LanguageSwitcher />
          <span className={styles.edition}>
            {new Date().getFullYear()} / {t("common.local")}
          </span>
        </div>
      </nav>
      <div className={styles.content}>{children}</div>
    </main>
  );
}
