"use client";

import { useTranslations } from "next-intl";
import { HistoryList } from "@/components/history/history-list";
import { WorkspacePage } from "@/components/shell/workspace-page";
import { Button } from "@/components/ui/button";
import { InlineAlert } from "@/components/ui/inline-alert";
import { Skeleton } from "@/components/ui/skeleton";
import {
  useDeleteTask,
  useHistory,
  useRenameTask,
} from "@/features/history/hooks/use-history";
import { EntryTransitionLink } from "@/components/entry/entry-transition-link";
import { EntryTransitionTitle } from "@/components/entry/entry-transition-title";

import styles from "@/components/history/history.module.css";

export default function HistoryPage() {
  const t = useTranslations();
  const history = useHistory(100);
  const renameMutation = useRenameTask();
  const deleteMutation = useDeleteTask();
  const tasks = history.data ?? [];
  const activeTaskId = tasks.find((task) =>
    ["queued", "running", "cancelling"].includes(task.status),
  )?.id;

  return (
    <WorkspacePage>
      <div className={styles.page}>
        <header className={styles.intro}>
          <div className={styles.introContent}>
            <EntryTransitionTitle className={styles.title}>
              {t("history.title")}
            </EntryTransitionTitle>
            <p className={styles.description}>{t("history.description")}</p>
            <EntryTransitionLink
              href="/research/new"
              className={styles.createLink}
            >
              {t("navigation.newResearch")}
            </EntryTransitionLink>
          </div>
        </header>
        <div className={styles.content}>
          {history.isPending ? (
            <div
              className={styles.loading}
              role="status"
              aria-label={t("common.loading")}
            >
              <div className={styles.loadingFilters}>
                <Skeleton className="h-11" />
                <Skeleton className="h-11" />
                <Skeleton className="h-11" />
              </div>
              {[0, 1, 2].map((row) => (
                <div key={row} className={styles.loadingRow}>
                  <Skeleton className="h-5 w-2/5" />
                  <Skeleton className="mt-3 h-4 w-3/5" />
                  <Skeleton className="mt-4 h-5 w-1/4" />
                </div>
              ))}
            </div>
          ) : null}
          {history.isError ? (
            <div className={styles.errorState}>
              <InlineAlert tone="error" className={styles.errorAlert}>
                {t("history.loadError")}
              </InlineAlert>
              <Button
                variant="secondary"
                onClick={() => void history.refetch()}
                disabled={history.isFetching}
              >
                {history.isFetching ? t("common.loading") : t("common.retry")}
              </Button>
            </div>
          ) : null}
          {!history.isPending && !history.isError && !tasks.length ? (
            <section className={styles.emptyState}>
              <h2>{t("history.emptyTitle")}</h2>
              <p>{t("history.emptyDescription")}</p>
              <EntryTransitionLink
                href="/research/new"
                className={styles.emptyLink}
              >
                {t("history.createFirst")}
              </EntryTransitionLink>
            </section>
          ) : null}
          {!history.isPending && !history.isError && tasks.length ? (
            <HistoryList
              tasks={tasks}
              activeTaskId={activeTaskId}
              onRename={async (taskId, title) => {
                await renameMutation.mutateAsync({ taskId, title });
              }}
              onDelete={async (taskId) => {
                await deleteMutation.mutateAsync(taskId);
              }}
            />
          ) : null}
        </div>
      </div>
    </WorkspacePage>
  );
}
