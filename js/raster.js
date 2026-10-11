// Rasterised shape comparison. Shared by the round's shape score (js/scoring.js) and the
// match panel (TODOS #58), and imported by scripts/build-shape-masks.mjs so the
// precomputed country masks are produced by exactly this arithmetic. Two copies of it is
// how a precomputed mask would quietly stop meaning the same thing as a live score.
//
// Normalisation is player-independent — centroid-centred, long side scaled to a fixed
// fraction of a fixed grid — which is the property that lets a country's raster be a
// build-time constant at all.

import { multiPolygonBoundingBox, multiPolygonCentroid, pointInMultiPolygon } from './utils.js';

export const GRID = 80;
export const MASK_WORDS = (GRID * GRID) / 32;   // 6400 bits -> 200 words -> 800 bytes

// Centre on the centroid and scale so the long side is `targetSize`. The 0.8 default
// leaves a margin, so a normalised shape never touches the frame edge.
export function normalizeMultiPolygon(polygons, targetSize = GRID * 0.8) {
  const bb = multiPolygonBoundingBox(polygons);
  const centroid = multiPolygonCentroid(polygons);
  const scale = targetSize / Math.max(bb.width || 1, bb.height || 1);

  return polygons.map(poly =>
    poly.map(([x, y]) => [
      (x - centroid[0]) * scale,
      (y - centroid[1]) * scale
    ])
  );
}

// An island smaller than this across gets a dot of its own instead of disappearing
// (TODOS #73). The Maldives arrive as 518 atolls spanning the whole frame and rasterised
// honestly fill ONE cell of 6400, so every drawing of them scored zero against an empty
// mask. This is the same fix js/silhouette.js already makes for the same reason
// (MIN_ISLAND_PX, TODOS #53): an archipelago should read as an archipelago, not as
// nothing. Kept small — it must not fatten a country that was never specks.
const MIN_SPECK_CELLS = 2;

// Normalise, then rasterise onto the fixed -GRID/2..GRID/2 frame as a bitmask.
export function rasterizeToMask(polygons) {
  const norm = normalizeMultiPolygon(polygons);
  const mask = new Uint32Array(MASK_WORDS);
  const half = GRID / 2;
  const set = (gx, gy) => {
    if (gx < 0 || gy < 0 || gx >= GRID || gy >= GRID) return;
    const bit = gy * GRID + gx;
    mask[bit >>> 5] |= 1 << (bit & 31);
  };

  // Rings big enough to rasterise go through point-in-polygon together, so nonzero
  // winding still cuts holes (Lesotho out of South Africa). The rest become specks.
  const solid = [];
  const specks = [];
  for (const ring of norm) {
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    for (const [x, y] of ring) {
      if (x < x0) x0 = x; if (x > x1) x1 = x;
      if (y < y0) y0 = y; if (y > y1) y1 = y;
    }
    if (Math.max(x1 - x0, y1 - y0) < MIN_SPECK_CELLS) specks.push([(x0 + x1) / 2, (y0 + y1) / 2]);
    else solid.push(ring);
  }

  if (solid.length) {
    for (let gy = 0; gy < GRID; gy++) {
      const y = -half + gy + 0.5;
      for (let gx = 0; gx < GRID; gx++) {
        const x = -half + gx + 0.5;
        if (pointInMultiPolygon(x, y, solid)) set(gx, gy);
      }
    }
  }

  const r = MIN_SPECK_CELLS / 2;
  for (const [cx, cy] of specks) {
    const gx = cx + half - 0.5, gy = cy + half - 0.5;
    for (let dy = Math.floor(gy - r); dy <= Math.ceil(gy + r); dy++) {
      for (let dx = Math.floor(gx - r); dx <= Math.ceil(gx + r); dx++) {
        if ((dx - gx) ** 2 + (dy - gy) ** 2 <= r * r) set(dx, dy);
      }
    }
  }
  return mask;
}

function popcount(v) {
  v = v - ((v >>> 1) & 0x55555555);
  v = (v & 0x33333333) + ((v >>> 2) & 0x33333333);
  return (((v + (v >>> 4)) & 0x0f0f0f0f) * 0x01010101) >>> 24;
}

export function maskCount(mask) {
  let n = 0;
  for (let i = 0; i < mask.length; i++) n += popcount(mask[i]);
  return n;
}

export function maskIoU(a, b) {
  let inter = 0, union = 0;
  for (let i = 0; i < a.length; i++) {
    inter += popcount(a[i] & b[i]);
    union += popcount(a[i] | b[i]);
  }
  return union === 0 ? 0 : inter / union;
}

export function computeIoU(polys1, polys2) {
  return maskIoU(rasterizeToMask(polys1), rasterizeToMask(polys2));
}
