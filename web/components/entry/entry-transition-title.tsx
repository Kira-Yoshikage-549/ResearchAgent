"use client";

import {
  useContext,
  useLayoutEffect,
  useRef,
  type ComponentProps,
  type Ref,
} from "react";
import { useLocale } from "next-intl";
import { usePathname } from "@/i18n/navigation";
import { cn } from "@/lib/utils/cn";
import {
  EntryTransitionContext,
  normalizeEntryPath,
} from "./entry-transition-provider";
import { EntryTransitionWords } from "./entry-transition-words";
import styles from "./entry-transition.module.css";

type Props = Omit<ComponentProps<"h1">, "children" | "ref"> & {
  as?: "h1" | "h2";
  children: string;
  ref?: Ref<HTMLHeadingElement>;
};

export function EntryTransitionTitle({
  as: Heading = "h1",
  children,
  className,
  ref,
  ...props
}: Props) {
  const context = useContext(EntryTransitionContext);
  const pathname = usePathname();
  const locale = useLocale();
  const headingRef = useRef<HTMLHeadingElement>(null);
  const active =
    context?.busy && normalizeEntryPath(pathname) === context.target;
  const registerTitle = context?.registerTitle;
  useLayoutEffect(() => {
    if (active && headingRef.current)
      return registerTitle?.(headingRef.current);
  }, [active, registerTitle, children]);

  return (
    <Heading
      {...props}
      ref={(element) => {
        headingRef.current = element;
        if (typeof ref === "function") return ref(element);
        if (ref) ref.current = element;
      }}
      className={cn(className, styles.title)}
      tabIndex={props.tabIndex ?? -1}
      data-entry-title
      data-entry-title-active={active ? "true" : undefined}
      data-entry-title-phase={active ? context?.phase : undefined}
      aria-label={children}
    >
      {active ? (
        <span aria-hidden="true">
          <EntryTransitionWords text={children} locale={locale} />
        </span>
      ) : (
        children
      )}
    </Heading>
  );
}
