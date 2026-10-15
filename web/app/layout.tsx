import type { Metadata } from "next";
import { getLocale } from "next-intl/server";
import "@fontsource-variable/chiron-hei-hk/wght.css";
import "./globals.css";

import { Providers } from "@/app/providers";
import { DEFAULT_LOCALE, isAppLocale } from "@/i18n/locale";

export const metadata: Metadata = {
  title: "Research Agent",
  description: "A multi-agent academic research workspace.",
};

export default async function RootLayout({ children }: LayoutProps<"/">) {
  const requestedLocale = await getLocale();
  const locale = isAppLocale(requestedLocale)
    ? requestedLocale
    : DEFAULT_LOCALE;
  return (
    <html
      lang={locale}
      data-theme="light"
      className="h-full antialiased"
      suppressHydrationWarning
    >
      <body className="min-h-full flex flex-col">
        <Providers locale={locale} enforceDeepSeekSetup>
          {children}
        </Providers>
      </body>
    </html>
  );
}
