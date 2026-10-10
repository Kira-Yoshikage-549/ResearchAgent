"use client";

import { useTranslations } from "next-intl";
import {
  useState,
  type FormEvent,
  type ReactNode,
  type RefObject,
} from "react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@/components/ui/dialog";
import { InlineAlert } from "@/components/ui/inline-alert";
import { Input } from "@/components/ui/input";
import {
  useDeepSeekSettings,
  useUpdateDeepSeekSettings,
} from "@/features/settings/use-deepseek-settings";

import styles from "./settings-page.module.css";

const DEEPSEEK_PLATFORM_URL = "https://platform.deepseek.com/";

export function DeepSeekApiKeyGate({
  children,
  enabled = true,
  mode = "replace",
  returnFocusRef,
}: {
  children: ReactNode;
  enabled?: boolean;
  mode?: "replace" | "overlay";
  returnFocusRef?: RefObject<HTMLElement | null>;
}) {
  const t = useTranslations("settings.deepseek");
  const settingsQuery = useDeepSeekSettings({ enabled });
  const updateSettings = useUpdateDeepSeekSettings();
  const [apiKey, setApiKey] = useState("");
  const overlay = mode === "overlay";
  // Keep children in the same React slot while loading, gating and saving.
  const present = (gate: ReactNode) =>
    overlay ? (
      <>
        {children}
        {gate}
      </>
    ) : (
      gate
    );
  const block = (content: ReactNode) =>
    present(
      <BlockingDialog overlay={overlay} returnFocusRef={returnFocusRef}>
        {content}
      </BlockingDialog>,
    );

  if (!enabled) return overlay ? present(null) : children;

  if (settingsQuery.isPending) {
    // Avoid a transient focus trap while checking an already configured entry.
    // Destination routes retain their blocking gate until the query resolves.
    if (overlay)
      return present(
        <span role="status" className="sr-only">
          {t("checking")}
        </span>,
      );
    return (
      <main className={styles.gateLoading}>
        <p role="status">{t("checking")}</p>
      </main>
    );
  }

  if (settingsQuery.isError) {
    return block(
      <>
        <DialogTitle>{t("unavailableTitle")}</DialogTitle>
        <DialogDescription>{t("unavailableDescription")}</DialogDescription>
        <InlineAlert tone="error" className="mt-4">
          {t("unavailableError")}
        </InlineAlert>
        <div className="mt-5 flex justify-start">
          <Button
            type="button"
            disabled={settingsQuery.isFetching}
            onClick={() => void settingsQuery.refetch()}
          >
            {settingsQuery.isFetching ? t("retrying") : t("retry")}
          </Button>
        </div>
      </>,
    );
  }

  if (
    !settingsQuery.data.api_key_required ||
    settingsQuery.data.api_key_configured
  ) {
    return overlay ? present(null) : children;
  }

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    try {
      await updateSettings.mutateAsync({ api_key: apiKey });
      setApiKey("");
    } catch {
      // The mutation state renders a safe, localized error below.
    }
  }

  return block(
    <>
      <DialogTitle>{t("setupTitle")}</DialogTitle>
      <DialogDescription>{t("setupDescription")}</DialogDescription>
      <div className={styles.gateMetadata}>
        <MetadataItem label={t("providerLabel")} value="DeepSeek" />
        <MetadataItem
          label={t("defaultModelLabel")}
          value={settingsQuery.data.default_model}
        />
      </div>
      <form className="mt-5" onSubmit={(event) => void save(event)}>
        <label
          htmlFor="deepseek-api-key-setup"
          className="block text-sm font-bold text-[var(--color-text)]"
        >
          {t("apiKeyLabel")}
        </label>
        <Input
          id="deepseek-api-key-setup"
          className="mt-2"
          type="password"
          autoComplete="off"
          autoFocus
          maxLength={1000}
          required
          spellCheck={false}
          aria-describedby="deepseek-setup-key-note"
          aria-invalid={updateSettings.isError}
          value={apiKey}
          placeholder={t("setupPlaceholder")}
          onChange={(event) => {
            setApiKey(event.target.value);
            updateSettings.reset();
          }}
        />
        <p id="deepseek-setup-key-note" className="mt-2 text-xs leading-5">
          {t("deepSeekOnly")}
        </p>
        {updateSettings.isError ? (
          <InlineAlert tone="error" className="mt-3">
            {t("saveError")}
          </InlineAlert>
        ) : null}
        <div className="mt-6 flex flex-wrap items-center gap-6">
          <Button
            type="submit"
            disabled={!apiKey.trim() || updateSettings.isPending}
          >
            {updateSettings.isPending ? t("saving") : t("saveAndContinue")}
          </Button>
          <a
            href={DEEPSEEK_PLATFORM_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="text-xs font-bold text-[var(--color-primary)] hover:underline"
          >
            {t("openPlatform")}
          </a>
        </div>
      </form>
    </>,
  );
}

function BlockingDialog({
  children,
  overlay,
  returnFocusRef,
}: {
  children: ReactNode;
  overlay: boolean;
  returnFocusRef?: RefObject<HTMLElement | null>;
}) {
  return (
    <div className={overlay ? undefined : styles.gatePage}>
      <Dialog open onOpenChange={() => undefined}>
        <DialogContent
          className={styles.gateDialog}
          showCloseButton={false}
          onEscapeKeyDown={(event) => event.preventDefault()}
          onInteractOutside={(event) => event.preventDefault()}
          onPointerDownOutside={(event) => event.preventDefault()}
          onCloseAutoFocus={
            overlay
              ? (event) => {
                  event.preventDefault();
                  returnFocusRef?.current?.focus({ preventScroll: true });
                }
              : undefined
          }
        >
          {children}
        </DialogContent>
      </Dialog>
    </div>
  );
}
function MetadataItem({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-xs text-[var(--color-text-subtle)]">{label}</p>
      <p className="mt-2 font-bold text-[var(--color-text)]">{value}</p>
    </div>
  );
}
