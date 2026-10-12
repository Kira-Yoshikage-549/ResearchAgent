import { act, render, screen, waitFor, within } from "@testing-library/react";
import { userEvent } from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { Providers } from "@/app/providers";
import { ReportView } from "@/components/report/report-view";
import { ResearchShell } from "@/components/shell/research-shell";
import type { ResearchTaskResultResponse } from "@/lib/api/client";
import { resetUiStore, useUiStore } from "@/stores/ui-store";

const result: ResearchTaskResultResponse = {
  task_id: "task-report",
  partial: false,
  report_markdown:
    "# 报告标题\n\n## 研究发现\n\n正文。\n\n## 研究发现\n\n更多证据。",
  research_plan: [],
  papers: [],
  paper_insights: [],
  analysis: {},
  critique: {},
  statistics: {},
  evidence: [],
  citations: [],
  capabilities: {
    supports_replay: false,
    supports_evidence: false,
    supports_structured_papers: false,
  },
};

function reportPage(
  id = "task-report",
  report: ResearchTaskResultResponse | null = result,
) {
  return (
    <Providers locale="en">
      <ResearchShell taskId={id}>
        <ReportView taskId={id} result={report ?? undefined} />
      </ResearchShell>
    </Providers>
  );
}

describe("report sidebar", () => {
  beforeEach(() => {
    resetUiStore();
    localStorage.clear();
    vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
      const path = new URL(String(input), "http://localhost").pathname;
      const id = path.split("/tasks/")[1]?.split("/")[0];
      const body = path.endsWith("/messages")
        ? { task_id: id, task_status: "completed", messages: [], pending: null }
        : path.endsWith("/result")
          ? result
          : path.includes("/tasks/")
            ? {
                id,
                client_request_id: `client-${id}`,
                title: "Research title",
                query: "Hidden query subtitle",
                status: "completed",
                effective_locale: "en",
                last_sequence: 0,
                created_at: "2026-10-09T12:00:00Z",
              }
            : [];
      return new Response(JSON.stringify(body), {
        headers: { "content-type": "application/json" },
      });
    });
  });

  afterEach(() => {
    resetUiStore();
    localStorage.clear();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it("replaces tasks with an always-open directory and shares stable Chinese heading IDs", async () => {
    render(reportPage());
    const toc = screen.getByRole("navigation", { name: "On this page" });
    expect(
      screen.queryByRole("complementary", { name: "Task navigation" }),
    ).not.toBeInTheDocument();
    expect(
      within(screen.getByRole("main")).queryByRole("navigation", {
        name: "On this page",
      }),
    ).not.toBeInTheDocument();
    const links = within(toc).getAllByRole("link", { name: "研究发现" });
    expect(links.map((link) => link.getAttribute("href"))).toEqual([
      "#研究发现",
      "#研究发现-2",
    ]);
    expect(
      screen
        .getAllByRole("heading", { name: "研究发现" })
        .map((heading) => heading.id),
    ).toEqual(["研究发现", "研究发现-2"]);
    expect(await screen.findByText("Research title")).toBeInTheDocument();
    expect(screen.queryByText("Hidden query subtitle")).not.toBeInTheDocument();
    expect(screen.queryByText(/Task ID|task-report/)).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "English" }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "中文" }),
    ).not.toBeInTheDocument();
  });

  it("covers an inert directory, closes with Escape or the button, and restores focus without persisting", async () => {
    const user = userEvent.setup();
    render(reportPage());
    const list = screen.getByTestId("report-toc-list");
    list.scrollTop = 60;
    const expand = screen.getByRole("button", { name: "Expand task sidebar" });
    const storedState = localStorage.getItem("research-agent.ui.v1");
    await user.click(expand);
    expect(
      screen.getByRole("complementary", { name: "Task navigation" }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("navigation", { name: "On this page" }),
    ).not.toBeInTheDocument();
    expect(list.closest("[inert]")).not.toBeNull();
    expect(
      screen.getByRole("button", { name: "Collapse task sidebar" }),
    ).toHaveFocus();
    await user.keyboard("{Escape}");
    await waitFor(() => expect(expand).toHaveFocus());
    expect(screen.getByTestId("report-toc-list")).toBe(list);
    expect(list.scrollTop).toBe(60);
    await user.click(expand);
    await user.click(
      screen.getByRole("button", { name: "Collapse task sidebar" }),
    );
    await waitFor(() => expect(expand).toHaveFocus());
    expect(useUiStore.getState().isTaskSidebarOpen).toBe(true);
    expect(localStorage.getItem("research-agent.ui.v1")).toBe(storedState);
  });

  it("restores ordinary collapsible task navigation on other tabs and closes it on returning to the report", async () => {
    const user = userEvent.setup();
    render(reportPage());
    const list = screen.getByTestId("report-toc-list");
    list.scrollTop = 60;
    await user.click(screen.getByRole("tab", { name: "Papers (0)" }));
    expect(
      screen.queryByRole("navigation", { name: "On this page" }),
    ).not.toBeInTheDocument();
    expect(
      screen.getByRole("complementary", { name: "Task navigation" }),
    ).toBeInTheDocument();
    await user.click(
      screen.getByRole("button", { name: "Collapse task sidebar" }),
    );
    expect(
      screen.queryByRole("complementary", { name: "Task navigation" }),
    ).not.toBeInTheDocument();
    await user.click(
      screen.getByRole("button", { name: "Expand task sidebar" }),
    );
    await user.click(
      within(screen.getByRole("tablist", { name: "Research views" })).getByRole(
        "tab",
        { name: "Run details" },
      ),
    );
    expect(
      screen.getByRole("complementary", { name: "Task navigation" }),
    ).toBeInTheDocument();
    await user.click(screen.getByRole("tab", { name: "Report" }));
    expect(screen.getByTestId("report-toc-list")).toBe(list);
    expect(list.scrollTop).toBe(60);
    expect(
      screen.getByRole("navigation", { name: "On this page" }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("complementary", { name: "Task navigation" }),
    ).not.toBeInTheDocument();
  });

  it("restores focus after an immediate reduced-motion exit commits the interactive directory", async () => {
    vi.stubGlobal(
      "matchMedia",
      vi.fn().mockReturnValue({
        matches: true,
        media: "(prefers-reduced-motion: reduce)",
        onchange: null,
        addListener: vi.fn(),
        removeListener: vi.fn(),
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        dispatchEvent: vi.fn(),
      }),
    );
    const user = userEvent.setup();
    render(reportPage());
    const expand = screen.getByRole("button", { name: "Expand task sidebar" });
    await user.click(expand);
    await user.click(
      screen.getByRole("button", { name: "Collapse task sidebar" }),
    );
    expect(screen.getByTestId("report-task-overlay")).toHaveAttribute("hidden");
    expect(screen.getByTestId("report-toc-list").closest("[inert]")).toBeNull();
    expect(
      screen.getByTestId("report-toc-list").closest("[hidden]"),
    ).toBeNull();
    await waitFor(() => expect(expand).toHaveFocus());
  });

  it("resets report navigation on a new task and a fresh mount despite saved expanded task preferences", async () => {
    const user = userEvent.setup();
    localStorage.setItem(
      "research-agent.ui.v1",
      JSON.stringify({ state: { isTaskSidebarOpen: true }, version: 1 }),
    );
    const { rerender, unmount } = render(reportPage());
    await user.click(
      screen.getByRole("button", { name: "Expand task sidebar" }),
    );
    rerender(
      reportPage("task-other", {
        ...result,
        task_id: "task-other",
        report_markdown: "# Another report",
      }),
    );
    expect(
      screen.getByRole("navigation", { name: "On this page" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: "Another report" }),
    ).toHaveAttribute("href", "#another-report");
    expect(
      screen.queryByRole("complementary", { name: "Task navigation" }),
    ).not.toBeInTheDocument();
    unmount();
    render(reportPage());
    expect(
      screen.getByRole("navigation", { name: "On this page" }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("complementary", { name: "Task navigation" }),
    ).not.toBeInTheDocument();
  });

  it("settles a background exit without replaying focus when the page returns", async () => {
    const hidden = vi.spyOn(document, "hidden", "get").mockReturnValue(false);
    const user = userEvent.setup();
    render(reportPage());
    const expand = screen.getByRole("button", { name: "Expand task sidebar" });
    await user.click(expand);
    hidden.mockReturnValue(true);
    await user.click(
      screen.getByRole("button", { name: "Collapse task sidebar" }),
    );
    expect(screen.getByTestId("report-task-overlay")).toHaveAttribute("hidden");
    expect(expand).not.toHaveFocus();
    hidden.mockReturnValue(false);
    act(() => document.dispatchEvent(new Event("visibilitychange")));
    expect(expand).not.toHaveFocus();
  });

  it("keeps the current tab when report data updates and offers navigation for reports without headings", async () => {
    const user = userEvent.setup();
    const { rerender } = render(reportPage());
    await user.click(
      within(screen.getByRole("tablist", { name: "Research views" })).getByRole(
        "tab",
        { name: "Run details" },
      ),
    );
    rerender(
      reportPage("task-report", {
        ...result,
        report_markdown: "No section headings.",
      }),
    );
    expect(
      within(screen.getByRole("tablist", { name: "Research views" })).getByRole(
        "tab",
        { name: "Run details" },
      ),
    ).toHaveAttribute("aria-selected", "true");
    await user.click(screen.getByRole("tab", { name: "Report" }));
    expect(
      within(
        screen.getByRole("navigation", { name: "On this page" }),
      ).getByText("No section headings."),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Expand task sidebar" }),
    ).toBeInTheDocument();
  });

  it("keeps the directory and task entry available while loading and after a result failure", async () => {
    let finish!: (response: Response) => void;
    const response = new Promise<Response>((resolve) => {
      finish = resolve;
    });
    const originalFetch = vi.mocked(globalThis.fetch).getMockImplementation()!;
    vi.mocked(globalThis.fetch).mockImplementation((input, init) => {
      if (String(input).endsWith("/result"))
        return response.then((value) => value.clone());
      return originalFetch(input, init);
    });
    render(reportPage("task-report", null));
    const toc = screen.getByRole("navigation", { name: "On this page" });
    expect(within(toc).getByRole("status")).toHaveTextContent("Loading");
    finish(new Response("{}", { status: 500 }));
    expect(
      await within(toc).findByText("No section headings."),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Expand task sidebar" }),
    ).toBeInTheDocument();
  });
});
