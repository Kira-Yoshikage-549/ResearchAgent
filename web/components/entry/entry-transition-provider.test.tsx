import { act, fireEvent, render, screen } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { StrictMode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getMessages } from "@/i18n/messages";
import { usePathname } from "@/i18n/navigation";
import { EntryTransitionLink } from "./entry-transition-link";
import { EntryTransitionTitle } from "./entry-transition-title";
import {
  EntryTransitionProvider,
  useEntryNavigation,
  useEntryTransitionBlock,
} from "./entry-transition-provider";

const animation = vi.hoisted(() => ({
  pending: [] as {
    complete: () => void;
    kill: ReturnType<typeof vi.fn>;
    duration: number;
  }[],
}));
vi.mock("gsap", () => ({
  gsap: {
    registerPlugin: vi.fn(),
    set: vi.fn(),
    to: vi.fn(
      (
        _target: unknown,
        vars: { onComplete: () => void; duration: number },
      ) => {
        const tween = {
          complete: vars.onComplete,
          kill: vi.fn(),
          duration: vars.duration,
        };
        animation.pending.push(tween);
        return tween;
      },
    ),
  },
}));
vi.mock("gsap/CustomEase", () => ({
  CustomEase: { create: () => (value: number) => value },
}));

function Controls({
  showTitle = true,
  blocked = false,
}: {
  showTitle?: boolean;
  blocked?: boolean;
}) {
  const { navigate, busy } = useEntryNavigation();
  const pathname = usePathname();
  useEntryTransitionBlock(blocked);
  return (
    <>
      <button onClick={() => void navigate("/history", { replace: true })}>
        Replace history
      </button>
      <EntryTransitionLink href="/research/new">
        New research
      </EntryTransitionLink>
      <EntryTransitionLink href="/workspace" direction="backward">
        Back to menu
      </EntryTransitionLink>
      <EntryTransitionLink href="/history">History</EntryTransitionLink>
      <EntryTransitionLink href="/settings">Settings</EntryTransitionLink>
      {showTitle ? (
        <EntryTransitionTitle>
          {pathname.includes("history")
            ? "Research history"
            : pathname.includes("settings")
              ? "Settings"
              : pathname.includes("new")
                ? "NEW RESEARCH"
                : "Choose your next step"}
        </EntryTransitionTitle>
      ) : null}
      <output>{busy ? "Pending navigation" : "Ready"}</output>
    </>
  );
}

function tree(locale: "en" | "zh-CN" = "en", options = {}) {
  return (
    <StrictMode>
      <NextIntlClientProvider locale={locale} messages={getMessages(locale)}>
        <EntryTransitionProvider>
          <Controls {...options} />
        </EntryTransitionProvider>
      </NextIntlClientProvider>
    </StrictMode>
  );
}

