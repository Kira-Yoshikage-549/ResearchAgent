"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useLocale, useTranslations } from "next-intl";
import { useEffect, useRef, useState } from "react";
import { useForm, useWatch, type FieldErrors } from "react-hook-form";
import { z } from "zod";
import { ArrowRight } from "lucide-react";

import { AdvancedSettings } from "@/components/research/advanced-settings";
import { ExampleQueries } from "@/components/research/example-queries";
import { InlineAlert } from "@/components/ui/inline-alert";
import { Skeleton } from "@/components/ui/skeleton";
import { useCreateTask } from "@/features/tasks/hooks/use-create-task";
import type { CreateTaskRequest } from "@/lib/api/client";
import {
  ACADEMIC_SOURCES,
  usePreferencesStore,
} from "@/features/preferences/preferences-store";
import { EntryTransitionLink as Link } from "@/components/entry/entry-transition-link";

import { EntryTransitionTitle } from "@/components/entry/entry-transition-title";
import styles from "./research-entry.module.css";

const sourceSchema = z.enum(ACADEMIC_SOURCES);

export const researchComposerSchema = z.object({
  query: z.string().trim().min(1).max(2000),
  maxPapers: z.number().int().min(3).max(15),
  sources: z.array(sourceSchema).min(1),
});

export type ResearchComposerValues = z.infer<typeof researchComposerSchema>;
export type CreateTaskResult = {
  task: { id: string };
  links: Record<string, string>;
};

const defaultValues: ResearchComposerValues = {
  query: "",
  maxPapers: 15,
  sources: ["arxiv", "semantic_scholar", "pubmed", "crossref"],
};

