// Build data/shape-masks.json — one rasterised bitmask per country, for the shape-match
// panel (TODOS #58).
//
// Matching a drawing against every country is 251 IoUs. Done honestly that is 251
// rasterisations of ~6400 point-in-polygon tests each, which is far too slow to do while
// someone is looking at a results screen. But js/raster.js normalises a shape to a frame
// that depends only on the shape — centroid-centred, long side scaled to a fixed size —
// so a country's raster never changes. Precompute it here and a match becomes 200 words
// of bitwise AND/OR per country: the whole pool in under a millisecond.
//
// The masks are produced by importing js/raster.js rather than reimplementing it, so a
// change to the live scoring arithmetic cannot leave stale masks behind that still look
// plausible. scripts/check-shape-masks.mjs asserts the two agree.
//
// Usage: node scripts/build-shape-masks.mjs
import { readFileSync, writeFileSync, readdirSync } from 'node:fs';
import { GRID, MASK_WORDS, rasterizeToMask } from '../js/raster.js';

// Geometry only — no names, no pool flags. Which countries are eligible is
// inCountryPool()'s rule in js/datasets.js, read live so the territories toggle and the
// Channel Islands aggregate stay decided in one place rather than frozen in here.

const entities = JSON.parse(readFileSync('data/entities.json', 'utf8')).entities;
const codes = readdirSync('data/shapes').filter((f) => f.endsWith('.json')).map((f) => f.slice(0, -5)).sort();

const masks = {};
let count = 0, skipped = 0;
for (const code of codes) {
  if (!entities[code]) { console.warn(`  no entity for shape ${code} — skipped`); skipped++; continue; }
  const { polygons } = JSON.parse(readFileSync(`data/shapes/${code}.json`, 'utf8'));
  if (!polygons?.length) { console.warn(`  no polygons for ${code} — skipped`); skipped++; continue; }
  masks[code] = Buffer.from(rasterizeToMask(polygons).buffer).toString('base64');
  count++;
}

const out = { grid: GRID, words: MASK_WORDS, masks };
writeFileSync('data/shape-masks.json', JSON.stringify(out));

const bytes = JSON.stringify(out).length;
console.log(
  `data/shape-masks.json — ${count} masks${skipped ? `, ${skipped} skipped` : ''}, ` +
  `${GRID}x${GRID}, ${(bytes / 1024).toFixed(0)} KB`,
);
