"use client";

import type { ComponentProps } from "react";
import { Link } from "@/i18n/navigation";
import {
  useEntryNavigation,
  type EntryDirection,
  type EntryPath,
} from "./entry-transition-provider";

type Props = Omit<ComponentProps<typeof Link>, "href" | "onNavigate"> & {
  href: EntryPath;
  direction?: EntryDirection;
};

export function EntryTransitionLink({
  href,
  direction,
  replace,
  ...props
}: Props) {
  const { navigate, busy } = useEntryNavigation();
  return (
    <Link
      {...props}
      href={href}
      replace={replace}
      aria-disabled={busy || props["aria-disabled"]}
      onNavigate={(event) => {
        event.preventDefault();
        void navigate(href, { replace, direction });
      }}
    />
  );
}
