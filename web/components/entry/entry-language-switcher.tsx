"use client";

import { useLocale, useTranslations } from "next-intl";
import { useSearchParams } from "next/navigation";
import { LOCALE_COOKIE } from "@/i18n/locale";
import { usePathname, useRouter } from "@/i18n/navigation";
import styles from "./entry.module.css";

export function EntryLanguageSwitcher({
  onBeforeSwitch,
}: { onBeforeSwitch?: (locale: string) => void } = {}) {
  const locale = useLocale();
  const t = useTranslations("common");
  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();
  function switchLanguage() {
    const nextLocale = locale === "en" ? "zh-CN" : "en";
    onBeforeSwitch?.(nextLocale);
    document.cookie = `${LOCALE_COOKIE}=${nextLocale}; Path=/; Max-Age=31536000; SameSite=Lax`;
    const query = searchParams.toString();
    router.replace(`${pathname}${query ? `?${query}` : ""}`, {
      locale: nextLocale,
      scroll: false,
    });
  }
  return (
    <button
      type="button"
      className={styles.language}
      aria-label={t("languages")}
      onClick={switchLanguage}
    >
      {locale === "en" ? "简体中文" : "English"}
    </button>
  );
}
