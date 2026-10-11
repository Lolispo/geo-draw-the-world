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

// Normalise, then rasterise onto the fixed -GRID/2..GRID/2 frame as a bitmask.
export function rasterizeToMask(polygons) {
  const norm = normalizeMultiPolygon(polygons);
  const mask = new Uint32Array(MASK_WORDS);
  const half = GRID / 2;

  for (let gy = 0; gy < GRID; gy++) {
    const y = -half + gy + 0.5;
    for (let gx = 0; gx < GRID; gx++) {
      const x = -half + gx + 0.5;
      if (pointInMultiPolygon(x, y, norm)) {
        const bit = gy * GRID + gx;
        mask[bit >>> 5] |= 1 << (bit & 31);
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
