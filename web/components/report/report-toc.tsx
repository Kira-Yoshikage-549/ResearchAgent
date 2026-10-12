"use client";

import { useTranslations } from "next-intl";
import { PanelLeftOpen } from "lucide-react";

import type { ReportHeading } from "@/lib/markdown/report-headings";
import { useRef, type CSSProperties, type Ref } from "react";
import { Button } from "@/components/ui/button";
import styles from "./report-toc.module.css";
import { useReportAnchorScroll } from "./use-report-anchor-scroll";

export function ReportToc({
  headings,
  loading,
  onExpandTaskSidebar,
  expandButtonRef,
}: {
  headings: ReportHeading[];
  loading: boolean;
  onExpandTaskSidebar: () => void;
  expandButtonRef?: Ref<HTMLButtonElement>;
}) {
  const t = useTranslations();
  const navRef = useRef<HTMLElement>(null);
  const navigate = useReportAnchorScroll(navRef, headings);
  return (
    <nav ref={navRef} aria-label={t("report.contents")} className={styles.toc}>
      <div className={styles.header}>
        <Button
          ref={expandButtonRef}
          aria-label={t("navigation.expandTaskSidebar")}
          aria-expanded={false}
          aria-controls="task-sidebar"
          onClick={onExpandTaskSidebar}
          size="icon"
          variant="ghost"
        >
          <PanelLeftOpen aria-hidden="true" className="h-4 w-4" />
        </Button>
        <h2>{t("report.contents")}</h2>
      </div>
      {loading ? (
        <p role="status" className={styles.empty}>
          {t("common.loading")}
        </p>
      ) : headings.length ? (
        <ol className={styles.headings} data-testid="report-toc-list">
          {headings.map((heading) => (
            <li
              key={heading.id}
              style={
                {
                  "--toc-indent": `${Math.max(0, heading.level - 1) * 10}px`,
                } as CSSProperties
              }
            >
              <a
                href={`#${heading.id}`}
                onClick={(event) => navigate(event, heading.id)}
              >
                {heading.text}
              </a>
            </li>
          ))}
        </ol>
      ) : (
        <p className={styles.empty}>{t("report.noContents")}</p>
      )}
    </nav>
  );
}
