"use client";

import { PanelLeftOpen, PanelRightClose, PanelRightOpen } from "lucide-react";
import { useTranslations } from "next-intl";
import type { Ref } from "react";

import { StopResearchButton } from "@/components/research/task-cancellation";
import { LanguageSwitcher } from "@/components/shell/language-switcher";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useTask } from "@/features/tasks/hooks/use-task";
import { useReportNavigation } from "@/features/report/report-navigation";
import { useUiStore } from "@/stores/ui-store";
import styles from "./workspace-shell.module.css";

export function WorkspaceHeader({
  taskId,
  expandTaskSidebarRef,
  contextToggleRef,
  onToggleTaskSidebar,
  onToggleContextPanel,
}: {
  taskId?: string;
  expandTaskSidebarRef?: Ref<HTMLButtonElement>;
  contextToggleRef?: Ref<HTMLButtonElement>;
  onToggleTaskSidebar?: () => void;
  onToggleContextPanel?: () => void;
}) {
  const t = useTranslations();
  const storedTaskSidebarOpen = useUiStore((state) => state.isTaskSidebarOpen);
  const navigation = useReportNavigation();
  const isReportReading = Boolean(
    navigation?.report && navigation.activeTab === "report",
  );
  const isTaskSidebarOpen = navigation?.report
    ? navigation.isTaskSidebarOpen
    : storedTaskSidebarOpen;
  const isContextPanelOpen = useUiStore((state) => state.isContextPanelOpen);
  const storedToggleTaskSidebar = useUiStore(
    (state) => state.toggleTaskSidebar,
  );
  const toggleTaskSidebar = navigation?.report
    ? navigation.toggleTaskSidebar
    : storedToggleTaskSidebar;
  const toggleContextPanel = useUiStore((state) => state.toggleContextPanel);
  const setZenTaskId = useUiStore((state) => state.setZenTaskId);
  const taskQuery = useTask(taskId ?? "");
  const title = taskId
    ? (taskQuery.data?.title ?? t("task.researchTask"))
    : t("common.newResearch");

  return (
    <header className={styles.header}>
      <div className="flex min-w-0 flex-1 items-center gap-2">
        {!isTaskSidebarOpen && !isReportReading ? (
          <Button
            ref={expandTaskSidebarRef}
            aria-label={t("navigation.expandTaskSidebar")}
            aria-expanded={false}
            aria-controls="task-sidebar"
            onClick={onToggleTaskSidebar ?? toggleTaskSidebar}
            size="icon"
            variant="ghost"
            className="shrink-0"
          >
            <PanelLeftOpen aria-hidden="true" className="h-4 w-4" />
          </Button>
        ) : null}
        <div className="min-w-0 flex-1">
          <div className="flex min-w-0 items-center gap-2">
            <p
              title={title}
              className="min-w-0 truncate text-sm font-bold text-[var(--color-text)]"
            >
              {title}
            </p>
            {taskId ? (
              <Badge variant="info" className="shrink-0 whitespace-nowrap">
                {t("task.workspace")}
              </Badge>
            ) : null}
          </div>
        </div>
      </div>

      <div className="flex shrink-0 items-center gap-1 [&>button]:shrink-0">
        {taskId ? (
          <Button
            id={`enter-zen-${taskId}`}
            aria-label={t("task.enterZen")}
            disabled={!taskQuery.data}
            onClick={() => setZenTaskId(taskId)}
            size="sm"
            variant="ghost"
          >
            {t("task.zen")}
          </Button>
        ) : null}
        <StopResearchButton />
        <Button
          ref={contextToggleRef}
          aria-expanded={isContextPanelOpen}
          aria-controls="context-panel"
          aria-label={
            isContextPanelOpen
              ? t("common.collapseContext")
              : t("common.expandContext")
          }
          onClick={onToggleContextPanel ?? toggleContextPanel}
          size="icon"
          variant="ghost"
        >
          {isContextPanelOpen ? (
            <PanelRightClose aria-hidden="true" className="h-4 w-4" />
          ) : (
            <PanelRightOpen aria-hidden="true" className="h-4 w-4" />
          )}
        </Button>
        <LanguageSwitcher locked={Boolean(taskId)} />
      </div>
    </header>
  );
}
