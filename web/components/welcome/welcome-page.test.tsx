import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { NextIntlClientProvider } from "next-intl";
import { StrictMode, type PropsWithChildren } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { replace, scrollTo, createTrigger, kill } = vi.hoisted(() => ({
  replace: vi.fn(),
  scrollTo: vi.fn(),
  createTrigger: vi.fn(),
  kill: vi.fn(),
}));
vi.mock("gsap", () => ({ gsap: { registerPlugin: vi.fn() } }));
vi.mock("gsap/ScrollTrigger", () => ({
  ScrollTrigger: { create: createTrigger },
}));
vi.mock("@/i18n/navigation", () => ({
  useRouter: () => ({ replace }),
  usePathname: () => "/",
  Link: ({
    children,
    href,
    onNavigate: _onNavigate,
    ...props
  }: PropsWithChildren<{ href: string; onNavigate?: unknown }>) => {
    void _onNavigate;
    return (
      <a href={href} {...props}>
        {children}
      </a>
    );
  },
}));
vi.mock("@/components/entry/entry-language-switcher", () => ({
  EntryLanguageSwitcher: ({
    onBeforeSwitch,
  }: {
    onBeforeSwitch?: (locale: string) => void;
  }) => <button onClick={() => onBeforeSwitch?.("zh-CN")}>Language</button>,
}));
vi.mock("./welcome-waves", () => ({ WelcomeWaves: () => null }));

import { WELCOME_SESSION_KEY } from "@/features/welcome/welcome-state";
import { getMessages } from "@/i18n/messages";
import { ResearchEntryPage } from "@/components/entry/research-entry-page";
import {
  ENTRY_LOCALE_POSITION_KEY,
  type EntrySection,
} from "@/components/entry/use-entry-scroll";

function entry(
  locale: "en" | "zh-CN" = "en",
  initialSection: EntrySection = "welcome",
) {
  return (
    <StrictMode>
      <NextIntlClientProvider
        locale={locale}
        messages={getMessages(locale)}
        timeZone="UTC"
      >
        <ResearchEntryPage initialSection={initialSection} />
      </NextIntlClientProvider>
    </StrictMode>
  );
}

describe("continuous research entry", () => {
  beforeEach(() => {
    sessionStorage.clear();
    vi.clearAllMocks();
    createTrigger.mockReturnValue({ refresh: vi.fn(), kill });
    vi.stubGlobal("matchMedia", () => ({
      matches: false,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    }));
    vi.stubGlobal(
      "ResizeObserver",
      class {
        observe() {}
        disconnect() {}
      },
    );
    vi.spyOn(window, "scrollY", "get").mockReturnValue(0);
    scrollTo.mockImplementation(({ top }: { top: number }) => {
      vi.spyOn(window, "scrollY", "get").mockReturnValue(top);
      window.dispatchEvent(new Event("scroll"));
    });
    vi.stubGlobal("scrollTo", scrollTo);
    vi.spyOn(HTMLElement.prototype, "offsetTop", "get").mockImplementation(
      function (this: HTMLElement) {
        return this.dataset.testid === "research-menu" ? 768 : 0;
      },
    );
    vi.spyOn(HTMLElement.prototype, "offsetHeight", "get").mockReturnValue(768);
    vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(
      function (this: HTMLElement) {
        const top =
          this.dataset.testid === "research-menu" ? 768 - window.scrollY : 0;
        return {
          top,
          bottom: top + 768,
          left: 0,
          right: 1366,
          width: 1366,
          height: 768,
          x: 0,
          y: top,
          toJSON() {},
        };
      },
    );
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(null, { status: 204 }),
    );
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("mounts both sections and preserves the existing destinations without loading settings", () => {
    render(entry());
    expect(
      screen.getByRole("heading", { name: "Research Agent", level: 1 }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: "Choose your next step", level: 2 }),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "NEXT" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "NEW RESEARCH" })).toHaveAttribute(
      "href",
      "/research/new",
    );
    expect(screen.getByRole("link", { name: "history" })).toHaveAttribute(
      "href",
      "/history",
    );
    expect(document.querySelector("img")).toBeNull();
    expect(fetch).not.toHaveBeenCalled();
  });
  it("NEXT scrolls and remembers entry while keeping the menu mounted", async () => {
    const view = render(entry());
    const menu = screen.getByTestId("research-menu");
    fireEvent.click(screen.getByRole("button", { name: "NEXT" }));
    expect(sessionStorage.getItem(WELCOME_SESSION_KEY)).toBe("complete");
    expect(scrollTo).toHaveBeenLastCalledWith({ top: 768, behavior: "smooth" });
    expect(replace).not.toHaveBeenCalled();
    expect(screen.getByTestId("research-menu")).toBe(menu);
    await waitFor(() =>
      expect(screen.getByRole("heading", { level: 2 })).toHaveFocus(),
    );
    view.unmount();
    expect(kill).toHaveBeenCalled();
  });
  it("restores a completed session to the menu without redirecting", () => {
    sessionStorage.setItem(WELCOME_SESSION_KEY, "complete");
    render(entry());
    expect(scrollTo).toHaveBeenCalledWith({ top: 768, behavior: "instant" });
    expect(replace).not.toHaveBeenCalled();
  });
  it("direct workspace entry and both scroll buttons work with restricted storage", () => {
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("denied");
    });
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("denied");
    });
    render(entry("en", "menu"));
    expect(scrollTo).toHaveBeenCalledWith({ top: 768, behavior: "instant" });
    fireEvent.click(screen.getByRole("button", { name: "Research Agent" }));
    expect(scrollTo).toHaveBeenLastCalledWith({ top: 0, behavior: "smooth" });
    fireEvent.click(screen.getByRole("button", { name: "NEXT" }));
    expect(scrollTo).toHaveBeenLastCalledWith({ top: 768, behavior: "smooth" });
  });
  it("preserves partial squeeze position across a language remount", () => {
    const view = render(entry());
    act(() => window.scrollTo({ top: 400 }));
    fireEvent.click(
      within(screen.getByTestId("research-menu")).getByRole("button", {
        name: "Language",
      }),
    );
    expect(
      JSON.parse(sessionStorage.getItem(ENTRY_LOCALE_POSITION_KEY)!),
    ).toMatchObject({ locale: "zh-CN", pathname: "/", scrollY: 400 });
    view.rerender(entry("zh-CN"));
    expect(scrollTo).toHaveBeenLastCalledWith({
      top: 400,
      behavior: "instant",
    });
    expect(sessionStorage.getItem(ENTRY_LOCALE_POSITION_KEY)).toBeNull();
    expect(screen.getByText("你的 AI 科研伙伴")).toBeInTheDocument();
    expect(
      document.querySelector("[data-welcome-surface]")?.getAttribute("style"),
    ).toContain("--welcome-scale: 0.479");
  });
  it("supports keyboard entry and reverse navigation", async () => {
    const user = userEvent.setup();
    render(entry());
    screen.getByRole("button", { name: "NEXT" }).focus();
    await user.keyboard("{Enter}");
    expect(scrollTo).toHaveBeenLastCalledWith({ top: 768, behavior: "smooth" });
    fireEvent.click(screen.getByRole("button", { name: "Research Agent" }));
    expect(scrollTo).toHaveBeenLastCalledWith({ top: 0, behavior: "smooth" });
  });
});
