"use client";

import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { ReportDocument } from "@/components/report/report-document";
import { useTask } from "@/features/tasks/hooks/use-task";
import { useTaskResult } from "@/features/tasks/hooks/use-task-result";
import { useConversation } from "@/features/followup/conversation";
import { StopResearchButton } from "@/components/research/task-cancellation";
import { StageStepper } from "@/components/research/stage-stepper";
import { StageLoadingCenter } from "@/components/research/stage-loading-indicator";
import { useStageLoadingMotion } from "@/features/tasks/hooks/use-stage-loading-motion";
import { useReportReveal } from "./use-report-reveal";
import {
  taskStageMessageKeys,
  taskStatusMessageKeys,
} from "@/i18n/task-labels";
import { RESEARCH_STAGES } from "@/lib/events/types";
import { useTaskEvents } from "@/features/tasks/hooks/use-task-events";
import { useStageProgress } from "@/features/tasks/hooks/use-stage-progress";
import { exitTaskZen } from "@/features/tasks/task-zen-mode";
import { useUiStore } from "@/stores/ui-store";
import { useReportNavigation } from "@/features/report/report-navigation";
import {
  ChevronDown,
  ChevronUp,
  Minimize2,
  SendHorizontal,
} from "lucide-react";
import styles from "./workspace-task.module.css";