async function complete() {
  const tween = animation.pending.shift();
  expect(tween).toBeDefined();
  await act(async () => {
    tween!.complete();
  });
}
async function finishAnimation() {
  for (let i = 0; i < 6; i++) await complete();
}
function phase() {
  return screen.getByTestId("entry-transition").getAttribute("data-phase");
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
  window.history.replaceState({}, "", "/workspace");
  animation.pending = [];
  vi.stubGlobal("matchMedia", undefined);
});
afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("masked entry navigation", () => {
  it("covers before dispatch, blocks repeated input and reveals the actual heading before uncovering", async () => {
    const push = vi.spyOn(window.history, "pushState");
    render(tree());
    fireEvent.click(screen.getByRole("link", { name: "New research" }));
    fireEvent.click(screen.getByRole("link", { name: "Settings" }));
    expect(push).not.toHaveBeenCalled();
    expect(phase()).toBe("covering");
    expect(
      screen.getByText("Pending navigation").closest("[inert]"),
    ).not.toBeNull();
    expect(animation.pending[0].duration).toBe(1);
    await complete();
    expect(push).toHaveBeenCalledTimes(1);
    expect(window.location.pathname).toBe("/research/new");
    expect(phase()).toBe("center-in");
    expect(screen.getByTestId("entry-transition-center").textContent).toBe(
      "New Research",
    );
    await complete();
    expect(phase()).toBe("holding");
    await complete();
    expect(phase()).toBe("center-out");
    await complete();
    expect(phase()).toBe("title-in");
    const title = screen.getByRole("heading", {
      name: "NEW RESEARCH",
      hidden: true,
    });
    expect(title).toHaveAttribute("data-entry-title-phase", "title-in");
    await complete();
    expect(phase()).toBe("uncovering");
    await complete();
    expect(screen.queryByTestId("entry-transition")).not.toBeInTheDocument();
    expect(screen.getByText("Ready").closest("[inert]")).toBeNull();
    expect(title).toHaveFocus();
  });

  it.each([
    "/",
    "/workspace",
    "/en/workspace",
    "/zh-CN/workspace",
    "/history",
    "/settings",
    "/research/new",
  ])(
    "animates entry links from %s including the embedded menu",
    async (source) => {
      window.history.replaceState({}, "", source);
      render(tree(source.includes("zh-CN") ? "zh-CN" : "en"));
      fireEvent.click(screen.getByRole("button", { name: "Replace history" }));
      if (source === "/history") {
        expect(
          screen.queryByTestId("entry-transition"),
        ).not.toBeInTheDocument();
        return;
      }
      expect(window.location.pathname).toBe(source);
      await finishAnimation();
      expect(window.location.pathname).toBe("/history");
      expect(screen.getByText("Ready")).toBeInTheDocument();
    },
  );

  it("waits for a real destination heading and releases a stalled destination after five seconds", async () => {
    render(tree("en", { showTitle: false }));
    fireEvent.click(screen.getByRole("link", { name: "New research" }));
    await complete();
    await complete();
    await complete();
    expect(phase()).toBe("holding");
    await act(async () => {
      await vi.advanceTimersByTimeAsync(4999);
    });
    expect(phase()).toBe("holding");
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1);
    });
    expect(screen.getByText("Ready")).toBeInTheDocument();
    expect(screen.queryByTestId("entry-transition")).not.toBeInTheDocument();
  });

  it("continues when a delayed destination heading mounts", async () => {
    const view = render(tree("en", { showTitle: false }));
    fireEvent.click(screen.getByRole("link", { name: "New research" }));
    await complete();
    await complete();
    await complete();
    expect(phase()).toBe("holding");
    await act(async () => {
      view.rerender(tree());
    });
    expect(phase()).toBe("center-out");
    await complete();
    await complete();
    await complete();
    expect(screen.getByText("Ready")).toBeInTheDocument();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(vi.getTimerCount()).toBe(0);
  });

  it("restores controls when dispatch throws", async () => {
    vi.spyOn(window.history, "pushState").mockImplementation(() => {
      throw new Error("Unavailable");
    });
    render(tree());
    fireEvent.click(screen.getByRole("link", { name: "New research" }));
    await complete();
    expect(screen.getByText("Ready")).toBeInTheDocument();
    expect(vi.getTimerCount()).toBe(0);
  });

  it("cancels a running mask on browser history and prevents a late dispatch", async () => {
    render(tree());
    fireEvent.click(screen.getByRole("link", { name: "New research" }));
    const cover = animation.pending[0];
    act(() => {
      window.history.pushState({}, "", "/settings");
      window.dispatchEvent(new PopStateEvent("popstate"));
    });
    await act(async () => {
      cover.complete();
    });
    expect(cover.kill).toHaveBeenCalled();
    expect(window.location.pathname).toBe("/settings");
    expect(screen.getByText("Ready")).toBeInTheDocument();
  });

  it("cancels a running mask for a language change or configuration block", async () => {
    const view = render(tree());
    fireEvent.click(screen.getByRole("link", { name: "New research" }));
    view.rerender(tree("zh-CN"));
    expect(screen.getByText("Ready")).toBeInTheDocument();
    animation.pending = [];
    fireEvent.click(screen.getByRole("link", { name: "New research" }));
    await complete();
    view.rerender(tree("zh-CN", { blocked: true }));
    expect(screen.queryByTestId("entry-transition")).not.toBeInTheDocument();
    expect(vi.getTimerCount()).toBe(0);
  });

  it("keeps reduced motion direct", () => {
    vi.stubGlobal("matchMedia", () => ({ matches: true }));
    render(tree());
    fireEvent.click(screen.getByRole("link", { name: "New research" }));
    expect(window.location.pathname).toBe("/research/new");
    expect(screen.queryByTestId("entry-transition")).not.toBeInTheDocument();
  });

  it("navigates directly from a research task outside the entry group", () => {
    window.history.replaceState({}, "", "/research/existing-task");
    render(tree());
    fireEvent.click(screen.getByRole("link", { name: "Back to menu" }));
    expect(window.location.pathname).toBe("/workspace");
    expect(screen.queryByTestId("entry-transition")).not.toBeInTheDocument();
  });

  it("preserves modified clicks and ignores the current page", () => {
    render(tree());
    const push = vi.spyOn(window.history, "pushState");
    fireEvent.click(screen.getByRole("link", { name: "New research" }), {
      ctrlKey: true,
    });
    fireEvent.click(screen.getByRole("link", { name: "Back to menu" }));
    expect(push).not.toHaveBeenCalled();
    expect(screen.queryByTestId("entry-transition")).not.toBeInTheDocument();
  });

  it("blocks wheel and keyboard input only while animating", async () => {
    render(tree());
    fireEvent.click(screen.getByRole("link", { name: "New research" }));
    expect(
      fireEvent(window, new WheelEvent("wheel", { cancelable: true })),
    ).toBe(false);
    expect(
      fireEvent(
        window,
        new KeyboardEvent("keydown", { key: "Enter", cancelable: true }),
      ),
    ).toBe(false);
    await finishAnimation();
    expect(
      fireEvent(window, new WheelEvent("wheel", { cancelable: true })),
    ).toBe(true);
    expect(
      fireEvent(
        window,
        new KeyboardEvent("keydown", { key: "Enter", cancelable: true }),
      ),
    ).toBe(true);
  });

  it("kills pending work and clears the readiness timer on unmount", async () => {
    const view = render(tree("en", { showTitle: false }));
    fireEvent.click(screen.getByRole("link", { name: "New research" }));
    await complete();
    const tween = animation.pending[0];
    view.unmount();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(6000);
    });
    expect(tween.kill).toHaveBeenCalled();
    expect(vi.getTimerCount()).toBe(0);
  });
});
