import { useTranslations } from "next-intl";

import { Button } from "@/components/ui/button";
import { EntryTransitionLink as Link } from "@/components/entry/entry-transition-link";
import styles from "./workspace-task.module.css";

export function TaskTerminalState({
  status,
  onRetry,
}: {
  status: "completed" | "cancelled" | "interrupted";
  onRetry?: () => void;
}) {
  const t = useTranslations("task");
  const common = useTranslations("common");
  const copy = {
    completed: [t("completedTitle"), t("completedDescription")],
    cancelled: [t("cancelledTitle"), t("cancelledDescription")],
    interrupted: [t("interruptedTitle"), t("interruptedDescription")],
  } as const;
  const [title, description] = copy[status];

  return (
    <section role="status" className={styles.recovery}>
      <h2>{title}</h2>
      <p>{description}</p>
      <div className="mt-4 flex gap-2">
        {onRetry && status !== "completed" ? (
          <Button onClick={onRetry}>{t("retryResearch")}</Button>
        ) : null}
        <Link
          href="/history"
          className="inline-flex h-9 items-center border border-[var(--color-border-strong)] px-3 text-[13px] font-normal text-[var(--color-text)]"
        >
          {common("history")}
        </Link>
      </div>
    </section>
  );
}
