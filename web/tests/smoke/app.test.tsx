import { render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn() }),
  usePathname: () => null,
  useSearchParams: () => new URLSearchParams(),
}));
vi.mock("gsap", () => ({ gsap: { registerPlugin: vi.fn() } }));
vi.mock("gsap/ScrollTrigger", () => ({
  ScrollTrigger: { create: () => ({ refresh: vi.fn(), kill: vi.fn() }) },
}));
vi.mock("@/components/welcome/welcome-waves", () => ({
  WelcomeWaves: () => null,
}));

import Home from "@/app/workspace/page";
import { Providers } from "@/app/providers";

describe("home page", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  beforeEach(() => {
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
    vi.stubGlobal("scrollTo", vi.fn());
    window.history.replaceState({}, "", "/workspace");
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(null, { status: 204 }),
    );
  });

  it("renders the menu and routes each action to its page", () => {
    render(
      <Providers locale="en">
        <Home />
      </Providers>,
    );

    expect(
      screen.getByRole("heading", { name: "Choose your next step", level: 2 }),
    ).toBeInTheDocument();
    expect(
      screen.getAllByText("Every discovery begins with a question.")[1],
    ).toBeVisible();
    expect(screen.queryByRole("list")).not.toBeInTheDocument();
    for (const number of ["01", "02", "03"]) {
      expect(screen.getByText(number)).toBeVisible();
    }
    expect(document.querySelector("[data-design-text]")).toBeNull();
    expect(screen.getByRole("link", { name: /new research/i })).toHaveAttribute(
      "href",
      "/research/new",
    );
    expect(screen.getByRole("link", { name: "history" })).toHaveAttribute(
      "href",
      "/history",
    );
    expect(screen.getByRole("link", { name: "Settings" })).toHaveAttribute(
      "href",
      "/settings",
    );
    expect(document.querySelector("[data-pet-state]")).toBeNull();
  });
});
