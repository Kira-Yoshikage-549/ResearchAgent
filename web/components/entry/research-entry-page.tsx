"use client";

import { useContext, useRef } from "react";
import { DeepSeekApiKeyGate } from "@/components/settings/deepseek-api-key-gate";
import { WelcomeSection } from "@/components/welcome/welcome-page";
import { DeepSeekSetupContext } from "@/features/settings/deepseek-setup-context";
import { ResearchMenuSection } from "./research-menu-page";
import { useEntryScroll, type EntrySection } from "./use-entry-scroll";
import styles from "./research-entry-page.module.css";

export function ResearchEntryPage({
  initialSection = "welcome",
}: {
  initialSection?: EntrySection;
}) {
  const welcomeRef = useRef<HTMLElement>(null);
  const surfaceRef = useRef<HTMLDivElement>(null);
  const menuRef = useRef<HTMLElement>(null);
  const menuHeadingRef = useRef<HTMLHeadingElement>(null);
  const nextRef = useRef<HTMLButtonElement>(null);
  const enforceSetup = useContext(DeepSeekSetupContext);
  const {
    menuReady,
    claimMenuEntranceSwap,
    scrollToSection,
    preserveLocalePosition,
  } = useEntryScroll({
    initialSection,
    welcomeRef,
    surfaceRef,
    menuRef,
    menuHeadingRef,
    nextRef,
  });
  const content = (
    <main className={styles.page} data-testid="research-entry">
      <WelcomeSection
        stageRef={welcomeRef}
        surfaceRef={surfaceRef}
        nextRef={nextRef}
        onEnter={() => scrollToSection("menu")}
        onLanguageSwitch={preserveLocalePosition}
        onKeyboardFocus={() => scrollToSection("welcome", true)}
      />
      <ResearchMenuSection
        sectionRef={menuRef}
        headingRef={menuHeadingRef}
        onBack={() => scrollToSection("welcome")}
        onLanguageSwitch={preserveLocalePosition}
        titleAnimationEnabled={menuReady}
        claimEntranceCharacterSwap={claimMenuEntranceSwap}
      />
    </main>
  );

  return enforceSetup ? (
    <DeepSeekApiKeyGate
      enabled={menuReady}
      mode="overlay"
      returnFocusRef={menuHeadingRef}
    >
      {content}
    </DeepSeekApiKeyGate>
  ) : (
    content
  );
}
