"use client";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { NextIntlClientProvider } from "next-intl";
import { useEffect, useState, type ReactNode } from "react";
import { usePathname as useRoutePathname } from "next/navigation";

import { DeepSeekApiKeyGate } from "@/components/settings/deepseek-api-key-gate";
import { TooltipProvider } from "@/components/ui/tooltip";
import { EntryTransitionProvider } from "@/components/entry/entry-transition-provider";
import { PreferencesHydrator } from "@/features/preferences/preferences-hydrator";
import { DEFAULT_LOCALE, type AppLocale } from "@/i18n/locale";
import { getMessages } from "@/i18n/messages";
import { usePathname } from "@/i18n/navigation";
import { DeepSeekSetupContext } from "@/features/settings/deepseek-setup-context";

export function Providers({
  children,
  locale = DEFAULT_LOCALE,
  enforceDeepSeekSetup = false,
}: {
  children: ReactNode;
  locale?: AppLocale;
  enforceDeepSeekSetup?: boolean;
}) {
  const [queryClient] = useState(() => new QueryClient());
  const routePathname = useRoutePathname();
  // Root layouts persist; their initial locale prop does not follow client navigation.
  const currentLocale =
    routePathname === null
      ? locale
      : /^\/en(?:\/|$)/.test(routePathname)
        ? "en"
        : DEFAULT_LOCALE;
  useEffect(() => {
    document.documentElement.lang = currentLocale;
  }, [currentLocale]);

  return (
    <QueryClientProvider client={queryClient}>
      <NextIntlClientProvider
        locale={currentLocale}
        messages={getMessages(currentLocale)}
        timeZone="UTC"
      >
        <TooltipProvider delayDuration={300}>
          <PreferencesHydrator />
          <DeepSeekSetupContext.Provider value={enforceDeepSeekSetup}>
            <EntryTransitionProvider>
              <AppContents enforceDeepSeekSetup={enforceDeepSeekSetup}>
                {children}
              </AppContents>
            </EntryTransitionProvider>
          </DeepSeekSetupContext.Provider>
        </TooltipProvider>
      </NextIntlClientProvider>
    </QueryClientProvider>
  );
}

function AppContents({
  children,
  enforceDeepSeekSetup,
}: {
  children: ReactNode;
  enforceDeepSeekSetup: boolean;
}) {
  const pathname = usePathname();
  // The localized navigation hook normally strips the locale prefix.
  const entryPath =
    pathname.replace(/^\/(?:en|zh-CN)(?=\/|$)/, "").replace(/\/$/, "") || "/";
  if (entryPath === "/" || entryPath === "/workspace") return children;

  return (
    <>
      {enforceDeepSeekSetup ? (
        <DeepSeekApiKeyGate>{children}</DeepSeekApiKeyGate>
      ) : (
        children
      )}
    </>
  );
}
