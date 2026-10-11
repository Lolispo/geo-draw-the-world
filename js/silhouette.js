// A country's outline drawn to a canvas, normalized to fit. Lifted out of the country
// panel when the shapes table (TODOS #51) needed the same drawing at thumbnail size —
// two copies of a bbox-and-scale loop is how they drift apart.

import { getCountryByCode } from './geo-data.js';
import { traceRing, multiPolygonBoundingBox, fitBounds } from './utils.js';
import { GRID, normalizeMultiPolygon } from './raster.js';

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

  const { scale, ox, oy } = fitBounds(multiPolygonBoundingBox(country.polygons), size, size, pad);

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

// Your drawing laid over a country, in the frame the match was scored in (TODOS #58).
// A number saying 44 does not show you *why*; the overlap does. Both outlines go
// through js/raster.js's normalisation, so what you see is exactly the pair of masks
// that produced the score — not a prettier approximation of it.
export function drawShapeOverlay(canvas, playerPolygons, countryPolygons, { size = 86, color = '#7EA6E0' } = {}) {
  const ctx = canvas.getContext('2d');
  const dpr = window.devicePixelRatio || 1;
  canvas.width = canvas.height = size * dpr;
  canvas.style.width = canvas.style.height = `${size}px`;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, size, size);

  // The comparison frame is -GRID/2..GRID/2 in both axes, y already downward.
  const k = size / GRID;
  const place = (polys) => normalizeMultiPolygon(polys)
    .map((ring) => ring.map(([x, y]) => [(x + GRID / 2) * k, (y + GRID / 2) * k]));

  // countryPolygons null draws the drawing on its own — the "your shape" thumbnail.
  if (countryPolygons) {
    ctx.beginPath();
    for (const ring of place(countryPolygons)) traceRing(ctx, ring, true);
    ctx.fillStyle = color + '55';
    ctx.fill('nonzero');
    ctx.lineWidth = 1;
    ctx.strokeStyle = color;
    ctx.stroke();
  }

  ctx.beginPath();
  for (const ring of place(playerPolygons)) traceRing(ctx, ring, true);
  ctx.lineJoin = 'round';
  // Haloed, because a pale line over a pale country fill loses its edge exactly where
  // the overlap is the thing you are trying to see.
  ctx.lineWidth = 3;
  ctx.strokeStyle = 'rgba(0,0,0,0.55)';
  ctx.stroke();
  ctx.lineWidth = 1.5;
  ctx.strokeStyle = '#e6edf3';
  ctx.stroke();
}
