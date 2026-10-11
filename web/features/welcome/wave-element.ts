import { mountWelcomeWaves } from "./wave-field";

export interface WelcomeWaveElement extends HTMLElement {
  startWaves(
    canvas: HTMLCanvasElement,
    interactionTarget: HTMLElement,
    title?: HTMLElement,
    description?: HTMLElement,
  ): void;
  setWavesSuspended(suspended: boolean): void;
  stopWaves(): void;
}

export function registerWelcomeWaves() {
  if (customElements.get("a-waves")) return;
  customElements.define(
    "a-waves",
    class extends HTMLElement implements WelcomeWaveElement {
      private field: ReturnType<typeof mountWelcomeWaves> | null = null;
      private canvas: HTMLCanvasElement | null = null;
      private target: HTMLElement | null = null;
      private titleElement: HTMLElement | undefined;
      private descriptionElement: HTMLElement | undefined;

      connectedCallback() {
        if (this.canvas && this.target)
          this.startWaves(
            this.canvas,
            this.target,
            this.titleElement,
            this.descriptionElement,
          );
      }

      disconnectedCallback() {
        this.stopWaves();
      }

      startWaves(
        canvas: HTMLCanvasElement,
        interactionTarget: HTMLElement,
        title?: HTMLElement,
        description?: HTMLElement,
      ) {
        this.canvas = canvas;
        this.target = interactionTarget;
        this.titleElement = title;
        this.descriptionElement = description;
        if (this.isConnected && !this.field)
          this.field = description
            ? mountWelcomeWaves(
                this,
                canvas,
                interactionTarget,
                title,
                description,
              )
            : title
              ? mountWelcomeWaves(this, canvas, interactionTarget, title)
              : mountWelcomeWaves(this, canvas, interactionTarget);
      }

      stopWaves() {
        this.field?.dispose();
        this.field = null;
      }

      setWavesSuspended(suspended: boolean) {
        this.field?.setSuspended(suspended);
      }
    },
  );
}
