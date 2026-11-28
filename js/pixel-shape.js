// A country's outline as an N×N grid of square cells, for Guess the Shape's pixel levels.
// Built from the precomputed 80×80 masks (js/raster.js), so it is deterministic and costs
// a few hundred thousand additions for the whole world — cheap enough to run at load.
//
// The grid is fitted to the mask's own bounding box rather than to the whole 80×80 frame:
// the frame keeps a margin, and at 12 cells across a margin is a quarter of the picture.

import { GRID } from './raster.js';

// A cell is filled when at least half of it is covered. A shape that loses most of its
// area that way steps down to a looser threshold, ending at "any coverage at all"; one
// that merely breaks into pieces it did not have (a thin country) steps down once. The
// result says which it took, so the audit can show the countries that needed it.
const LADDER = [0.5, 0.25, 0.02];
const KEEP = 0.6;
// Fewer cells than this and the grid is a blob, not a shape: kept out of the pixel levels.
export const MIN_CELLS = 5;

const bitAt = (mask, gx, gy) => {
  if (gx < 0 || gy < 0 || gx >= GRID || gy >= GRID) return 0;
  const bit = gy * GRID + gx;
  return (mask[bit >>> 5] >>> (bit & 31)) & 1;
};

export function maskBounds(mask) {
  let x0 = GRID, y0 = GRID, x1 = -1, y1 = -1;
  for (let gy = 0; gy < GRID; gy++) {
    for (let gx = 0; gx < GRID; gx++) {
      if (!bitAt(mask, gx, gy)) continue;
      if (gx < x0) x0 = gx; if (gx > x1) x1 = gx;
      if (gy < y0) y0 = gy; if (gy > y1) y1 = gy;
    }
  }
  return x1 < 0 ? null : { x0, y0, x1: x1 + 1, y1: y1 + 1 };
}

// Fraction of each output cell covered by the mask, area-weighted so a cell that spans
// part of a source pixel counts only that part.
export function coverage(mask, n) {
  const out = new Float64Array(n * n);
  const bb = maskBounds(mask);
  if (!bb) return out;
  const side = Math.max(bb.x1 - bb.x0, bb.y1 - bb.y0);
  const ox = (bb.x0 + bb.x1 - side) / 2, oy = (bb.y0 + bb.y1 - side) / 2;
  const step = side / n;
  for (let cy = 0; cy < n; cy++) {
    const sy0 = oy + cy * step, sy1 = sy0 + step;
    for (let cx = 0; cx < n; cx++) {
      const sx0 = ox + cx * step, sx1 = sx0 + step;
      let sum = 0;
      for (let py = Math.floor(sy0); py < sy1; py++) {
        const wy = Math.min(py + 1, sy1) - Math.max(py, sy0);
        if (wy <= 0) continue;
        for (let px = Math.floor(sx0); px < sx1; px++) {
          if (!bitAt(mask, px, py)) continue;
          const wx = Math.min(px + 1, sx1) - Math.max(px, sx0);
          if (wx > 0) sum += wx * wy;
        }
      }
      out[cy * n + cx] = sum / (step * step);
    }
  }
  return out;
}

function components(on, n) {
  const seen = new Uint8Array(n * n);
  let k = 0;
  for (let i = 0; i < n * n; i++) {
    if (!on[i] || seen[i]) continue;
    k++;
    const stack = [i];
    seen[i] = 1;
    while (stack.length) {
      const j = stack.pop();
      const x = j % n, y = (j - x) / n;
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          const X = x + dx, Y = y + dy;
          if (X < 0 || Y < 0 || X >= n || Y >= n) continue;
          const t = Y * n + X;
          if (on[t] && !seen[t]) { seen[t] = 1; stack.push(t); }
        }
      }
    }
  }
  return k;
}

// { n, cells: '0'/'1' string row by row, filled, threshold, fallback, degenerate }. A
// string, so a question carrying it stays plain data that compares and serialises like
// the rest.
export function pixelGrid(mask, n) {
  const cov = coverage(mask, n);
  const area = cov.reduce((a, b) => a + b, 0);
  const loosest = components(Array.from(cov, (v) => v >= LADDER[LADDER.length - 1]), n);
  let on, threshold;
  for (threshold of LADDER) {
    on = Array.from(cov, (v) => v >= threshold);
    const filled = on.filter(Boolean).length;
    const whole = threshold !== LADDER[0] || components(on, n) <= loosest + 1;
    if (filled >= Math.max(MIN_CELLS, area * KEEP) && whole) break;
  }
  const filled = on.filter(Boolean).length;
  return {
    n,
    cells: on.map((b) => (b ? '1' : '0')).join(''),
    filled,
    threshold,
    fallback: threshold !== LADDER[0],
    degenerate: filled < MIN_CELLS,
  };
}

const cache = new WeakMap();
export function pixelGridCached(mask, n) {
  let byN = cache.get(mask);
  if (!byN) cache.set(mask, (byN = new Map()));
  if (!byN.has(n)) byN.set(n, pixelGrid(mask, n));
  return byN.get(n);
}

export function hamming(a, b) {
  let d = 0;
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) d++;
  return d;
}
