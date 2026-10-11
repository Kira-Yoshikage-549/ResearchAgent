"use client";

import { useTranslations } from "next-intl";

import type { ResearchStage, ReplayState } from "@/lib/events/types";
import type { TaskStageLoading } from "@/features/tasks/hooks/use-stage-loading-motion";
import { StageLoadingIndicator } from "./stage-loading-indicator";
import { RESEARCH_STAGES } from "@/lib/events/types";
import {
  taskStageMessageKeys,
  taskStageStatusMessageKeys,
} from "@/i18n/task-labels";
import styles from "./workspace-task.module.css";

export function StageStepper({
  state,
  loading,
  onSelectStage,
  variant = "default",
}: {
  state: ReplayState;
  loading: TaskStageLoading;
  onSelectStage?: (stage: ResearchStage) => void;
  variant?: "default" | "zen";
}) {
  const t = useTranslations("task");
  const stages = RESEARCH_STAGES;
  const Item = onSelectStage ? "button" : "div";
  return (
    <nav
      aria-label={t("stageDetail")}
      className={styles.stages}
      data-variant={variant}
    >
      {stages.map((stage, index) => {
        const snapshot = state.stages[stage];
        return (
          <Item
            key={stage}
            type={onSelectStage ? "button" : undefined}
            role={onSelectStage ? undefined : "group"}
            aria-label={
              t(taskStageMessageKeys[stage]) +
              " " +
              t(taskStageStatusMessageKeys[snapshot.status])
            }
            data-status={snapshot.status}
            aria-current={state.currentStage === stage ? "step" : undefined}
            data-interactive={Boolean(onSelectStage) || undefined}
            onClick={() => onSelectStage?.(stage)}
            className={styles.stage}
          >
            <span className={styles.stageNode}>
              <span>{String(index + 1).padStart(2, "0")}</span>
              <StageLoadingIndicator
                motion={loading.stages[stage]}
                loading={loading}
                size={variant === "zen" ? "zen-rail" : "rail"}
              />
            </span>
            <span className={styles.stageName}>
              {t(taskStageMessageKeys[stage])}
            </span>
            <span className={styles.stageStatus}>
              {t(taskStageStatusMessageKeys[snapshot.status])}
            </span>
            {stage === "critic" && snapshot.attempt > 1 ? (
              <span className={styles.stageAttempt}>
                {t("attempt", { attempt: snapshot.attempt })}
              </span>
            ) : null}
          </Item>
        );
      })}
    </nav>
  );
}
