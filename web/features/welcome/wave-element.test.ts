import { afterEach, expect, it, vi } from "vitest";
const { mount, dispose } = vi.hoisted(() => ({
  mount: vi.fn(),
  dispose: vi.fn(),
}));
vi.mock("./wave-field", () => ({ mountWelcomeWaves: mount }));
import { registerWelcomeWaves, type WelcomeWaveElement } from "./wave-element";

it("retains the title reference when the element reconnects", () => {
  mount.mockReturnValue({ dispose });
  registerWelcomeWaves();
  const page = document.createElement("main");
  const title = document.createElement("h1");
  const description = document.createElement("aside");
  const element = document.createElement("a-waves") as WelcomeWaveElement;
  const canvas = document.createElement("canvas");
  element.append(canvas);
  page.append(title, element);
  document.body.append(page);
  element.startWaves(canvas, page, title, description);
  expect(mount).toHaveBeenCalledExactlyOnceWith(
    element,
    canvas,
    page,
    title,
    description,
  );
  element.remove();
  expect(dispose).toHaveBeenCalledOnce();
  page.append(element);
  expect(mount).toHaveBeenLastCalledWith(
    element,
    canvas,
    page,
    title,
    description,
  );
  expect(mount).toHaveBeenCalledTimes(2);
});

afterEach(() => {
  document.body.replaceChildren();
  vi.clearAllMocks();
});

it("registers once and releases and restarts the native element across DOM reconnections", () => {
  mount.mockReturnValue({ dispose });
  registerWelcomeWaves();
  const definition = customElements.get("a-waves");
  registerWelcomeWaves();
  expect(customElements.get("a-waves")).toBe(definition);
  const page = document.createElement("main");
  const element = document.createElement("a-waves") as WelcomeWaveElement;
  const canvas = document.createElement("canvas");
  element.append(canvas);
  page.append(element);
  document.body.append(page);
  element.startWaves(canvas, page);
  element.startWaves(canvas, page);
  expect(mount).toHaveBeenCalledExactlyOnceWith(element, canvas, page);
  element.remove();
  expect(dispose).toHaveBeenCalledOnce();
  page.append(element);
  expect(mount).toHaveBeenCalledTimes(2);
  element.stopWaves();
  element.stopWaves();
  expect(dispose).toHaveBeenCalledTimes(2);
});
