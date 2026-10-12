"use client";

import {
  useCallback,
  useContext,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type RefObject,
} from "react";
import { EntryTransitionContext } from "@/components/entry/entry-transition-provider";
import { ReportToc } from "@/components/report/report-toc";
import { TaskSidebar } from "@/components/shell/task-sidebar";
import { useReportNavigation } from "@/features/report/report-navigation";
import { useUiStore } from "@/stores/ui-store";
import styles from "./workspace-shell.module.css";
import { usePanelMotion } from "./use-panel-motion";

export function ReportSidebar({
  taskId,
  onCollapse,
  collapseButtonRef,
  instant = false,
}: {
  taskId?: string;
  onCollapse?: () => void;
  collapseButtonRef?: RefObject<HTMLButtonElement | null>;
  instant?: boolean;
}) {
  const navigation = useReportNavigation();
  const expandRef = useRef<HTMLButtonElement>(null);
  const localCollapseRef = useRef<HTMLButtonElement>(null);
  const collapseRef = collapseButtonRef ?? localCollapseRef;
  const overlayRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const restoreFocus = useRef(false);
  const busy = useContext(EntryTransitionContext)?.busy ?? false;
  const isZen = useUiStore((state) =>
    Boolean(taskId && state.zenTaskId === taskId),
  );
  const isOpen = navigation?.isTaskSidebarOpen ?? false;
  const isReading = navigation?.activeTab === "report";
  const [overlayVisible, setOverlayVisible] = useState(isOpen);
  const settled = useCallback((open: boolean) => {
    if (document.hidden) restoreFocus.current = false;
    setOverlayVisible(open);
  }, []);
  usePanelMotion(overlayRef, isReading ? isOpen : true, {
    instant: instant || isZen || busy || !isReading,
    resetKey: `${taskId}:${isZen}:${isReading}`,
    onSettled: settled,
  });
  const directoryBlocked = Boolean(isOpen || overlayVisible);
  const closeTaskSidebar = navigation?.closeTaskSidebar;
  const close = useCallback(() => {
    setOverlayVisible(true);
    restoreFocus.current = true;
    containerRef.current?.focus({ preventScroll: true });
    closeTaskSidebar?.();
  }, [closeTaskSidebar]);

  useLayoutEffect(() => {
    if (isOpen || !isReading || isZen || busy || document.hidden) {
      restoreFocus.current = false;
    } else if (!overlayVisible && restoreFocus.current) {
      // Restore after the interactive directory commits, including snap exits.
      const frame = requestAnimationFrame(() => {
        const shouldFocus = restoreFocus.current && !document.hidden;
        restoreFocus.current = false;
        if (shouldFocus) expandRef.current?.focus({ preventScroll: true });
      });
      return () => cancelAnimationFrame(frame);
    }
    if (isOpen && isReading && !isZen && !busy)
      collapseRef.current?.focus({ preventScroll: true });
  }, [isOpen, isReading, isZen, busy, collapseRef, overlayVisible]);

  useEffect(() => {
    if (!isOpen || !isReading || isZen) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !event.defaultPrevented) {
        event.preventDefault();
        close();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [isOpen, isReading, isZen, close]);

  if (!navigation?.report) return null;

  return (
    <div
      ref={containerRef}
      tabIndex={-1}
      className={styles.reportSidebar}
      data-testid="report-sidebar"
    >
      <div
        className={styles.reportTocSlot}
        hidden={!isReading || directoryBlocked}
        inert={directoryBlocked || !isReading}
        aria-hidden={directoryBlocked || !isReading || undefined}
      >
        <ReportToc
          headings={navigation.report.headingIndex.headings}
          loading={navigation.report.loading}
          onExpandTaskSidebar={navigation.toggleTaskSidebar}
          expandButtonRef={expandRef}
        />
      </div>
      <div
        ref={overlayRef}
        className={styles.reportTaskOverlay}
        inert={!isOpen || isZen}
        aria-hidden={!isOpen || isZen || undefined}
        data-testid="report-task-overlay"
      >
        <TaskSidebar
          taskId={taskId}
          onCollapse={
            isReading ? close : (onCollapse ?? navigation.toggleTaskSidebar)
          }
          collapseButtonRef={collapseRef}
        />
      </div>
    </div>
  );
}
