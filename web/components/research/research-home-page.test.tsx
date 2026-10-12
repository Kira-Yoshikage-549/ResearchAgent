import { render, screen, waitFor } from "@testing-library/react";
import { userEvent } from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useRef } from "react";
import { usePathname } from "@/i18n/navigation";
import { useResearchTransitionReady } from "@/components/entry/entry-transition-provider";

import { Providers } from "@/app/providers";
import ResearchHomePage from "@/components/research/research-home-page";

function CreatedDestination() {
  const ref = useRef<HTMLElement>(null);
  useResearchTransitionReady(ref);
  return (
    <main ref={ref} tabIndex={-1}>
      Created task
    </main>
  );
}
function CreatedRoute() {
  return usePathname() === "/research/new-task" ? (
    <CreatedDestination />
  ) : (
    <ResearchHomePage />
  );
}

const activeTask = vi.hoisted(() => ({
  isPending: false,
  isError: false,
  data: null as null | {
    id: string;
    title: string;
    query: string;
    status: "running";
  },
}));

vi.mock("@/features/tasks/hooks/use-active-task", () => ({
  useActiveTask: () => activeTask,
}));

vi.mock("@/components/entry/entry-language-switcher", () => ({
  EntryLanguageSwitcher: () => <button>Language</button>,
}));

vi.mock("@/components/research/research-composer", () => ({
  ResearchComposer: ({ onCreated }: { onCreated: (id: string) => void }) => (
    <button onClick={() => onCreated("new-task")}>Create research</button>
  ),
  ResearchComposerSkeleton: () => <div role="status">Loading task status</div>,
}));

beforeEach(() => {
  activeTask.isPending = false;
  activeTask.isError = false;
  activeTask.data = null;
  window.history.replaceState({}, "", "/");
});

describe("ResearchHomePage", () => {
  it("waits for active-task restoration before showing the composer", () => {
    activeTask.isPending = true;
    render(
      <Providers locale="en">
        <ResearchHomePage />
      </Providers>,
    );

    expect(screen.getByRole("status")).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Create research" }),
    ).not.toBeInTheDocument();
    expect(screen.queryByTestId("brand-robot")).not.toBeInTheDocument();
  });

  it("restores a running task with a return link", () => {
    activeTask.data = {
      id: "active-task",
      title: "Restored research",
      query: "A saved question",
      status: "running",
    };
    render(
      <Providers locale="en">
        <ResearchHomePage />
      </Providers>,
    );

    expect(
      screen.getByRole("heading", { name: "Restored research" }),
    ).toBeInTheDocument();
    expect(screen.getByText("A saved question")).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: /return to research task/i }),
    ).toHaveAttribute("href", "/research/active-task");
    expect(
      screen.queryByRole("button", { name: "Create research" }),
    ).not.toBeInTheDocument();
  });

  it("allows drafting when task status is unavailable and opens the created task", async () => {
    activeTask.isError = true;
    render(
      <Providers locale="en">
        <CreatedRoute />
      </Providers>,
    );

    expect(screen.getByRole("alert")).toHaveTextContent(
      /active-task status is unavailable/i,
    );
    expect(screen.getByRole("link", { name: /back to menu/i })).toHaveAttribute(
      "href",
      "/workspace",
    );
    await userEvent
      .setup()
      .click(screen.getByRole("button", { name: "Create research" }));
    await waitFor(() =>
      expect(window.location.pathname).toBe("/research/new-task"),
    );
    await waitFor(() =>
      expect(screen.queryByTestId("entry-transition")).not.toBeInTheDocument(),
    );
  });
});
