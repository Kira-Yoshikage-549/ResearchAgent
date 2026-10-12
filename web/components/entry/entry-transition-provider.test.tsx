import { act, fireEvent, render, screen } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { StrictMode, useRef } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getMessages } from "@/i18n/messages";
import { usePathname } from "@/i18n/navigation";
import { EntryTransitionLink } from "./entry-transition-link";
import { EntryTransitionTitle } from "./entry-transition-title";
import {
  EntryTransitionProvider,
  useEntryNavigation,
  useEntryTransitionBlock,
  useResearchTransitionReady,
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
  showSurface = false,
  shortReady = true,
}: {
  showTitle?: boolean;
  blocked?: boolean;
  showSurface?: boolean;
  shortReady?: boolean;
}) {
  const { navigate, busy } = useEntryNavigation();
  const pathname = usePathname();
  useEntryTransitionBlock(blocked);
  const surfaceRef = useRef<HTMLDivElement>(null);
  useResearchTransitionReady(surfaceRef);
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
      <EntryTransitionLink href="/research/existing-task">
        Open task
      </EntryTransitionLink>
      {showSurface ? (
        <div ref={surfaceRef} tabIndex={-1}>
          Loading task
        </div>
      ) : null}
      {showTitle ? (
        <EntryTransitionTitle shortTransitionReady={shortReady}>
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
      if (source === "/settings") {
        for (let i = 0; i < 3; i++) await complete();
      } else {
        await finishAnimation();
      }
      expect(window.location.pathname).toBe("/history");
      expect(screen.getByText("Ready")).toBeInTheDocument();
    },
  );

  it.each([
    { source: "/en/history", target: "/settings", name: "Settings" },
    { source: "/zh-CN/settings", target: "/history", name: "History" },
  ])(
    "uses the short paper mask from $source to $target",
    async ({ source, target, name }) => {
      window.history.replaceState({}, "", source);
      const push = vi.spyOn(window.history, "pushState");
      render(tree(source.includes("zh-CN") ? "zh-CN" : "en"));
      fireEvent.click(screen.getByRole("link", { name }));
      fireEvent.click(screen.getByRole("link", { name }));
      expect(push).not.toHaveBeenCalled();
      expect(screen.getByTestId("entry-transition")).toHaveAttribute(
        "data-direction",
        "forward",
      );
      expect(
        screen.queryByTestId("entry-transition-center"),
      ).not.toBeInTheDocument();
      expect(animation.pending[0].duration).toBe(0.18);
      await complete();
      expect(push).toHaveBeenCalledTimes(1);
      expect(window.location.pathname).toBe(target);
      expect(phase()).toBe("holding");
      const heading = screen.getByRole("heading", {
        name: target === "/history" ? "Research history" : "Settings",
        hidden: true,
      });
      expect(heading).not.toHaveAttribute("data-entry-title-active");
      expect(heading.querySelector("[data-entry-word]")).toBeNull();
      expect(animation.pending[0].duration).toBe(0.4);
      await complete();
      expect(phase()).toBe("uncovering");
      expect(animation.pending[0].duration).toBe(0.24);
      await complete();
      expect(screen.queryByTestId("entry-transition")).not.toBeInTheDocument();
      expect(heading).toHaveFocus();
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

  it("returns from a task with the same forward mask and keeps native titles", async () => {
    window.history.replaceState({}, "", "/research/existing-task");
    render(tree());
    fireEvent.click(screen.getByRole("link", { name: "Back to menu" }));
    expect(window.location.pathname).toBe("/research/existing-task");
    expect(screen.getByTestId("entry-transition")).toHaveAttribute(
      "data-direction",
      "forward",
    );
    expect(
      screen.queryByTestId("entry-transition-center"),
    ).not.toBeInTheDocument();
    expect(animation.pending[0].duration).toBe(0.18);
    await complete();
    expect(window.location.pathname).toBe("/workspace");
    const heading = screen.getByRole("heading", {
      name: "Choose your next step",
      hidden: true,
    });
    expect(heading.querySelector("[data-entry-word]")).toBeNull();
    expect(heading).not.toHaveAttribute("data-entry-title-active");
    expect(phase()).toBe("holding");
    expect(animation.pending[0].duration).toBe(0.4);
    await complete();
    expect(animation.pending[0].duration).toBe(0.24);
    await complete();
    expect(screen.queryByTestId("entry-transition")).not.toBeInTheDocument();
    expect(heading).toHaveFocus();
  });

  it("opens a task after coverage and focuses the mounted loading shell", async () => {
    window.history.replaceState({}, "", "/history");
    render(tree("en", { showTitle: false, showSurface: true }));
    const push = vi.spyOn(window.history, "pushState");
    fireEvent.click(screen.getByRole("link", { name: "Open task" }));
    fireEvent.click(screen.getByRole("link", { name: "Settings" }));
    expect(push).not.toHaveBeenCalled();
    expect(screen.getByTestId("entry-transition")).toHaveAttribute(
      "data-mode",
      "research",
    );
    await complete();
    expect(push).toHaveBeenCalledTimes(1);
    expect(phase()).toBe("holding");
    expect(animation.pending[0].duration).toBe(0.4);
    fireEvent.click(screen.getByRole("link", { name: "Settings" }));
    expect(push).toHaveBeenCalledTimes(1);
    await complete();
    expect(phase()).toBe("uncovering");
    await complete();
    expect(screen.getByText("Loading task")).toHaveFocus();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(vi.getTimerCount()).toBe(0);
  });

  it("waits for menu positioning before a short return unveils it", async () => {
    window.history.replaceState({}, "", "/research/existing-task");
    const view = render(tree("en", { shortReady: false }));
    fireEvent.click(screen.getByRole("link", { name: "Back to menu" }));
    await complete();
    await complete();
    expect(phase()).toBe("holding");
    view.rerender(tree());
    await act(async () => {});
    expect(phase()).toBe("uncovering");
    await complete();
    expect(screen.getByText("Ready")).toBeInTheDocument();
  });

  it.each(["History", "Settings", "New research"])(
    "uses short navigation from a task to %s",
    async (name) => {
      window.history.replaceState({}, "", "/research/existing-task");
      render(tree());
      fireEvent.click(screen.getByRole("link", { name }));
      expect(screen.getByTestId("entry-transition")).toHaveAttribute(
        "data-direction",
        "forward",
      );
      await complete();
      await complete();
      await complete();
      expect(screen.getByText("Ready")).toBeInTheDocument();
    },
  );

  it("releases a short mask when a task surface never mounts", async () => {
    render(tree("en", { showTitle: false }));
    fireEvent.click(screen.getByRole("link", { name: "Open task" }));
    await complete();
    await complete();
    expect(phase()).toBe("holding");
    await act(async () => {
      await vi.advanceTimersByTimeAsync(5000);
    });
    expect(screen.getByText("Ready")).toBeInTheDocument();
    expect(screen.queryByTestId("entry-transition")).not.toBeInTheDocument();
  });

  it("submits a short navigation once when reduced motion is enabled during coverage", async () => {
    const motion = new EventTarget() as EventTarget & { matches: boolean };
    motion.matches = false;
    vi.stubGlobal("matchMedia", () => motion);
    render(tree("en", { showSurface: true }));
    const push = vi.spyOn(window.history, "pushState");
    fireEvent.click(screen.getByRole("link", { name: "Open task" }));
    act(() => {
      motion.matches = true;
      motion.dispatchEvent(new Event("change"));
    });
    expect(window.location.pathname).toBe("/research/existing-task");
    expect(push).toHaveBeenCalledTimes(1);
    await complete();
    expect(push).toHaveBeenCalledTimes(1);
    expect(screen.getByText("Ready")).toBeInTheDocument();
  });

  it("keeps current-task and modified task clicks native", () => {
    window.history.replaceState({}, "", "/research/existing-task");
    render(tree());
    const push = vi.spyOn(window.history, "pushState");
    fireEvent.click(screen.getByRole("link", { name: "Open task" }));
    fireEvent.click(screen.getByRole("link", { name: "History" }), {
      ctrlKey: true,
    });
    expect(push).not.toHaveBeenCalled();
    expect(animation.pending).toHaveLength(0);
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
