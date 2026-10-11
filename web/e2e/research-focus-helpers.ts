import type { Page } from "@playwright/test";
import type { TaskSnapshotResponse } from "../lib/api/client";
import { mockEntryBackend } from "./three-page-helpers";

export const taskId = "task-focus-preview";
export const snapshot: TaskSnapshotResponse = {
  id: taskId,
  client_request_id: "client-focus-preview",
  query: "What advances have been made in Transformer attention since 2023?",
  title: "Transformer attention since 2023",
  status: "running",
  effective_locale: "en",
  current_stage: "filter",
  created_at: "2026-10-05T09:00:00Z",
  started_at: "2026-10-05T09:00:01Z",
  last_sequence: 12,
  available_actions: ["cancel"],
  statistics: { papersDiscovered: 24, papersSelected: 8 },
  stages: [
    { stage: "orchestrate", status: "completed", attempt: 1 },
    { stage: "search", status: "completed", attempt: 1 },
    {
      stage: "filter",
      status: "running",
      attempt: 1,
      detail: "Selecting the most relevant attention research.",
    },
  ],
  replay_events: [
    {
      schema_version: 1,
      task_id: taskId,
      sequence: 6,
      event_type: "plan.available",
      stage: "orchestrate",
      occurred_at: "2026-10-05T09:00:04Z",
      level: "info",
      payload: {
        steps: [
          { step: 1, title: "Compare efficient attention methods" },
          { step: 2, title: "Trace benchmark evidence and limitations" },
        ],
      },
    },
  ],
};

type StreamMetrics = { created: number; active: number; peak: number };

export async function mockRunningResearch(page: Page, taskSnapshot = snapshot) {
  await mockEntryBackend(page);
  await page.route(`**/api/v1/research/tasks/${taskId}`, (route) =>
    route.fulfill({ json: taskSnapshot }),
  );
  await page.route(`**/api/v1/research/tasks/${taskId}/messages`, (route) =>
    route.fulfill({
      json: {
        task_id: taskId,
        task_status: "running",
        messages: [],
        pending: null,
      },
    }),
  );
  await page.route(`**/api/v1/research/tasks/${taskId}/result`, (route) =>
    route.fulfill({ status: 204 }),
  );
  await page.addInitScript(() => {
    localStorage.clear();
    const metrics = { created: 0, active: 0, peak: 0 };
    Object.assign(window, { researchStreamMetrics: metrics });
    class FocusEventSource extends EventTarget {
      static current: FocusEventSource | null = null;
      readonly url: string;
      readyState = 0;
      onopen: ((event: Event) => void) | null = null;
      onerror: ((event: Event) => void) | null = null;
      onmessage: ((event: MessageEvent<string>) => void) | null = null;
      private closed = false;

      constructor(url: string | URL) {
        super();
        this.url = String(url);
        FocusEventSource.current = this;
        metrics.created += 1;
        metrics.active += 1;
        metrics.peak = Math.max(metrics.peak, metrics.active);
        queueMicrotask(() => {
          if (this.closed) return;
          this.readyState = 1;
          this.onopen?.(new Event("open"));
        });
      }

      close() {
        if (this.closed) return;
        this.closed = true;
        this.readyState = 2;
        metrics.active -= 1;
      }
    }
    Object.defineProperty(window, "EventSource", { value: FocusEventSource });
    Object.assign(window, {
      dispatchResearchEvent: (event: { event_type: string }) => {
        FocusEventSource.current?.dispatchEvent(
          new MessageEvent(event.event_type, { data: JSON.stringify(event) }),
        );
      },
    });
  });
}

export function streamMetrics(page: Page) {
  return page.evaluate(
    () =>
      (window as unknown as { researchStreamMetrics: StreamMetrics })
        .researchStreamMetrics,
  );
}
