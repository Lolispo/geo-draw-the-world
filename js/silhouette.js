// A country's outline drawn to a canvas, normalized to fit. Lifted out of the country
// panel when the shapes table (TODOS #51) needed the same drawing at thumbnail size —
// two copies of a bbox-and-scale loop is how they drift apart.

import { getCountryByCode } from './geo-data.js';
import { traceRing } from './utils.js';

// Normalizing to the bounding box means the canvas shows the *outline*, not the size:
// Russia and Monaco both fill their box. Anything comparing countries by area has to
// say so itself.
export async function drawSilhouette(canvas, code, entity, { size = 150, pad = 14 } = {}) {
  const ctx = canvas.getContext('2d');
  const dpr = window.devicePixelRatio || 1;
  canvas.width = size * dpr;
  canvas.height = size * dpr;
  canvas.style.width = canvas.style.height = `${size}px`;
  ctx.scale(dpr, dpr);

  if (entity && entity.hasGeometry === false) { shapeFallback(ctx, size); return false; }

  const country = await getCountryByCode(code);
  if (!country || !country.polygons || !country.polygons.length) {
    shapeFallback(ctx, size);
    return false;
  }

  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const ring of country.polygons) {
    for (const [x, y] of ring) {
      if (x < minX) minX = x; if (x > maxX) maxX = x;
      if (y < minY) minY = y; if (y > maxY) maxY = y;
    }
  }
  const w = maxX - minX || 1, h = maxY - minY || 1;
  const scale = Math.min((size - pad * 2) / w, (size - pad * 2) / h);
  const ox = (size - w * scale) / 2 - minX * scale;
  const oy = (size - h * scale) / 2 - minY * scale;

  // A scattered territory normalizes to the ocean between its islands: St Helena spans
  // 32° of latitude, so at 150px each of its four islands is about a pixel and the
  // canvas came out blank. Keep every island in its true position — that is what the
  // country is — but give one too small to see a dot of its own, so an archipelago
  // reads as an archipelago instead of as nothing (TODOS #53).
  const MIN_ISLAND_PX = 3.5;
  const specks = [];
  ctx.beginPath();
  for (const ring of country.polygons) {
    const pts = ring.map(([x, y]) => [x * scale + ox, y * scale + oy]);
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    for (const [x, y] of pts) {
      if (x < x0) x0 = x; if (x > x1) x1 = x;
      if (y < y0) y0 = y; if (y > y1) y1 = y;
    }
    if (Math.max(x1 - x0, y1 - y0) < MIN_ISLAND_PX) { specks.push([(x0 + x1) / 2, (y0 + y1) / 2]); continue; }
    traceRing(ctx, pts, true);
  }
  // Added to the same path so they take the same fill and stroke as the real outlines.
  for (const [cx, cy] of specks) {
    ctx.moveTo(cx + MIN_ISLAND_PX / 2, cy);
    ctx.arc(cx, cy, MIN_ISLAND_PX / 2, 0, Math.PI * 2);
  }
  ctx.fillStyle = country.color || '#7EA6E0';
  ctx.fill('nonzero');
  ctx.lineJoin = 'round';
  ctx.lineWidth = 1;
  ctx.strokeStyle = 'rgba(0,0,0,0.35)';
  ctx.stroke();
  return true;
}

export function shapeFallback(ctx, size) {
  ctx.fillStyle = 'rgba(127,127,127,0.15)';
  ctx.fillRect(0, 0, size, size);
  ctx.fillStyle = 'rgba(127,127,127,0.6)';
  ctx.font = `${Math.max(9, Math.round(size / 11))}px system-ui, sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('no shape', size / 2, size / 2);
}
