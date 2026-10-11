"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useTranslations } from "next-intl";
import { useEffect, useId, useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";

import { WorkspacePage } from "@/components/shell/workspace-page";
import { DeepSeekSettingsSection } from "@/components/settings/deepseek-settings-section";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  ACADEMIC_SOURCES,
  DEFAULT_APP_PREFERENCES,
  usePreferencesStore,
} from "@/features/preferences/preferences-store";

import { EntryTransitionTitle } from "@/components/entry/entry-transition-title";
import styles from "./settings-page.module.css";

const settingsSchema = z.object({
  maxPapers: z.number().int().min(3).max(15),
  sources: z.array(z.enum(ACADEMIC_SOURCES)).min(1),
});

type SettingsValues = z.infer<typeof settingsSchema>;

function valuesFromStore(
  research: (typeof DEFAULT_APP_PREFERENCES)["research"],
): SettingsValues {
  return {
    maxPapers: research.maxPapers,
    sources: research.sources,
  };
}

export function SettingsPage() {
  const t = useTranslations("settings");
  const research = usePreferencesStore((state) => state.research);
  const hasHydrated = usePreferencesStore((state) => state.hasHydrated);
  const setResearchPreferences = usePreferencesStore(
    (state) => state.setResearchPreferences,
  );
  const [saved, setSaved] = useState(false);
  const form = useForm<SettingsValues>({
    resolver: zodResolver(settingsSchema),
    defaultValues: valuesFromStore(research),
  });

  useEffect(() => {
    if (hasHydrated && !form.formState.isDirty) {
      form.reset(valuesFromStore(research));
    }
  }, [form, form.formState.isDirty, hasHydrated, research]);

  function save(next: SettingsValues) {
    setResearchPreferences({
      maxPapers: next.maxPapers,
      sources: next.sources,
    });
    form.reset(next);
    setSaved(true);
  }

  function restoreDefaults() {
    setResearchPreferences(DEFAULT_APP_PREFERENCES.research);
    const defaults = valuesFromStore(DEFAULT_APP_PREFERENCES.research);
    form.reset(defaults);
    setSaved(true);
  }

  return (
    <WorkspacePage>
      <div className={styles.page}>
        <header className={styles.pageHeader}>
          <EntryTransitionTitle className={styles.pageTitle}>
            {t("title")}
          </EntryTransitionTitle>
          <p className={styles.pageDescription}>{t("description")}</p>
        </header>

        <div className={styles.settingsGrid}>
          <DeepSeekSettingsSection />
          <form
            aria-label={t("research.title")}
            className={styles.preferencesForm}
            onChange={() => setSaved(false)}
            onSubmit={(event) => void form.handleSubmit(save)(event)}
          >
            <SettingsSection
              title={t("research.title")}
              description={t("research.description")}
            >
              <div className={styles.researchFields}>
                <div>
                  <label className={styles.fieldLabel}>
                    {t("research.maxPapers")}
                    <Input
                      className={`${styles.input} ${styles.paperInput}`}
                      type="number"
                      min={3}
                      max={15}
                      aria-invalid={Boolean(form.formState.errors.maxPapers)}
                      aria-describedby={
                        form.formState.errors.maxPapers
                          ? "settings-max-papers-error"
                          : undefined
                      }
                      {...form.register("maxPapers", { valueAsNumber: true })}
                    />
                  </label>
                  {form.formState.errors.maxPapers ? (
                    <p
                      id="settings-max-papers-error"
                      className={styles.fieldError}
                    >
                      {t("research.maxPapersError")}
                    </p>
                  ) : null}
                </div>
                <fieldset
                  aria-describedby={
                    form.formState.errors.sources
                      ? "settings-sources-error"
                      : undefined
                  }
                >
                  <legend className={styles.fieldLabel}>
                    {t("research.sources")}
                  </legend>
                  <div className={styles.sourceOptions}>
                    {ACADEMIC_SOURCES.map((source) => (
                      <label key={source} className={styles.checkField}>
                        <input
                          type="checkbox"
                          value={source}
                          aria-invalid={Boolean(form.formState.errors.sources)}
                          {...form.register("sources")}
                        />
                        {t(`research.source.${source}`)}
                      </label>
                    ))}
                  </div>
                  {form.formState.errors.sources ? (
                    <p
                      id="settings-sources-error"
                      className={styles.fieldError}
                    >
                      {t("research.sourcesError")}
                    </p>
                  ) : null}
                </fieldset>
              </div>
            </SettingsSection>

            <div className={styles.preferenceActions}>
              <div className={styles.actionButtons}>
                <Button className={styles.primaryButton} type="submit">
                  {t("save")}
                </Button>
                <Button
                  className={styles.secondaryButton}
                  type="button"
                  variant="secondary"
                  onClick={restoreDefaults}
                >
                  {t("restoreDefaults")}
                </Button>
              </div>
              {saved ? (
                <p role="status" className={styles.success}>
                  {t("saved")}
                </p>
              ) : null}
            </div>
          </form>
        </div>
      </div>
    </WorkspacePage>
  );
}

function SettingsSection({
  title,
  description,
  children,
}: {
  title: string;
  description: string;
  children: React.ReactNode;
}) {
  const titleId = useId();
  return (
    <section className={styles.section} aria-labelledby={titleId}>
      <div className={styles.sectionHeading}>
        <h2 id={titleId} className={styles.sectionTitle}>
          {title}
        </h2>
        <p className={styles.sectionDescription}>{description}</p>
      </div>
      <div className={styles.sectionBody}>{children}</div>
    </section>
  );
}
