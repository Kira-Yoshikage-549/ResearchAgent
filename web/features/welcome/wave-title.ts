// The title shares the wave field's clock, pointer and spring matrix.
const padding = 2;
const feather = 36;

export type TitleVertex = {
  u: number;
  v: number;
  x: number;
  y: number;
  vx: number;
  vy: number;
};
export type TitleSpringStep = {
  a: number;
  b: number;
  c: number;
  d: number;
  forceAt: (x: number, y: number) => number;
  directionX: number;
  directionY: number;
};
type Tile = {
  left: number;
  top: number;
  width: number;
  height: number;
  indices: number[];
};
type Word = {
  bitmap: HTMLCanvasElement;
  left: number;
  top: number;
  width: number;
  height: number;
  vertices: TitleVertex[];
  tiles: Tile[];
};

// Read browser line breaks without inserting spans or changing selectable text.
// Grapheme ranges preserve CJK, punctuation and combining characters.
function textLines(element: Element) {
  const lines: { text: string; rect: DOMRect }[] = [];
  const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT);
  const segmenter = new Intl.Segmenter(undefined, { granularity: "grapheme" });
  const range = document.createRange();
  while (walker.nextNode()) {
    const node = walker.currentNode;
    for (const { segment, index } of segmenter.segment(
      node.textContent || "",
    )) {
      range.setStart(node, index);
      range.setEnd(node, index + segment.length);
      const rect = range.getBoundingClientRect();
      if (!rect.height) continue;
      const previous = lines.at(-1);
      if (previous && Math.abs(previous.rect.top - rect.top) < 1) {
        previous.text += segment;
      } else if (segment.trim()) {
        lines.push({ text: segment, rect });
      }
    }
  }
  return lines.map((line) => ({ ...line, text: line.text.trimEnd() }));
}

export function advanceTitleVertex(
  vertex: TitleVertex,
  step: TitleSpringStep,
  force: number,
  limit = 8,
) {
  const { x, y, vx, vy } = vertex;
  vertex.x = Math.max(
    -limit,
    Math.min(
      limit,
      step.a * x + step.b * vx + (1 - step.a) * step.directionX * force,
    ),
  );
  vertex.y = Math.max(
    -limit,
    Math.min(
      limit,
      step.a * y + step.b * vy + (1 - step.a) * step.directionY * force,
    ),
  );
  vertex.vx = step.c * x + step.d * vx - step.c * step.directionX * force;
  vertex.vy = step.c * y + step.d * vy - step.c * step.directionY * force;
  const displacement = Math.hypot(vertex.x, vertex.y);
  if (displacement > limit) {
    vertex.x *= limit / displacement;
    vertex.y *= limit / displacement;
  }
  if (
    Math.max(
      Math.abs(vertex.x),
      Math.abs(vertex.y),
      Math.abs(vertex.vx),
      Math.abs(vertex.vy),
    ) < 0.002 &&
    !force
  ) {
    vertex.x = vertex.y = vertex.vx = vertex.vy = 0;
  }
}

