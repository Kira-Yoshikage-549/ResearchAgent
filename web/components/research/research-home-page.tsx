"use client";

import { useTranslations } from "next-intl";
import { ArrowLeft, ArrowRight } from "lucide-react";

import { EntryLanguageSwitcher } from "@/components/entry/entry-language-switcher";
import { EntryTransitionLink } from "@/components/entry/entry-transition-link";
import { EntryTransitionTitle } from "@/components/entry/entry-transition-title";

import {
  ResearchComposer,
  ResearchComposerSkeleton,
} from "@/components/research/research-composer";
import { InlineAlert } from "@/components/ui/inline-alert";
import { useActiveTask } from "@/features/tasks/hooks/use-active-task";
import { Link, useRouter } from "@/i18n/navigation";
import { taskStatusMessageKeys } from "@/i18n/task-labels";

import styles from "./research-entry.module.css";

export default function ResearchHomePage() {
  const router = useRouter();
  const t = useTranslations();
  const activeTask = useActiveTask();

  return (
    <main className={styles.page} data-testid="research-question-page">
      <div className={styles.scene}>
        <nav className={styles.navigation}>
          <EntryTransitionLink
            href="/workspace"
            direction="backward"
            className={styles.back}
          >
            <ArrowLeft aria-hidden="true" size={16} />
            {t("entry.backToMenu")}
          </EntryTransitionLink>
          <EntryLanguageSwitcher />
        </nav>
        <div className={styles.content}>
          {activeTask.isPending ? <ResearchComposerSkeleton /> : null}
          {!activeTask.isPending && activeTask.data ? (
            <ActiveTaskSummary task={activeTask.data} />
          ) : null}
          {!activeTask.isPending && !activeTask.data ? (
            <>
              {activeTask.isError ? (
                <InlineAlert tone="warning" className={styles.alert}>
                  {t("composer.activeUnavailable")}
                </InlineAlert>
              ) : null}
              <ResearchComposer
                onCreated={(taskId) =>
                  router.push(`/research/${encodeURIComponent(taskId)}`)
                }
              />
            </>
          ) : null}
        </div>
        <aside className={styles.tips}>
          <h2>{t("entry.questionTipsTitle")}</h2>
          <p>{t("entry.questionTipsBody")}</p>
        </aside>
        <footer className={`${styles.metadata} swiss-meta`}>
          <span>{new Date().getFullYear()}</span>
          <span>{t("entry.location")}</span>
        </footer>
      </div>
    </main>
  );
}

function ActiveTaskSummary({
  task,
}: {
  task: {
    id: string;
    title: string;
    query: string;
    status: keyof typeof taskStatusMessageKeys;
  };
}) {
  const t = useTranslations();
  const taskT = useTranslations("task");
  return (
    <section className={styles.active}>
      <EntryTransitionTitle className={styles.activeTitle}>
        {task.title}
      </EntryTransitionTitle>
      <p className={styles.activeQuery}>{task.query}</p>
      <p className={styles.activeStatus}>
        {t("task.activeResearch")} · {taskT("statusLabel")}:{" "}
        {taskT(taskStatusMessageKeys[task.status])}
      </p>
      <Link
        href={`/research/${encodeURIComponent(task.id)}`}
        className={styles.returnToTask}
      >
        {t("task.returnToTask")}
        <ArrowRight aria-hidden="true" className="h-4 w-4" />
      </Link>
    </section>
  );
}
