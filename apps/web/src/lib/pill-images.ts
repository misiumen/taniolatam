import { PILL_IMAGES, type PillColors } from "./map-pins";

/**
 * Pill backgrounds for the MapLibre symbol layer, drawn on a canvas at runtime and registered
 * with `map.addImage`. Each image is a small rounded rectangle whose straight middle stretches
 * (`stretchX` / `stretchY`) and whose `content` box is where the text goes, so
 * `icon-text-fit: both` grows the pill around any label while the 12 px corners stay crisp.
 */

/** Logical px: transparent margin (room for the shadow and a 2 px border), corner radius. */
const MARGIN = 4;
const RADIUS = 12;
/** Text inset from the pill edge. */
const PAD_X = 9;
const PAD_Y = 6;
/** Image side: two corners, the margin around them and a 2 px stretchable middle. */
const SIZE = 2 * (MARGIN + RADIUS) + 2;

export interface PillImage {
  id: string;
  image: ImageData;
  options: {
    pixelRatio: number;
    stretchX: [number, number][];
    stretchY: [number, number][];
    content: [number, number, number, number];
  };
}

interface PillLook {
  fill: string;
  stroke: string;
  strokeWidth: number;
}

function drawPill(look: PillLook, pr: number): ImageData {
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = SIZE * pr;
  const ctx = canvas.getContext("2d")!;
  ctx.scale(pr, pr);
  const inset = MARGIN + look.strokeWidth / 2;
  const side = SIZE - 2 * inset;
  ctx.beginPath();
  ctx.roundRect(inset, inset, side, side, RADIUS - look.strokeWidth / 2);
  ctx.shadowColor = "rgba(0, 0, 0, 0.18)";
  ctx.shadowBlur = 3;
  ctx.shadowOffsetY = 1;
  ctx.fillStyle = look.fill;
  ctx.fill();
  ctx.shadowColor = "transparent";
  ctx.lineWidth = look.strokeWidth;
  ctx.strokeStyle = look.stroke;
  ctx.stroke();
  return ctx.getImageData(0, 0, canvas.width, canvas.height);
}

/** The five pill images for the given palette (re-created when the colour scheme changes). */
export function pillImages(c: PillColors, pixelRatio = 2): PillImage[] {
  const pr = Math.max(1, Math.round(pixelRatio));
  const p = (n: number) => n * pr;
  const options: PillImage["options"] = {
    pixelRatio: pr,
    stretchX: [[p(MARGIN + RADIUS), p(SIZE - MARGIN - RADIUS)]],
    stretchY: [[p(MARGIN + RADIUS), p(SIZE - MARGIN - RADIUS)]],
    content: [
      p(MARGIN + PAD_X),
      p(MARGIN + PAD_Y),
      p(SIZE - MARGIN - PAD_X),
      p(SIZE - MARGIN - PAD_Y),
    ],
  };
  const looks: [string, PillLook][] = [
    [PILL_IMAGES.default, { fill: c.surface, stroke: c.border, strokeWidth: 1 }],
    [PILL_IMAGES.accent, { fill: c.accent, stroke: c.accent, strokeWidth: 1 }],
    [PILL_IMAGES.cluster, { fill: c.surface, stroke: c.text, strokeWidth: 1 }],
    [PILL_IMAGES.active, { fill: c.surface, stroke: c.accent, strokeWidth: 2 }],
    [PILL_IMAGES.accentActive, { fill: c.accent, stroke: c.text, strokeWidth: 2 }],
  ];
  return looks.map(([id, look]) => ({ id, image: drawPill(look, pr), options }));
}