export function createWaveTitle(
  host: HTMLElement,
  title: HTMLElement,
  invalidate: (rebuild?: boolean) => void,
  { maxDisplacement = 8, strength = 0.08, meshSpacing = 24 } = {},
) {
  const clearance = maxDisplacement + 4;
  let words: Word[] = [];
  let mask: HTMLCanvasElement | null = null;
  let maskLeft = 0;
  let maskTop = 0;
  let ratio = 1;
  let selected = false;
  let touch = false;
  let disposed = false;
  let layoutKey: string | null = null;

  function native() {
    if (title.dataset.titleRender !== "native")
      title.dataset.titleRender = "native";
  }
  function release() {
    layoutKey = null;
    for (const word of words) word.bitmap.width = word.bitmap.height = 0;
    if (mask) mask.width = mask.height = 0;
    mask = null;
    words = [];
    native();
  }
  function reset() {
    for (const word of words)
      for (const vertex of word.vertices)
        vertex.x = vertex.y = vertex.vx = vertex.vy = 0;
  }

  function rebuild(pixelRatio: number) {
    if (disposed) return;
    if (document.fonts.status !== "loaded") return release();
    const bounds = host.getBoundingClientRect();
    const scaleX = bounds.width / (host.offsetWidth || bounds.width);
    const scaleY = bounds.height / (host.offsetHeight || bounds.height);
    if (!scaleX || !scaleY) return release();
    const spans = Array.from(title.querySelectorAll("span, p"), (span) => ({
      span,
      style: getComputedStyle(span),
      rect: span.getBoundingClientRect(),
    }));
    const nextKey = JSON.stringify([
      pixelRatio,
      ...spans.map(({ span, style, rect }) => [
        span.textContent,
        style.fontWeight,
        style.fontSize,
        style.fontFamily,
        style.letterSpacing,
        style.fontKerning,
        style.textRendering,
        style.color,
        ((rect.left - bounds.left) / scaleX).toFixed(3),
        ((rect.top - bounds.top) / scaleY).toFixed(3),
        (rect.width / scaleX).toFixed(3),
        (rect.height / scaleY).toFixed(3),
      ]),
    ]);
    if (layoutKey === nextKey) return;
    release();
    ratio = pixelRatio;
    for (const { span, style } of spans) {
      const font = `${style.fontWeight} ${style.fontSize} ${style.fontFamily}`;
      // Unused fallback faces must not block the Latin brand on the English page.
      if (
        !document.fonts.check(
          `${style.fontWeight} ${style.fontSize} ${style.fontFamily.split(",")[0]}`,
          span.textContent || "",
        )
      ) {
        release();
        return;
      }
      for (const { text, rect } of textLines(span)) {
        const bitmap = document.createElement("canvas");
        const ctx = bitmap.getContext("2d");
        if (!ctx || !("letterSpacing" in ctx)) {
          release();
          return;
        }
        const configure = () => {
          ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
          ctx.font = font;
          ctx.letterSpacing =
            style.letterSpacing === "normal" ? "0px" : style.letterSpacing;
          ctx.fontKerning = style.fontKerning as CanvasFontKerning;
          ctx.textRendering = style.textRendering as CanvasTextRendering;
          ctx.fillStyle = style.color;
        };
        configure();
        const metrics = ctx.measureText(text);
        if (!Number.isFinite(metrics.fontBoundingBoxAscent)) {
          release();
          return;
        }
        if (!rect.width || !rect.height) {
          release();
          return;
        }
        const inkLeft =
          (rect.left - bounds.left) / scaleX -
          metrics.actualBoundingBoxLeft -
          padding;
        const inkTop =
          (rect.top - bounds.top) / scaleY +
          metrics.fontBoundingBoxAscent -
          metrics.actualBoundingBoxAscent -
          padding;
        // Rasterize the DOM's fractional origin into a pixel-aligned cache.
        // Drawing an integer bitmap at a half-pixel origin would blur small copy twice.
        const left = Math.floor(inkLeft * ratio) / ratio;
        const top = Math.floor(inkTop * ratio) / ratio;
        const offsetX = inkLeft - left;
        const offsetY = inkTop - top;
        const width = Math.ceil(
          metrics.actualBoundingBoxLeft +
            metrics.actualBoundingBoxRight +
            padding * 2 +
            offsetX,
        );
        const height = Math.ceil(
          metrics.actualBoundingBoxAscent +
            metrics.actualBoundingBoxDescent +
            padding * 2 +
            offsetY,
        );
        bitmap.width = Math.ceil(width * ratio);
        bitmap.height = Math.ceil(height * ratio);
        configure();
        ctx.fillText(
          text,
          padding + metrics.actualBoundingBoxLeft + offsetX,
          padding + metrics.actualBoundingBoxAscent + offsetY,
        );
        const pixels = ctx.getImageData(0, 0, bitmap.width, bitmap.height).data;
        const columns = Math.ceil(width / meshSpacing);
        const rows = Math.ceil(height / meshSpacing);
        const vertices = Array.from(
          { length: (columns + 1) * (rows + 1) },
          (_, index) => ({
            u: Math.min(width, (index % (columns + 1)) * meshSpacing),
            v: Math.min(
              height,
              Math.floor(index / (columns + 1)) * meshSpacing,
            ),
            x: 0,
            y: 0,
            vx: 0,
            vy: 0,
          }),
        );
        const tiles: Tile[] = [];
        for (let row = 0; row < rows; row++)
          for (let column = 0; column < columns; column++) {
            const x = column * meshSpacing,
              y = row * meshSpacing;
            const w = Math.min(meshSpacing, width - x),
              h = Math.min(meshSpacing, height - y);
            let occupied = false;
            for (
              let py = Math.floor(y * ratio);
              py < Math.ceil((y + h) * ratio) && !occupied;
              py++
            )
              for (
                let px = Math.floor(x * ratio);
                px < Math.ceil((x + w) * ratio);
                px++
              )
                if (pixels[(py * bitmap.width + px) * 4 + 3]) {
                  occupied = true;
                  break;
                }
            if (occupied) {
              const a = row * (columns + 1) + column;
              tiles.push({
                left: x,
                top: y,
                width: w,
                height: h,
                indices: [a, a + 1, a + columns + 2, a + columns + 1],
              });
            }
          }
        words.push({ bitmap, left, top, width, height, vertices, tiles });
      }
    }
    if (!words.length) return;
    maskLeft = Math.floor(
      Math.min(...words.map((word) => word.left)) - clearance - feather,
    );
    maskTop = Math.floor(
      Math.min(...words.map((word) => word.top)) - clearance - feather,
    );
    const right = Math.ceil(
      Math.max(...words.map((word) => word.left + word.width)) +
        clearance +
        feather,
    );
    const bottom = Math.ceil(
      Math.max(...words.map((word) => word.top + word.height)) +
        clearance +
        feather,
    );
    mask = document.createElement("canvas");
    mask.width = Math.ceil((right - maskLeft) * ratio);
    mask.height = Math.ceil((bottom - maskTop) * ratio);
    const ctx = mask.getContext("2d");
    if (!ctx) {
      release();
      return;
    }
    const image = ctx.createImageData(mask.width, mask.height);
    for (let py = 0; py < mask.height; py++)
      for (let px = 0; px < mask.width; px++) {
        const x = maskLeft + (px + 0.5) / ratio,
          y = maskTop + (py + 0.5) / ratio;
        let distance = feather;
        for (const word of words) {
          const dx = Math.max(
            word.left - clearance - x,
            0,
            x - word.left - word.width - clearance,
          );
          const dy = Math.max(
            word.top - clearance - y,
            0,
            y - word.top - word.height - clearance,
          );
          distance = Math.min(distance, Math.hypot(dx, dy));
        }
        const t = distance / feather;
        image.data[(py * mask.width + px) * 4 + 3] = Math.round(
          255 * 0.7 * (1 - t * t * (3 - 2 * t)),
        );
      }
    ctx.putImageData(image, 0, 0);
    layoutKey = nextKey;
  }

  function advance(step: TitleSpringStep) {
    for (const word of words)
      for (const vertex of word.vertices) {
        const force =
          selected || touch
            ? 0
            : step.forceAt(word.left + vertex.u, word.top + vertex.v) *
              strength;
        advanceTitleVertex(vertex, step, force, maxDisplacement);
      }
  }

  function triangle(
    ctx: CanvasRenderingContext2D,
    word: Word,
    tile: Tile,
    second: boolean,
  ) {
    const [a, b, c, d] = tile.indices.map((index) => word.vertices[index]);
    const first = second ? d : a,
      next = second ? c : b;
    const ax = (next.x - first.x) / tile.width + 1;
    const ay = (next.y - first.y) / tile.width;
    const bx = (second ? d.x - a.x : c.x - b.x) / tile.height;
    const by = (second ? d.y - a.y : c.y - b.y) / tile.height + 1;
    const tx = word.left + a.x - ax * tile.left - bx * tile.top + tile.left;
    const ty = word.top + a.y - ay * tile.left - by * tile.top + tile.top;
    ctx.save();
    ctx.setTransform(
      ratio * ax,
      ratio * ay,
      ratio * bx,
      ratio * by,
      ratio * tx,
      ratio * ty,
    );
    const points = second ? [a, c, d] : [a, b, c];
    const centerU = (points[0].u + points[1].u + points[2].u) / 3;
    const centerV = (points[0].v + points[1].v + points[2].v) / 3;
    ctx.beginPath();
    points.forEach((point, index) => {
      // Slight overlap removes antialias seams between adjacent black triangles.
      const scale = 1 + 3 / Math.min(tile.width, tile.height);
      const u = centerU + (point.u - centerU) * scale;
      const v = centerV + (point.v - centerV) * scale;
      if (index) ctx.lineTo(u, v);
      else ctx.moveTo(u, v);
    });
    ctx.closePath();
    ctx.clip();
    const x = Math.max(0, tile.left - 3),
      y = Math.max(0, tile.top - 3);
    const width = Math.min(word.width, tile.left + tile.width + 3) - x;
    const height = Math.min(word.height, tile.top + tile.height + 3) - y;
    ctx.drawImage(
      word.bitmap,
      x * ratio,
      y * ratio,
      width * ratio,
      height * ratio,
      x,
      y,
      width,
      height,
    );
    ctx.restore();
  }

  function draw(ctx: CanvasRenderingContext2D, moving: boolean) {
    if (!words.length || !mask) {
      native();
      return;
    }
    ctx.save();
    ctx.globalCompositeOperation = "destination-out";
    ctx.drawImage(
      mask,
      maskLeft,
      maskTop,
      mask.width / ratio,
      mask.height / ratio,
    );
    ctx.globalCompositeOperation = "source-over";
    if (!moving || selected || touch) {
      reset();
      native();
      ctx.restore();
      return;
    }
    if (title.dataset.titleRender !== "canvas")
      title.dataset.titleRender = "canvas";
    for (const word of words) {
      const warped = word.vertices.some(
        (vertex) => Math.abs(vertex.x) + Math.abs(vertex.y) > 0.02,
      );
      if (!warped) {
        ctx.drawImage(
          word.bitmap,
          0,
          0,
          word.width * ratio,
          word.height * ratio,
          word.left,
          word.top,
          word.width,
          word.height,
        );
        continue;
      }
      for (const tile of word.tiles) {
        if (
          tile.indices.every(
            (index) =>
              Math.abs(word.vertices[index].x) +
                Math.abs(word.vertices[index].y) <=
              0.02,
          )
        )
          ctx.drawImage(
            word.bitmap,
            tile.left * ratio,
            tile.top * ratio,
            tile.width * ratio,
            tile.height * ratio,
            word.left + tile.left,
            word.top + tile.top,
            tile.width,
            tile.height,
          );
        else {
          triangle(ctx, word, tile, false);
          triangle(ctx, word, tile, true);
        }
      }
    }
    ctx.restore();
  }

  function selection() {
    selected = Boolean(window.getSelection()?.containsNode(title, true));
    if (selected) reset();
    invalidate();
  }
  const fontsChanged = () => {
    if (!disposed) {
      layoutKey = null;
      invalidate(true);
    }
  };
  document.addEventListener("selectionchange", selection);
  document.fonts.addEventListener("loadingdone", fontsChanged);
  document.fonts.addEventListener("loadingerror", fontsChanged);
  if (document.fonts.status !== "loaded")
    void document.fonts.ready.then(fontsChanged);
  return {
    rebuild,
    advance,
    draw,
    reset,
    setTouch(value: boolean) {
      touch = value;
      if (value) reset();
    },
    dispose() {
      disposed = true;
      release();
      delete title.dataset.titleRender;
      document.removeEventListener("selectionchange", selection);
      document.fonts.removeEventListener("loadingdone", fontsChanged);
      document.fonts.removeEventListener("loadingerror", fontsChanged);
    },
  };
}