export function ResearchComposer({
  onCreated,
  createTask,
}: {
  onCreated?: (taskId: string) => void;
  createTask?: (request: CreateTaskRequest) => Promise<CreateTaskResult>;
}) {
  const locale = useLocale();
  const t = useTranslations();
  const mutation = useCreateTask();
  const requestId = useRef<string | null>(null);
  const submissionLock = useRef(false);
  const isComposing = useRef(false);
  const optionsDisclosure = useRef<HTMLDetailsElement>(null);
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [submitError, setSubmitError] = useState<unknown>(null);
  const [submissionPending, setSubmissionPending] = useState(false);
  const researchDefaults = usePreferencesStore((state) => state.research);
  const appliedDefaults = useRef<typeof researchDefaults | null>(null);
  const preferencesHydrated = usePreferencesStore((state) => state.hasHydrated);
  const form = useForm<ResearchComposerValues>({
    resolver: zodResolver(researchComposerSchema),
    defaultValues,
    mode: "onSubmit",
  });
  const formIsDirty = form.formState.isDirty;

  useEffect(() => {
    if (
      !preferencesHydrated ||
      formIsDirty ||
      appliedDefaults.current === researchDefaults
    )
      return;
    appliedDefaults.current = researchDefaults;
    // Hydrating preferences must never reset an in-progress question field.
    form.setValue("maxPapers", researchDefaults.maxPapers);
    form.setValue("sources", researchDefaults.sources);
  }, [form, formIsDirty, preferencesHydrated, researchDefaults]);
  const queryValue = useWatch({ control: form.control, name: "query" });

  const isSubmitting = submissionPending || mutation.isPending;

  async function onSubmit(values: ResearchComposerValues) {
    // State alone does not guard simultaneous keyboard/form submissions.
    if (submissionLock.current) return;
    submissionLock.current = true;
    setSubmissionPending(true);
    setSubmitError(null);
    requestId.current ??= createClientRequestId();
    const request: CreateTaskRequest = {
      client_request_id: requestId.current,
      query: values.query,
      options: {
        max_papers: values.maxPapers,
        sources: values.sources,
        output_language: locale === "zh-CN" ? "zh-CN" : "en",
      },
    };

    try {
      const response = createTask
        ? await createTask(request)
        : await mutation.mutateAsync(request);
      if (response.task.id) onCreated?.(response.task.id);
    } catch (error) {
      setSubmitError(error);
      submissionLock.current = false;
      setSubmissionPending(false);
    }
  }

  function onInvalid(errors: FieldErrors<ResearchComposerValues>) {
    if (!errors.maxPapers && !errors.sources) return;
    if (optionsDisclosure.current) optionsDisclosure.current.open = true;
    setAdvancedOpen(true);
  }

  function handleQueryKeyDown(event: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (
      isComposing.current ||
      event.nativeEvent.isComposing ||
      event.nativeEvent.keyCode === 229 ||
      isSubmitting
    )
      return;
    if ((event.ctrlKey || event.metaKey) && event.key === "Enter") {
      event.preventDefault();
      void form.handleSubmit(onSubmit, onInvalid)();
    }
  }

  const conflictTaskId = getConflictTaskId(submitError);
  const errors = form.formState.errors;

  return (
    <section className={styles.composer} aria-labelledby="new-research-title">
      <EntryTransitionTitle id="new-research-title" className={styles.title}>
        {t("entry.questionTitle")}
      </EntryTransitionTitle>
      <p className={styles.prompt}>{t("entry.questionPrompt")}</p>

      {submitError && conflictTaskId ? (
        <InlineAlert tone="warning" className={styles.alert}>
          {t("composer.conflict")}{" "}
          <Link
            className="font-bold underline"
            href={`/research/${encodeURIComponent(conflictTaskId)}`}
          >
            {t("composer.returnToActive")}
          </Link>
        </InlineAlert>
      ) : submitError ? (
        <InlineAlert tone="error" className={styles.alert}>
          {t("composer.createError")}
        </InlineAlert>
      ) : null}

      <form
        className={styles.form}
        onSubmit={(event) => void form.handleSubmit(onSubmit, onInvalid)(event)}
      >
        <label htmlFor="research-question" className={styles.questionLabel}>
          {t("composer.questionLabel")}
        </label>
        <textarea
          id="research-question"
          rows={4}
          aria-invalid={Boolean(errors.query)}
          aria-describedby="research-question-hint"
          placeholder={t("entry.questionPlaceholder")}
          className={styles.question}
          {...form.register("query")}
          onCompositionStart={() => {
            isComposing.current = true;
          }}
          onCompositionEnd={() => {
            isComposing.current = false;
          }}
          onKeyDown={handleQueryKeyDown}
        />
        <div className={styles.support}>
          <div className={styles.questionHint}>
            <span id="research-question-hint" aria-live="polite">
              {errors.query
                ? errors.query.type === "too_big"
                  ? t("composer.questionTooLong")
                  : t("composer.questionRequired")
                : t("composer.shortcut")}
            </span>
            <span className={styles.characterCount}>
              {queryValue.length}/2,000
            </span>
          </div>
          <div className={styles.sendRow}>
            <button
              className={styles.send}
              type="submit"
              disabled={isSubmitting}
            >
              {isSubmitting ? t("composer.starting") : t("entry.send")}
              <ArrowRight aria-hidden="true" size={18} />
            </button>
          </div>
          <details ref={optionsDisclosure} className={styles.options}>
            <summary className={styles.optionsSummary}>
              {t("entry.researchOptions")}
            </summary>
            <ExampleQueries
              onSelect={(query) =>
                form.setValue("query", query, {
                  shouldDirty: true,
                  shouldValidate: true,
                })
              }
            />
            <AdvancedSettings
              open={advancedOpen}
              onToggle={() => setAdvancedOpen((open) => !open)}
              register={form.register}
            />
            {errors.sources?.message ? (
              <p className="mt-2 text-xs text-[var(--color-error)]">
                {t("composer.selectSource")}
              </p>
            ) : null}
            {errors.maxPapers?.message ? (
              <p className="mt-2 text-xs text-[var(--color-error)]">
                {t("composer.maxPapersInvalid")}
              </p>
            ) : null}
          </details>
        </div>
      </form>
    </section>
  );
}

export function ResearchComposerSkeleton() {
  return (
    <section className={styles.composer} aria-busy="true">
      <Skeleton className="h-24 w-3/4" />
      <Skeleton className="mt-6 h-4 w-full max-w-xl" />
      <Skeleton className="mt-8 h-40 w-full" />
      <Skeleton className="mt-6 h-14 w-1/3" />
    </section>
  );
}

function createClientRequestId(): string {
  return (
    globalThis.crypto?.randomUUID?.() ??
    `research-${Date.now()}-${Math.random().toString(16).slice(2)}`
  );
}

function getConflictTaskId(error: unknown): string | null {
  if (!error || typeof error !== "object") return null;
  const candidate = error as { status?: number; details?: unknown };
  if (
    candidate.status !== 409 ||
    !candidate.details ||
    typeof candidate.details !== "object"
  )
    return null;
  const taskId = (candidate.details as { task_id?: unknown }).task_id;
  return typeof taskId === "string" ? taskId : null;
}
