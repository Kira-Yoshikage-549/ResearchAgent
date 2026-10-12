"use client";

import { InlineAlert } from "@/components/ui/inline-alert";
import { Skeleton } from "@/components/ui/skeleton";
import { TaskErrorState } from "@/components/research/task-error-state";
import { TaskOfflineState } from "@/components/research/task-offline-state";
import { TaskTerminalState } from "@/components/research/task-terminal-state";
import { useTaskEvents } from "@/features/tasks/hooks/use-task-events";
import { useRetryTask } from "@/features/tasks/hooks/use-retry-task";
import { useEffect, useState } from "react";
import { TaskStageHero } from "@/components/research/task-stage-hero";
import { ReportView } from "@/components/report/report-view";
import { AgentReplay } from "@/components/replay/agent-replay";
import { ApiHttpError } from "@/lib/api/client";
import { useLocale, useTranslations } from "next-intl";
import { useRouter } from "@/i18n/navigation";
import { useEntryNavigation } from "@/components/entry/entry-transition-provider";
import styles from "./workspace-task.module.css";

export function LiveTaskView({ taskId }: { taskId: string }) {
  const { task, replayState, connectionStatus, isLoading, error } =
    useTaskEvents(taskId);
  const router = useRouter();
  const { navigate } = useEntryNavigation();
  const locale = useLocale();
  const t = useTranslations();
  const retryMutation = useRetryTask(taskId);
  const [isOffline, setIsOffline] = useState(
    () => typeof navigator !== "undefined" && !navigator.onLine,
  );

  useEffect(() => {
    const goOffline = () => setIsOffline(true);
    const goOnline = () => setIsOffline(false);
    window.addEventListener("offline", goOffline);
    window.addEventListener("online", goOnline);
    return () => {
      window.removeEventListener("offline", goOffline);
      window.removeEventListener("online", goOnline);
    };
  }, []);

  useEffect(() => {
    if (task && task.effective_locale !== locale) {
      router.replace(`/research/${encodeURIComponent(taskId)}`, {
        locale: task.effective_locale,
      });
    }
  }, [locale, router, task, taskId]);

  if (error) {
    if (error instanceof ApiHttpError && error.status === 404) {
      return (
        <div className={styles.feedback}>
          <InlineAlert tone="warning">{t("task.notFound")}</InlineAlert>
        </div>
      );
    }
    return (
      <div className={styles.feedback}>
        <InlineAlert tone="error">{t("task.loadError")}</InlineAlert>
        <details className="text-xs text-[var(--color-text-muted)]">
          <summary className="cursor-pointer">
            {t("common.technicalDetails")}
          </summary>
          <pre className="mt-2 whitespace-pre-wrap">{error.message}</pre>
        </details>
      </div>
    );
  }

  if (isLoading || !replayState || (task && task.effective_locale !== locale)) {
    return (
      <div className={styles.feedback}>
        <p role="status" className="text-xs">
          {t("common.loading")}
        </p>
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-20 w-full" />
        <Skeleton className="h-40 w-full" />
      </div>
    );
  }
  if (
    replayState.taskStatus === "completed" ||
    replayState.artifacts.resultAvailable
  ) {
    return <ReportView taskId={taskId} />;
  }

  return (
    <div className={styles.live}>
      {connectionStatus === "reconnecting" ? (
        <InlineAlert tone="warning">{t("task.reconnecting")}</InlineAlert>
      ) : null}
      {isOffline ? <TaskOfflineState /> : null}
      {replayState.taskStatus === "failed" ? (
        <TaskErrorState
          code={undefined}
          message={replayState.errors[0]}
          retryable
          onRetry={() => {
            void retryMutation.mutateAsync().then((task) => {
              if (task)
                void navigate(`/research/${encodeURIComponent(task.id)}`);
            });
          }}
        />
      ) : null}
      {["cancelled", "interrupted"].includes(replayState.taskStatus) ? (
        <TaskTerminalState
          status={
            replayState.taskStatus as "completed" | "cancelled" | "interrupted"
          }
          onRetry={() => {
            void retryMutation.mutateAsync().then((task) => {
              if (task)
                void navigate(`/research/${encodeURIComponent(task.id)}`);
            });
          }}
        />
      ) : null}
      <TaskStageHero state={replayState} />
      {replayState.isTerminal ? <AgentReplay taskId={taskId} /> : null}
    </div>
  );
}
