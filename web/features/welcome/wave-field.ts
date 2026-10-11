// Wave geometry adapted from Antoine Wodniack's a-waves: https://wodniack.dev/
// Canvas rendering and time-normalized simulation: docs/frontend-swiss/home-waves.md
import { gsap } from "gsap";
import { Noise } from "noisejs";
import { createWaveTitle } from "./wave-title";

type Point = {
  x: number;
  y: number;
  wave: { x: number; y: number };
  cursor: { x: number; y: number; vx: number; vy: number };
};
type Line = {
  points: Point[];
  coordinates: Float64Array;
  lengths: Float64Array;
  progress: number;
};
const baseFrame = 1000 / 60;
// Bound each raster path: a single full-screen stroke is much slower in Chrome.
const linesPerStroke = 8;
const spring = 0.005;
const friction = 0.925;
const damping = Math.sqrt(friction);
const cosine = (1 - 2 * spring * friction + friction) / (2 * damping);
const frequency = Math.acos(cosine);

export function mountWelcomeWaves(
  host: HTMLElement,
  canvas: HTMLCanvasElement,
  interactionTarget: HTMLElement = host,
  titleElement?: HTMLElement,
  descriptionElement?: HTMLElement,
) {
  const context = canvas.getContext("2d");
  if (!context) {
    host.dataset.motion = "still";
    host.dataset.pointer = "hidden";
    host.dataset.intro = "complete";
    return { dispose() {}, setSuspended() {} };
  }
  const ctx = context;
  const noise = new Noise(Math.random());
  const motion = window.matchMedia("(prefers-reduced-motion: reduce)");
  const mouse = {
    x: -10,
    y: 0,
    sx: 0,
    sy: 0,
    lx: 0,
    ly: 0,
    speed: 0,
    angle: 0,
    active: false,
  };
  let lines: Line[] = [];
  let bounding = { left: 0, top: 0, width: 0, height: 0 };
  let time = 0;
  let pixelRatio = 1;
  let visible = true;
  let disposed = false;
  let suspended = false;
  let running = false;
  let interactive = false;
  let frame: number | null = null;
  let resizeFrame: number | null = null;
  let lastTimestamp = 0;
  let introTime = 0;
  let intro: gsap.core.Timeline | null = null;
  let resolution: MediaQueryList | null = null;
  const textLayers = [titleElement, descriptionElement].flatMap(
    (element, index) =>
      element
        ? [
            createWaveTitle(
              host,
              element,
              (rebuild) => {
                if (rebuild) scheduleResize();
                else if (!running) drawLines();
              },
              index === 1
                ? { maxDisplacement: 3, strength: 0.04, meshSpacing: 12 }
                : undefined,
            ),
          ]
        : [],
  );

  function drawCursor() {
    host.style.setProperty("--x", `${mouse.sx}px`);
    host.style.setProperty("--y", `${mouse.sy}px`);
    host.dataset.pointer = mouse.active ? "visible" : "hidden";
  }

  function updateNoise() {
    for (const { points } of lines) {
      for (const point of points) {
        const wave =
          noise.perlin2(
            (point.x + time * 0.0125) * 0.002,
            (point.y + time * 0.005) * 0.0015,
          ) * 12;
        point.wave.x = Math.cos(wave) * 32;
        point.wave.y = Math.sin(wave) * 16;
      }
    }
  }

  function simulate(elapsed: number, speed: number) {
    const steps = Math.max(1, Math.ceil(elapsed / baseFrame));
    const ratio = elapsed / steps / baseFrame;
    const ease = 1 - Math.pow(0.9, ratio);
    // Fractional power of the original 60Hz spring matrix. At ratio=1 this
    // exactly matches tension .005, friction .925 and velocity strength 2.
    // Unlike scaling an Euler step, free return stays identical at any refresh rate.
    const decay = Math.pow(damping, ratio);
    const sine = Math.sin(frequency * ratio) / Math.sin(frequency);
    const cos = Math.cos(frequency * ratio);
    const a =
      decay * (cos + sine * ((1 - 2 * spring * friction) / damping - cosine));
    const b = (decay * sine * 2 * friction) / damping;
    const c = (-decay * sine * spring * friction) / damping;
    const d = decay * (cos + sine * (friction / damping - cosine));
    const directionX = Math.cos(mouse.angle);
    const directionY = Math.sin(mouse.angle);
    for (let step = 0; step < steps; step++) {
      mouse.sx += (mouse.x - mouse.sx) * ease;
      mouse.sy += (mouse.y - mouse.sy) * ease;
      mouse.speed = Math.min(100, mouse.speed + (speed - mouse.speed) * ease);
      if (!interactive) continue;
      const radius = Math.max(175, mouse.speed);
      const radiusSquared = radius * radius;
      const forceAt = (x: number, y: number) => {
        const distance = Math.hypot(x - mouse.sx, y - mouse.sy);
        return mouse.active && distance < radius
          ? (Math.cos(distance * 0.001) *
              (1 - distance / radius) *
              radius *
              mouse.speed *
              0.00065) /
              spring
          : 0;
      };
      for (const { points } of lines) {
        for (const point of points) {
          let force = 0;
          const dx = point.x - mouse.sx;
          const dy = point.y - mouse.sy;
          if (mouse.active && dx * dx + dy * dy < radiusSquared) {
            const distance = Math.hypot(dx, dy);
            force =
              (Math.cos(distance * 0.001) *
                (1 - distance / radius) *
                radius *
                mouse.speed *
                0.00065) /
              spring;
          }
          const { x, y, vx, vy } = point.cursor;
          point.cursor.x = Math.max(
            -100,
            Math.min(100, a * x + b * vx + (1 - a) * directionX * force),
          );
          point.cursor.y = Math.max(
            -100,
            Math.min(100, a * y + b * vy + (1 - a) * directionY * force),
          );
          point.cursor.vx = c * x + d * vx - c * directionX * force;
          point.cursor.vy = c * y + d * vy - c * directionY * force;
        }
      }
      for (const text of textLayers)
        text.advance({ a, b, c, d, forceAt, directionX, directionY });
    }
  }

  function drawLines() {
    ctx.clearRect(0, 0, bounding.width, bounding.height);
    for (
      let startLine = 0;
      startLine < lines.length;
      startLine += linesPerStroke
    ) {
      ctx.beginPath();
      for (
        let index = startLine;
        index < Math.min(startLine + linesPerStroke, lines.length);
        index++
      ) {
        const line = lines[index];
        const { points, coordinates, lengths, progress } = line;
        if (progress <= 0) continue;
        const first = points[0];
        coordinates[0] = Math.round((first.x + first.wave.x) * 10) / 10;
        coordinates[1] = Math.round((first.y + first.wave.y) * 10) / 10;
        for (let i = 0; i < points.length; i++) {
          const point = points[i];
          const withCursor = i !== points.length - 1;
          const offset = (i + 1) * 2;
          coordinates[offset] =
            Math.round(
              (point.x + point.wave.x + (withCursor ? point.cursor.x : 0)) * 10,
            ) / 10;
          coordinates[offset + 1] =
            Math.round(
              (point.y + point.wave.y + (withCursor ? point.cursor.y : 0)) * 10,
            ) / 10;
          if (progress < 1)
            lengths[i + 1] =
              lengths[i] +
              Math.hypot(
                coordinates[offset] - coordinates[offset - 2],
                coordinates[offset + 1] - coordinates[offset - 1],
              );
        }
        let start = 0;
        if (progress < 1) {
          // DrawSVG's 100%100% -> 0%100% reveals the tail of each polyline.
          const threshold = lengths[points.length] * (1 - progress);
          while (start < points.length && lengths[start + 1] < threshold)
            start++;
          const span = lengths[start + 1] - lengths[start];
          const fraction = span ? (threshold - lengths[start]) / span : 0;
          const offset = start * 2;
          ctx.moveTo(
            coordinates[offset] +
              (coordinates[offset + 2] - coordinates[offset]) * fraction,
            coordinates[offset + 1] +
              (coordinates[offset + 3] - coordinates[offset + 1]) * fraction,
          );
        } else ctx.moveTo(coordinates[0], coordinates[1]);
        for (let i = start + 1; i <= points.length; i++)
          ctx.lineTo(coordinates[i * 2], coordinates[i * 2 + 1]);
      }
      // Independent subpaths preserve each polyline without a giant raster path.
      ctx.stroke();
    }
    for (const text of textLayers) text.draw(ctx, running && !motion.matches);
  }

  function reveal() {
    interactive = true;
    host.dataset.intro = "interactive";
  }
  function finishIntro() {
    interactive = true;
    for (const line of lines) line.progress = 1;
    host.dataset.intro = "complete";
    intro?.kill();
    intro = null;
  }
  function startIntro() {
    introTime = 0;
    host.dataset.intro = "revealing";
    // A paused GSAP timeline is advanced by our rAF, so entrance and geometry
    // are drawn together and no GSAP ticker rate gates the continuous animation.
    intro = gsap.timeline({ paused: true, onComplete: finishIntro });
    intro.fromTo(
      lines,
      { progress: 0 },
      {
        progress: 1,
        duration: 3,
        ease: "expo.out",
        stagger: { amount: 0.5, from: "edges", ease: "power3.inOut" },
      },
      0.5,
    );
    intro.call(reveal, [], "-=1");
  }

  function tick(timestamp: number) {
    frame = null;
    if (!running) return;
    const elapsed = Math.min(50, Math.max(0, timestamp - lastTimestamp));
    lastTimestamp = timestamp;
    time += elapsed;
    introTime += elapsed;
    intro?.time(introTime / 1000, false);
    const dx = mouse.x - mouse.lx;
    const dy = mouse.y - mouse.ly;
    if (dx || dy) mouse.angle = Math.atan2(dy, dx);
    const speed =
      mouse.active && elapsed > 0
        ? (Math.hypot(dx, dy) * baseFrame) / elapsed
        : 0;
    mouse.lx = mouse.x;
    mouse.ly = mouse.y;
    simulate(elapsed, speed);
    drawCursor();
    updateNoise();
    drawLines();
    if (running) frame = requestAnimationFrame(tick);
  }

  function leave() {
    mouse.active = false;
    mouse.speed = 0;
    mouse.lx = mouse.x;
    mouse.ly = mouse.y;
    drawCursor();
  }

  function syncMotion() {
    const nextRunning =
      !disposed &&
      !suspended &&
      !motion.matches &&
      !document.hidden &&
      visible &&
      bounding.width > 0 &&
      bounding.height > 0;
    host.dataset.motion = nextRunning ? "running" : "still";
    if (nextRunning && !running) {
      running = true;
      for (const text of textLayers) text.rebuild(pixelRatio);
      lastTimestamp = performance.now();
      if (!interactive && !intro) startIntro();
      frame = requestAnimationFrame(tick);
    } else if (!nextRunning) {
      if (frame !== null) cancelAnimationFrame(frame);
      frame = null;
      running = false;
      for (const text of textLayers) text.reset();
      leave();
      if (!disposed && !suspended && visible && motion.matches) {
        finishIntro();
        updateNoise();
        drawLines();
      }
    }
  }

  function watchResolution() {
    resolution?.removeEventListener("change", resize);
    resolution = window.matchMedia(
      `(resolution: ${window.devicePixelRatio || 1}dppx)`,
    );
    resolution.addEventListener("change", resize);
  }

  function resize() {
    if (disposed) return;
    const rect = host.getBoundingClientRect();
    const width = host.offsetWidth || rect.width;
    const height = host.offsetHeight || rect.height;
    const changed = width !== bounding.width || height !== bounding.height;
    const ratio = Math.min(2, window.devicePixelRatio || 1);
    const backingChanged = changed || ratio !== pixelRatio;
    bounding = {
      left: rect.left,
      top: rect.top + window.scrollY,
      width,
      height,
    };
    pixelRatio = ratio;
    if (backingChanged) {
      canvas.width = Math.max(1, Math.round(bounding.width * ratio));
      canvas.height = Math.max(1, Math.round(bounding.height * ratio));
      ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
      ctx.strokeStyle = "#AAA9A3";
      ctx.lineWidth = 1;
      ctx.lineCap = "butt";
      ctx.lineJoin = "miter";
      ctx.miterLimit = 4;
    }
    if (changed) {
      leave();
      intro?.kill();
      intro = null;
      const columns = Math.ceil((bounding.width + 200) / 10);
      const rows = Math.ceil((bounding.height + 30) / 32);
      lines = Array.from({ length: columns + 1 }, (_, i) => ({
        points: Array.from({ length: rows + 1 }, (_, j) => ({
          x: (bounding.width - columns * 10) / 2 + i * 10,
          y: (bounding.height - rows * 32) / 2 + j * 32,
          wave: { x: 0, y: 0 },
          cursor: { x: 0, y: 0, vx: 0, vy: 0 },
        })),
        coordinates: new Float64Array((rows + 2) * 2),
        lengths: new Float64Array(rows + 2),
        progress: interactive ? 1 : 0,
      }));
      if (interactive) finishIntro();
      else if (running && !motion.matches) startIntro();
    }
    watchResolution();
    for (const text of textLayers) text.rebuild(pixelRatio);
    updateNoise();
    drawLines();
    syncMotion();
  }

  function scheduleResize() {
    if (disposed || resizeFrame !== null) return;
    resizeFrame = requestAnimationFrame(() => {
      resizeFrame = null;
      resize();
    });
  }

  function move(event: PointerEvent) {
    for (const text of textLayers) text.setTouch(event.pointerType === "touch");
    if (event.pointerType === "touch" || !running) {
      leave();
      return;
    }
    const rect = host.getBoundingClientRect();
    if (!rect.width || !rect.height) {
      leave();
      return;
    }
    const x = ((event.clientX - rect.left) * bounding.width) / rect.width;
    const y = ((event.clientY - rect.top) * bounding.height) / rect.height;
    if (x < 0 || x >= bounding.width || y < 0 || y >= bounding.height) {
      leave();
      return;
    }
    mouse.x = x;
    mouse.y = y;
    if (!mouse.active) {
      mouse.sx = mouse.lx = x;
      mouse.sy = mouse.ly = y;
      mouse.active = true;
      drawCursor();
    }
  }

  const resizeObserver = new ResizeObserver(scheduleResize);
  const intersectionObserver = new IntersectionObserver(
    ([entry]) => {
      visible = entry.isIntersecting && entry.intersectionRatio > 0.001;
      syncMotion();
    },
    { threshold: 0.001 },
  );
  interactionTarget.addEventListener("pointermove", move, { passive: true });
  interactionTarget.addEventListener("pointerleave", leave);
  window.addEventListener("resize", resize, { passive: true });
  document.addEventListener("visibilitychange", syncMotion);
  motion.addEventListener("change", syncMotion);
  resizeObserver.observe(host);
  intersectionObserver.observe(interactionTarget);
  resize();

  return {
    setSuspended(value: boolean) {
      if (suspended === value) return;
      suspended = value;
      syncMotion();
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      if (resizeFrame !== null) cancelAnimationFrame(resizeFrame);
      resizeFrame = null;
      syncMotion();
      intro?.kill();
      intro = null;
      for (const text of textLayers) text.dispose();
      resizeObserver.disconnect();
      intersectionObserver.disconnect();
      resolution?.removeEventListener("change", resize);
      interactionTarget.removeEventListener("pointermove", move);
      interactionTarget.removeEventListener("pointerleave", leave);
      window.removeEventListener("resize", resize);
      document.removeEventListener("visibilitychange", syncMotion);
      motion.removeEventListener("change", syncMotion);
      canvas.width = canvas.height = 0;
    },
  };
}
