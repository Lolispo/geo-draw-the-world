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

  ctx.beginPath();
  for (const ring of country.polygons) {
    traceRing(ctx, ring.map(([x, y]) => [x * scale + ox, y * scale + oy]), true);
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