export function TaskConversation({
  taskId,
  children,
}: {
  taskId: string;
  children: ReactNode;
}) {
  const t = useTranslations("followup");
  const taskT = useTranslations("task");
  const task = useTask(taskId);
  const { replayState, isLoading, error } = useTaskEvents(taskId);
  const progress = useStageProgress(replayState);
  const isZen = useUiStore((store) => store.zenTaskId === taskId);
  const isReportPage = Boolean(useReportNavigation()?.report);
  const isReportZen = isZen && isReportPage;
  const isLiveZen = isZen && !isReportPage;
  const loading = useStageLoadingMotion(replayState);
  const [isExpanded, setIsExpanded] = useState(false);
  const toggleRef = useRef<HTMLButtonElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const exitRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (isLiveZen) exitRef.current?.focus();
  }, [isLiveZen]);
  const status = task.data?.status;
  const { query, submit, cancel } = useConversation(taskId, status);
  const result = useTaskResult(taskId, status === "completed");
  const [draft, setDraft] = useState("");
  const pendingRequest = useRef<{ message_id: string; message: string } | null>(
    null,
  );
  const scrollRegion = useRef<HTMLDivElement>(null);
  useReportReveal(
    scrollRegion,
    Boolean(
      replayState &&
      !isLoading &&
      !error &&
      !replayState.isTerminal &&
      !replayState.artifacts.resultAvailable,
    ),
    isReportPage && Boolean(result.data),
  );
  const normalScrollTop = useRef(0);
  const wasReportZen = useRef(false);
  useLayoutEffect(() => {
    const shouldRestore = wasReportZen.current && !isReportZen;
    wasReportZen.current = isReportZen;
    const region = scrollRegion.current;
    if (!region) return;
    if (isReportZen) region.scrollTop = 0;
    else if (shouldRestore) {
      const savedTop = normalScrollTop.current;
      // Wait for the restored Radix tab content to mount before setting its scroll.
      const frame = requestAnimationFrame(() => {
        region.scrollTop = savedTop;
      });
      return () => cancelAnimationFrame(frame);
    }
  }, [isReportZen]);
  const previousMessageCount = useRef<number | null>(null);
  const messageCount = query.data?.messages.length;
  useEffect(() => {
    if (messageCount !== undefined) {
      if (
        !isZen &&
        previousMessageCount.current !== null &&
        messageCount > previousMessageCount.current
      ) {
        scrollRegion.current?.scrollTo({
          top: scrollRegion.current.scrollHeight,
          behavior: "instant",
        });
      }
      previousMessageCount.current = messageCount;
    }
  }, [messageCount, isZen]);
  const pending = query.data?.pending;
  const unavailable =
    !status ||
    ["failed", "cancelled", "interrupted", "cancelling"].includes(status);
  const busy =
    pending?.status === "processing" || submit.isPending || cancel.isPending;
  const value = unavailable ? "" : draft;
  const send = async (message: string) => {
    const normalized = message.trim();
    if (pendingRequest.current?.message !== normalized) {
      pendingRequest.current = {
        message_id: crypto.randomUUID(),
        message: normalized,
      };
    }
    try {
      await submit.mutateAsync(pendingRequest.current);
      pendingRequest.current = null;
      setDraft("");
    } catch {
      /* The mutation owns the visible error; preserve the typed question. */
    }
  };
  return (
    <>
      <div
        ref={scrollRegion}
        hidden={isLiveZen}
        onScroll={(event) => {
          if (!isZen) normalScrollTop.current = event.currentTarget.scrollTop;
        }}
        className={styles.scrollRegion}
        data-report-scroll-region={isReportPage || undefined}
        data-testid="task-scroll-region"
      >
        {children}
        <section
          hidden={isReportZen}
          aria-label={t("history")}
          className={styles.conversation}
          style={!messageCount ? { padding: 0 } : undefined}
        >
          {query.data?.messages.map((message) => (
            <article
              key={`${message.message_id}:${message.role}`}
              data-role={message.role}
              className={styles.message}
            >
              <p className={styles.messageRole}>{t(message.role)}</p>
              {message.role === "assistant" ? (
                <ReportDocument
                  markdown={message.content}
                  result={result.data}
                  variant="message"
                />
              ) : (
                <p className={styles.messageText}>{message.content}</p>
              )}
            </article>
          ))}
        </section>
      </div>
      {isLiveZen ? (
        <section
          className={styles.zenView}
          data-testid="task-zen-view"
          aria-label={taskT("zen")}
        >
          <div className={styles.zenContent}>
            <h1 className={styles.zenTitle}>
              {replayState?.currentStage
                ? taskT(taskStageMessageKeys[replayState.currentStage])
                : taskT("waitingToStart")}
            </h1>
            <p role="status" className={styles.zenStatus}>
              {String(
                RESEARCH_STAGES.indexOf(
                  replayState?.currentStage ?? "orchestrate",
                ) + 1,
              ).padStart(2, "0")}{" "}
              / 07
              {" — "}
              {status
                ? taskT(taskStatusMessageKeys[status])
                : taskT("waitingToStart")}
            </p>
            <p className={styles.zenDescription}>{progress}</p>
          </div>
          {replayState ? (
            <div
              className={styles.zenIndicator}
              data-testid="zen-stage-loading"
            >
              <StageLoadingCenter state={replayState} loading={loading} />
            </div>
          ) : null}
          <Button
            ref={exitRef}
            className={styles.exitZen}
            variant="ghost"
            onClick={() => exitTaskZen(taskId)}
            aria-label={taskT("exitZen")}
          >
            <Minimize2 aria-hidden="true" className="h-4 w-4" />
            {taskT("exitZen")}
          </Button>
        </section>
      ) : null}
      <section
        hidden={isReportZen}
        aria-label={t("composer")}
        data-testid="followup-composer"
        className={styles.composer}
        data-zen={isZen || undefined}
      >
        <div className={styles.composerInner}>
          <div className={styles.progressRow}>
            {replayState && !isReportPage ? (
              <StageStepper
                state={replayState}
                loading={loading}
                variant={isZen ? "zen" : "default"}
              />
            ) : null}
            {!isZen ? (
              <Button
                ref={toggleRef}
                className={styles.composerToggle}
                size="sm"
                variant="ghost"
                aria-label={t(isExpanded ? "collapse" : "expand")}
                aria-expanded={isExpanded}
                aria-controls={`followup-body-${taskId}`}
                onClick={() => {
                  setIsExpanded(!isExpanded);
                  if (isExpanded) toggleRef.current?.focus();
                  else requestAnimationFrame(() => inputRef.current?.focus());
                }}
              >
                {isExpanded ? (
                  <ChevronDown aria-hidden="true" />
                ) : (
                  <ChevronUp aria-hidden="true" />
                )}
                {t(isExpanded ? "collapse" : "expand")}
                {pending ? (
                  <span className={styles.pendingDot} aria-hidden="true" />
                ) : null}
              </Button>
            ) : null}
          </div>
          <div
            id={`followup-body-${taskId}`}
            hidden={!isExpanded || isZen}
            className={styles.composerBody}
          >
            {pending && !unavailable ? (
              <div className={styles.pending}>
                <p role="status" className={styles.pendingStatus}>
                  {t(pending.status)}
                </p>
                <p className={styles.pendingText}>{pending.content}</p>
                {pending.status !== "processing" ? (
                  <div className="flex gap-2">
                    <Button
                      size="sm"
                      variant="ghost"
                      disabled={busy}
                      onClick={() => setDraft(pending.content)}
                    >
                      {t("edit")}
                    </Button>
                    {pending.status === "failed" ? (
                      <Button
                        size="sm"
                        disabled={busy}
                        onClick={() => void send(pending.content)}
                      >
                        {t("retry")}
                      </Button>
                    ) : null}
                    <Button
                      size="sm"
                      variant="ghost"
                      disabled={busy}
                      onClick={() => cancel.mutate()}
                    >
                      {t("cancel")}
                    </Button>
                  </div>
                ) : null}
              </div>
            ) : null}
            <form
              onSubmit={(event) => {
                event.preventDefault();
                if (value.trim() && !busy && !unavailable) void send(value);
              }}
            >
              <label htmlFor={`followup-${taskId}`} className="sr-only">
                {t("composer")}
              </label>
              <textarea
                ref={inputRef}
                id={`followup-${taskId}`}
                rows={2}
                maxLength={4000}
                value={value}
                disabled={unavailable || busy}
                onChange={(event) => setDraft(event.target.value)}
                placeholder={t(unavailable ? "unavailable" : "placeholder")}
                className={styles.question}
              />
              <div className={styles.composerActions}>
                <p>
                  {t(
                    unavailable
                      ? "unavailable"
                      : status === "completed"
                        ? "contextOnly"
                        : "queueHint",
                  )}
                </p>
                <div className="flex shrink-0 items-center gap-2">
                  <StopResearchButton prominent />
                  <Button
                    type="submit"
                    size="sm"
                    className={styles.send}
                    disabled={!value.trim() || busy || unavailable}
                  >
                    {t(pending?.status === "queued" ? "replace" : "send")}
                    <SendHorizontal
                      aria-hidden="true"
                      className="h-3.5 w-3.5"
                    />
                  </Button>
                </div>
              </div>
            </form>
            {query.isError || submit.isError || cancel.isError ? (
              <p
                role="alert"
                className="mt-2 text-sm text-[var(--color-error)]"
              >
                {t("error")}{" "}
                <button
                  className="underline"
                  onClick={() => void query.refetch()}
                >
                  {t("refresh")}
                </button>
              </p>
            ) : null}
          </div>
        </div>
      </section>
    </>
  );
}
