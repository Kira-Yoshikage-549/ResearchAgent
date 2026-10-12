"use client";

import { Home, PanelLeftClose } from "lucide-react";
import { useTranslations } from "next-intl";
import type { Ref } from "react";

import { Button, buttonVariants } from "@/components/ui/button";
import { useHistory } from "@/features/history/hooks/use-history";
import { useTask } from "@/features/tasks/hooks/use-task";
import { cn } from "@/lib/utils/cn";
import { EntryTransitionLink as Link } from "@/components/entry/entry-transition-link";
import { useUiStore } from "@/stores/ui-store";
import styles from "./workspace-shell.module.css";

export function TaskSidebar({
  taskId,
  onCollapse,
  collapseButtonRef,
}: {
  taskId?: string;
  onCollapse?: () => void;
  collapseButtonRef?: Ref<HTMLButtonElement>;
}) {
  const t = useTranslations();
  const history = useHistory(20);
  const taskQuery = useTask(taskId ?? "");
  const toggleTaskSidebar = useUiStore((state) => state.toggleTaskSidebar);
  const currentTaskTitle = taskQuery.data?.title ?? t("task.researchTask");

  return (
    <aside
      id="task-sidebar"
      aria-label={t("navigation.taskNavigation")}
      className={styles.sidebar}
    >
      <div className={styles.brand}>
        <span className={styles.brandName}>{t("common.brand")}</span>
        <Button
          ref={collapseButtonRef}
          aria-label={t("navigation.collapseTaskSidebar")}
          aria-expanded={true}
          aria-controls="task-sidebar"
          onClick={onCollapse ?? toggleTaskSidebar}
          size="icon"
          variant="ghost"
        >
          <PanelLeftClose aria-hidden="true" className="h-4 w-4" />
        </Button>
      </div>

      <div className={styles.sidebarBody}>
        <Link
          href="/research/new"
          className={cn(
            buttonVariants({ variant: "primary" }),
            styles.newResearch,
          )}
        >
          <span className={styles.navIndex}>01</span>
          {t("navigation.newResearch")}
        </Link>

        <nav aria-label={t("navigation.workspaceLinks")} className="space-y-1">
          <Link href="/workspace" className={styles.navLink}>
            <Home aria-hidden="true" className="h-4 w-4" />
            {t("navigation.home")}
          </Link>
          <Link href="/history" className={styles.navLink}>
            <span className={styles.navIndex}>02</span>
            {t("navigation.history")}
          </Link>
        </nav>

        {taskId ? (
          <div className={styles.taskGroup}>
            <p className={styles.groupLabel}>{t("navigation.currentTask")}</p>
            <Link
              href={`/research/${encodeURIComponent(taskId)}`}
              className={cn(styles.taskLink, "mt-2")}
              aria-current="page"
              title={currentTaskTitle}
            >
              {currentTaskTitle}
            </Link>
          </div>
        ) : null}

        {history.data?.length ? (
          <div className={styles.taskGroup}>
            <p className={styles.groupLabel}>
              {t("navigation.recentResearch")}
            </p>
            <nav
              aria-label={t("navigation.recentResearch")}
              className="mt-2 space-y-1"
            >
              {history.data
                .filter((task) => task.id !== taskId)
                .slice(0, 20)
                .map((task) => (
                  <Link
                    key={task.id}
                    href={`/research/${encodeURIComponent(task.id)}`}
                    className={styles.taskLink}
                    title={task.title}
                  >
                    {task.title}
                  </Link>
                ))}
            </nav>
          </div>
        ) : null}
      </div>

      <div className={styles.footer}>
        <Link href="/settings" className={styles.navLink}>
          <span className={styles.navIndex}>03</span>
          {t("settings.title")}
        </Link>
        <p>
          {new Date().getFullYear()} / {t("common.local")}
        </p>
      </div>
    </aside>
  );
}
