"use client";

import {
  useContext,
  useEffect,
  useLayoutEffect,
  useRef,
  useSyncExternalStore,
  type CSSProperties,
  type ReactNode,
} from "react";
import {
  EntryTransitionContext,
  useResearchTransitionReady,
} from "@/components/entry/entry-transition-provider";

import { ContextPanel } from "@/components/shell/context-panel";
import { ReportSidebar } from "@/components/shell/report-sidebar";
import { TaskSidebar } from "@/components/shell/task-sidebar";
import { WorkspaceHeader } from "@/components/shell/workspace-header";
import { useUiStore } from "@/stores/ui-store";
import { TaskConversation } from "@/components/research/task-conversation";
import { TaskEventsProvider } from "@/features/tasks/hooks/use-task-events";
import { TaskCancellationProvider } from "@/components/research/task-cancellation";
import { exitTaskZen } from "@/features/tasks/task-zen-mode";
import {
  ReportNavigationProvider,
  useReportNavigation,
} from "@/features/report/report-navigation";
import styles from "./workspace-shell.module.css";
import { usePanelMotion } from "./use-panel-motion";

export function ResearchShell({
  children,
  taskId,
}: {
  children: ReactNode;
  taskId?: string;
}) {
  const content = (
    <ResearchShellLayout taskId={taskId}>{children}</ResearchShellLayout>
  );
  return taskId ? (
    <TaskEventsProvider taskId={taskId}>
      <TaskCancellationProvider key={taskId} taskId={taskId}>
        <ReportNavigationProvider key={taskId}>
          {content}
        </ReportNavigationProvider>
      </TaskCancellationProvider>
    </TaskEventsProvider>
  ) : (
    content
  );
}

function ResearchShellLayout({
  children,
  taskId,
}: {
  children: ReactNode;
  taskId?: string;
}) {
  const mainRef = useRef<HTMLElement>(null);
  const shellRef = useRef<HTMLDivElement>(null);
  const leftRef = useRef<HTMLDivElement>(null);
  const rightRef = useRef<HTMLDivElement>(null);
  const expandRef = useRef<HTMLButtonElement>(null);
  const collapseRef = useRef<HTMLButtonElement>(null);
  const contextToggleRef = useRef<HTMLButtonElement>(null);
  const focusIntent = useRef<"open" | "close" | null>(null);
  useResearchTransitionReady(mainRef);
  const storedTaskSidebarOpen = useUiStore((state) => state.isTaskSidebarOpen);
  const navigation = useReportNavigation();
  const isReportReading = Boolean(
    navigation?.report && navigation.activeTab === "report",
  );
  const isTaskSidebarOpen = navigation?.report
    ? navigation.isTaskSidebarOpen
    : storedTaskSidebarOpen;
  const isContextPanelOpen = useUiStore((state) => state.isContextPanelOpen);
  const zenTaskId = useUiStore((state) => state.zenTaskId);
  const isZen = Boolean(taskId && zenTaskId === taskId);
  const navigationBusy = useContext(EntryTransitionContext)?.busy ?? false;
  const hydrated = useSyncExternalStore(
    useUiStore.persist.onFinishHydration,
    useUiStore.persist.hasHydrated,
    () => false,
  );
  const leftOpen = !isZen && (isReportReading || isTaskSidebarOpen);
  const rightOpen = !isZen && isContextPanelOpen;
  const instant = !hydrated || isZen || navigationBusy;
  const resetKey = `${taskId ?? "workspace"}:${isZen}`;
  usePanelMotion(leftRef, leftOpen, {
    surfaceRef: shellRef,
    property: "--left-progress",
    instant,
    resetKey,
  });
  usePanelMotion(rightRef, rightOpen, {
    surfaceRef: shellRef,
    property: "--right-progress",
    instant,
    resetKey,
  });
  const toggleLeft = () => {
    if (leftRef.current?.contains(document.activeElement))
      mainRef.current?.focus({ preventScroll: true });
    focusIntent.current = isTaskSidebarOpen ? "close" : "open";
    if (navigation?.report) navigation.toggleTaskSidebar();
    else useUiStore.getState().toggleTaskSidebar();
  };
  const toggleRight = () => {
    if (rightRef.current?.contains(document.activeElement))
      contextToggleRef.current?.focus({ preventScroll: true });
    useUiStore.getState().toggleContextPanel();
  };
  useLayoutEffect(() => {
    if (isZen || isReportReading) {
      focusIntent.current = null;
      return;
    }
    if (!focusIntent.current) return;
    (isTaskSidebarOpen ? collapseRef : expandRef).current?.focus({
      preventScroll: true,
    });
    focusIntent.current = null;
  }, [isTaskSidebarOpen, isZen, isReportReading]);
  useLayoutEffect(() => {
    const shell = shellRef.current;
    if (!shell || typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(([entry]) => {
      if (entry.contentRect.width > 0)
        shell.style.setProperty(
          "--workspace-column-width",
          `${(entry.contentRect.width - 24 * 11) / 12}px`,
        );
    });
    observer.observe(shell);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    void useUiStore.persist.rehydrate();
  }, []);

  useEffect(() => {
    useUiStore.getState().setZenTaskId(null);
    return () => {
      if (useUiStore.getState().zenTaskId === taskId) {
        useUiStore.getState().setZenTaskId(null);
      }
    };
  }, [taskId]);

  useEffect(() => {
    if (!isZen || !taskId) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        exitTaskZen(taskId);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [isZen, taskId]);

  return (
    <div
      ref={shellRef}
      className={styles.shell}
      style={
        {
          "--workspace-column-count": isZen
            ? 12
            : 7 + (leftOpen ? 0 : 2) + (rightOpen ? 0 : 3),
        } as CSSProperties
      }
      data-zen={isZen || undefined}
      data-report={Boolean(navigation?.report) || undefined}
      data-sidebar={isTaskSidebarOpen ? "open" : "closed"}
      data-left-rail={isReportReading || isTaskSidebarOpen ? "open" : "closed"}
      data-context={isContextPanelOpen ? "open" : "closed"}
    >
      <div
        ref={leftRef}
        className={styles.leftViewport}
        inert={!leftOpen}
        aria-hidden={!leftOpen || undefined}
        data-testid="left-panel-viewport"
      >
        <div className={styles.leftContents}>
          {navigation?.report ? (
            <ReportSidebar
              taskId={taskId}
              onCollapse={toggleLeft}
              collapseButtonRef={collapseRef}
              instant={instant}
            />
          ) : (
            <TaskSidebar
              taskId={taskId}
              onCollapse={toggleLeft}
              collapseButtonRef={collapseRef}
            />
          )}
        </div>
      </div>
      <main ref={mainRef} tabIndex={-1} className={styles.main}>
        <div hidden={isZen} className={styles.headerSlot}>
          <WorkspaceHeader
            taskId={taskId}
            expandTaskSidebarRef={expandRef}
            contextToggleRef={contextToggleRef}
            onToggleTaskSidebar={toggleLeft}
            onToggleContextPanel={toggleRight}
          />
        </div>
        {taskId ? (
          <TaskConversation key={taskId} taskId={taskId}>
            {children}
          </TaskConversation>
        ) : (
          <div className={styles.content}>{children}</div>
        )}
      </main>
      <div
        ref={rightRef}
        className={styles.rightViewport}
        inert={!rightOpen}
        aria-hidden={!rightOpen || undefined}
        data-testid="right-panel-viewport"
      >
        <div className={styles.rightContents}>
          <ContextPanel taskId={taskId} />
        </div>
      </div>
    </div>
  );
}
